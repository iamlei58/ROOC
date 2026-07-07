const publicState = {
  client: null,
  environmentState: null,
  events: [],
  event: null,
  pendingDrawId: "",
  refreshTimer: null,
  isRefreshing: false,
  knownDrawIds: new Set(),
  lastLiveResultKey: "",
  liveDialogId: "",
  liveRollerTimer: null,
  liveRollerLabels: [],
  liveRollerIndex: 0,
  liveAnimationChoice: null,
  liveAnimationMode: "",
  liveRevealMode: "roller",
  liveFireworks: null,
  liveEffectCleanupId: null,
  tableRenderKeys: new Map()
};

const PUBLIC_REFRESH_INTERVAL = 2500;
const PUBLIC_DRAW_EFFECT_CLEANUP_MS = 2600;
const PUBLIC_TABLE_RENDER_LIMIT = 120;

const drawStatusText = {
  pending: "待處理",
  accepted: "確認得獎",
  declined: "放棄重抽",
  transferred: "指定轉讓"
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadOptionalLocalConfig();
  hydrateConfig();
  bindPublicPage();
  await initializePublicPage();
  refreshIcons();
});

function $(selector) {
  return document.querySelector(selector);
}

function setText(selector, text) {
  window.ROOC_VUE_TEXT_CONTENT?.render?.({
    targetSelector: selector,
    text: text ?? ""
  });
}

function bindPublicPage() {
  $("#public-event-form").addEventListener("submit", handleLoadPublicEvent);
  $("#refresh-public-events").addEventListener("click", handleRefreshPublicEvents);
  $("#public-detail").addEventListener("click", handlePublicRosterButtonClick);
  $("#public-draw-table").addEventListener("click", handleDrawVerifyClick);
  $("#close-public-live").addEventListener("click", closePublicLiveDialog);

  const rosterDialog = $("#public-roster-dialog");
  rosterDialog.addEventListener("click", (event) => {
    if (event.target === rosterDialog) closePublicRosterDialog();
  });
  rosterDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closePublicRosterDialog();
  });

  const auditDialog = $("#audit-dialog");
  auditDialog.addEventListener("click", (event) => {
    if (event.target === auditDialog) closeAuditDialog();
  });
  auditDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAuditDialog();
  });

  const liveDialog = $("#public-live-dialog");
  liveDialog.addEventListener("click", (event) => {
    if (event.target === liveDialog && liveDialog.classList.contains("is-revealed")) {
      closePublicLiveDialog();
    }
  });
  liveDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (liveDialog.classList.contains("is-revealed")) {
      closePublicLiveDialog();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPublicAutoRefresh();
      return;
    }

    void refreshPublicSnapshot();
    startPublicAutoRefresh();
  });
}

async function initializePublicPage() {
  if (!publicState.client) return;

  const params = new URLSearchParams(window.location.search);
  const preferredSlug = params.get("event") || params.get("slug") || "";
  publicState.pendingDrawId = params.get("draw") || "";

  await refreshPublicEvents(preferredSlug);
  const defaultSlug = preferredSlug
    || publicState.events.find((event) => event.status === "live")?.slug
    || publicState.events[0]?.slug
    || "";

  if (defaultSlug) {
    await loadPublicEvent(defaultSlug, { resetSeen: true });
  }
}

function hydrateConfig() {
  publicState.environmentState = resolveSupabaseEnvironment();
  const runtime = publicState.environmentState.current || {};
  configureClient(runtime.url, runtime.anonKey);
  bindEnvironmentSwitcher();
  if (publicState.environmentState.requestedEnvironmentMissing) {
    showToast(`找不到資料庫環境「${publicState.environmentState.requestedEnvironmentMissing}」，已改用預設設定。`, "warning");
  }
  if (!publicState.client) {
    showToast(`「${getActiveEnvironmentLabel()}」Supabase 尚未設定，無法載入公開驗證資料。`, "error");
  }
}

function configureClient(url, anonKey) {
  const cleanUrl = String(url || "").trim();
  const cleanKey = String(anonKey || "").trim();

  if (!cleanUrl || !cleanKey || !window.supabase?.createClient) {
    publicState.client = null;
    renderConnection(false);
    return;
  }

  publicState.client = window.supabase.createClient(cleanUrl, cleanKey);
  renderConnection(true);
}

function renderConnection(connected) {
  const text = connected && publicState.environmentState && !publicState.environmentState.isDefault
    ? `${getActiveEnvironmentLabel()} 已連線`
    : connected ? "Supabase 已連線" : "尚未連線";

  window.ROOC_VUE_CONNECTION_PILL?.render?.({
    targetSelector: "#connection-pill",
    connected,
    isTestEnvironment: publicState.environmentState && !publicState.environmentState.isDefault,
    text
  });
}

async function loadOptionalLocalConfig() {
  if (window.ROOC_CONFIG?.loadOptionalLocalConfig) {
    await window.ROOC_CONFIG.loadOptionalLocalConfig();
    return;
  }

  const runtime = window.ROOC_SUPABASE_CONFIG || {};
  const productionRuntime = runtime.environments?.production || runtime;
  if (productionRuntime.url && productionRuntime.anonKey) return;

  try {
    await loadScript("config.local.js");
  } catch {
    // Local config is optional. Deployment config is generated into config.js.
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function resolveSupabaseEnvironment() {
  if (window.ROOC_CONFIG?.resolveSupabaseEnvironment) {
    return window.ROOC_CONFIG.resolveSupabaseEnvironment();
  }

  const runtime = window.ROOC_SUPABASE_CONFIG || {};
  const productionRuntime = runtime.environments?.production || runtime;
  return {
    defaultEnvironment: "production",
    environments: [
      {
        id: "production",
        label: "正式資料庫",
        url: productionRuntime.url,
        anonKey: productionRuntime.anonKey
      }
    ],
    current: {
      id: "production",
      label: "正式資料庫",
      url: productionRuntime.url,
      anonKey: productionRuntime.anonKey
    },
    isDefault: true,
    requestedEnvironmentMissing: ""
  };
}

function bindEnvironmentSwitcher() {
  if (window.ROOC_CONFIG?.mountEnvironmentSwitcher && publicState.environmentState) {
    window.ROOC_CONFIG.mountEnvironmentSwitcher(publicState.environmentState);
  }
}

function getActiveEnvironmentLabel() {
  return publicState.environmentState?.current?.label || "正式資料庫";
}

async function handleRefreshPublicEvents() {
  await withBusy($("#public-event-form"), async () => {
    await refreshPublicEvents($("#public-event-select").value);
    showToast("公開活動已刷新。", "success");
  });
}

async function handleLoadPublicEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const slug = cleanRequired(new FormData(form).get("slug"), "請選擇活動。");

  await withBusy(form, async () => {
    await loadPublicEvent(slug, { resetSeen: true });
  });
}

async function refreshPublicEvents(preferredSlug = "") {
  const rows = await rpc("list_public_raffle_events", {});
  publicState.events = rows || [];
  renderPublicEventOptions(preferredSlug);
}

function renderPublicEventOptions(preferredSlug = "") {
  const select = $("#public-event-select");
  const current = preferredSlug || select.value;
  const options = publicState.events.map((event) => ({
    value: event.slug,
    label: `${event.title} / ${event.status === "closed" ? "已結束" : "進行中"} / ${formatDate(event.closed_at || event.last_draw_at || event.created_at)}`
  }));

  window.ROOC_VUE_SELECT_OPTIONS?.render?.({
    targetSelector: "#public-event-select",
    placeholder: "選擇活動",
    options,
    value: current,
    disabled: publicState.events.length === 0
  });
  setText("#public-status", publicState.events.length === 0 ? "沒有紀錄" : `${publicState.events.length} 場`);
}

async function loadPublicEvent(slug, options = {}) {
  const cleanSlug = cleanRequired(slug, "請選擇活動。");
  const previousSlug = publicState.event?.slug || "";
  const resetSeen = Boolean(options.resetSeen || previousSlug !== cleanSlug);
  const previousKnownDrawIds = resetSeen ? new Set() : new Set(publicState.knownDrawIds);

  const [rows, liveDraw] = await Promise.all([
    rpc("get_public_raffle_event", {
      p_slug: cleanSlug
    }),
    rpc("get_public_raffle_live_draw", {
      p_slug: cleanSlug
    })
  ]);

  if (!rows || rows.length === 0) {
    throw new Error("找不到活動。");
  }

  publicState.event = normalizePublicEvent({
    ...rows[0],
    live_draw: liveDraw || null
  });
  if (resetSeen) {
    publicState.lastLiveResultKey = "";
    publicState.tableRenderKeys.clear();
  }
  if (!options.preserveSelect) {
    $("#public-event-select").value = publicState.event.slug;
  }
  renderPublicEvent();
  const newDraws = resetSeen
    ? []
    : publicState.event.draws.filter((draw) => !previousKnownDrawIds.has(draw.id));
  handlePublicLiveState(publicState.event, newDraws);
  publicState.knownDrawIds = new Set(publicState.event.draws.map((draw) => draw.id));
  startPublicAutoRefresh();

  if (publicState.pendingDrawId) {
    const draw = publicState.event.draws.find((item) => item.id === publicState.pendingDrawId);
    if (draw) {
      openAuditDialog(draw);
      publicState.pendingDrawId = "";
    }
  }
}

function normalizePublicEvent(event) {
  return {
    ...event,
    prizes: asArray(event.prizes),
    awards: asArray(event.awards),
    draws: asArray(event.draws).map((draw) => normalizePublicDraw(draw, event)),
    live_draw: event.live_draw || null
  };
}

function normalizePublicDraw(draw, event = {}) {
  const source = draw && typeof draw === "object" ? draw : {};
  const normalized = { ...source };
  if (!normalized.event_id && event?.id) {
    normalized.event_id = event.id;
  }

  if (source.audit && typeof source.audit === "object") {
    normalized.audit = normalizePublicAudit(source.audit, source);
    return normalized;
  }

  const hasFlatAudit = [
    "step_probability",
    "round_probability",
    "eligible_count",
    "selected_index",
    "eligible_manifest_hash",
    "random_seed",
    "random_token"
  ].some((key) => source[key] != null);

  if (hasFlatAudit) {
    normalized.audit = normalizePublicAudit(source, source);
  }

  return normalized;
}

function normalizePublicAudit(audit, draw = {}) {
  const source = audit && typeof audit === "object" ? audit : {};
  const eligibleMembers = asArray(source.eligible_members);

  return {
    id: source.id || source.audit_id || "",
    algorithm: source.algorithm || (source.selector_hash ? "sha256" : ""),
    round_id: source.round_id || "",
    round_draw_count: source.round_draw_count ?? 1,
    round_index: source.round_index ?? draw.slot_number ?? source.selected_index ?? "",
    active_member_count: source.active_member_count ?? "",
    excluded_count_before: source.excluded_count_before ?? "",
    provider_excluded: Boolean(source.provider_excluded),
    eligible_count: source.eligible_count ?? "",
    step_probability: source.step_probability ?? "",
    round_probability: source.round_probability ?? source.step_probability ?? "",
    prize_remaining_before: source.prize_remaining_before ?? "",
    random_seed: source.random_seed || source.random_token || "",
    eligible_manifest: source.eligible_manifest || "",
    eligible_manifest_hash: source.eligible_manifest_hash || "",
    selector_hash: source.selector_hash || "",
    selected_index: source.selected_index ?? "",
    eligible_members: eligibleMembers
  };
}

function renderPublicEvent() {
  const event = publicState.event;
  if (!event) return;

  $("#public-empty").hidden = true;
  $("#public-detail").hidden = false;
  setText("#public-status", event.status === "closed" ? "已結束" : "進行中");
  const eventStatus = event.status === "closed" ? "已結束" : "進行中";
  const eventMeta = event.closed_at
    ? `結束時間：${formatDate(event.closed_at)}`
    : `建立時間：${formatDate(event.created_at)}`;
  window.ROOC_VUE_PUBLIC_EVENT_HEADER?.render?.({
    targetSelector: "#public-event-header",
    title: event.title,
    status: eventStatus,
    meta: eventMeta
  });
  renderPublicStats(event);

  syncPublicRosterButtons();
  renderPublicLiveBanner(event.live_draw);
  renderPrizeRows();
  renderAwardRows();
  renderDrawRows();
  refreshIcons();
}

function renderPublicStats(event) {
  return Boolean(window.ROOC_VUE_PUBLIC_STATS?.render?.({
    targetSelector: "#public-stats-grid",
    stats: [
      { label: "獎項數", value: event.prize_count ?? event.prizes.length, rosterKey: "public_prizes" },
      { label: "中獎紀錄", value: event.award_count ?? event.awards.length, rosterKey: "public_awards" },
      { label: "抽獎紀錄", value: event.draw_count ?? event.draws.length, rosterKey: "public_draws" },
      { label: "驗證快照", value: event.draws.filter((draw) => draw.audit).length, rosterKey: "public_audits" }
    ],
    onRendered: syncPublicRosterButtons
  }));
}

function startPublicAutoRefresh() {
  stopPublicAutoRefresh();
  if (!publicState.client || !publicState.event?.slug || publicState.event.status !== "live" || document.hidden) return;

  publicState.refreshTimer = window.setInterval(refreshPublicSnapshot, PUBLIC_REFRESH_INTERVAL);
}

function stopPublicAutoRefresh() {
  if (!publicState.refreshTimer) return;
  window.clearInterval(publicState.refreshTimer);
  publicState.refreshTimer = null;
}

async function refreshPublicSnapshot() {
  if (!publicState.client || !publicState.event?.slug || publicState.isRefreshing || document.hidden) return;
  if (isPublicEventSelectActive()) return;

  publicState.isRefreshing = true;
  try {
    await loadPublicEvent(publicState.event.slug, { preserveSelect: true });
  } catch {
    // Auto refresh stays quiet so viewers are not interrupted by transient network hiccups.
  } finally {
    publicState.isRefreshing = false;
  }
}

function isPublicEventSelectActive() {
  const select = $("#public-event-select");
  return document.activeElement === select || select.matches(":focus");
}

function renderPublicLiveBanner(live) {
  window.ROOC_VUE_PUBLIC_LIVE_BANNER?.render?.({
    targetSelector: "#public-live-banner",
    live
  });
}

function handlePublicLiveState(event, newDraws = []) {
  const live = event.live_draw;
  renderPublicLiveBanner(live);

  if (live?.status === "drawing") {
    openPublicLiveAnimation(live);
    return;
  }

  if (live?.status === "failed") {
    revealPublicLiveFailure(live);
    return;
  }

  const resultDraws = getPublicLiveResultDraws(event, live, newDraws);
  const resultKey = resultDraws.map((draw) => draw.id).sort().join(",");

  if (resultKey && resultKey !== publicState.lastLiveResultKey) {
    if (!$("#public-live-dialog").open) {
      openPublicLiveAnimation(live || resultDraws[0] || {});
    }
    revealPublicLiveResults(resultDraws, live);
    publicState.lastLiveResultKey = resultKey;
    return;
  }

  const dialog = $("#public-live-dialog");
  if (!live && dialog.open && !dialog.classList.contains("is-revealed")) {
    closePublicLiveDialog();
  }
}

function getPublicLiveResultDraws(event, live, newDraws = []) {
  const liveDrawIds = asArray(live?.result_draw_ids).filter(Boolean);
  if (liveDrawIds.length > 0) {
    const liveSet = new Set(liveDrawIds);
    return event.draws.filter((draw) => liveSet.has(draw.id));
  }

  return newDraws;
}

function resolvePublicLiveAnimationChoice(live = {}, draws = []) {
  const seed = live.id || draws[0]?.id || `${publicState.event?.slug || "public"}:${live.prize_name || "draw"}`;
  return window.ROOC_DRAW_ANIMATION?.resolveChoice(seed) || {
    visualMode: "classic",
    revealMode: "roller"
  };
}

function renderPublicLiveReveal(payload = {}) {
  return Boolean(window.ROOC_VUE_DRAW_REVEAL?.render?.({
    targetSelector: "#public-live-reveal-content",
    resultListId: "public-live-results",
    flipListId: "public-live-flip-results",
    ...payload
  }));
}

function openPublicLiveAnimation(live = {}) {
  const dialog = $("#public-live-dialog");
  const currentLiveId = live.id || "";

  if (dialog.open && publicState.liveDialogId === currentLiveId && !dialog.classList.contains("is-revealed")) {
    setText("#public-live-prize", live.prize_name || "抽獎");
    return;
  }

  stopPublicLiveRoller();
  clearPublicLiveEffectCleanup();
  stopPublicLiveFireworks();
  window.ROOC_DRAW_ANIMATION.clearVisualModeClasses(dialog);
  window.ROOC_DRAW_ANIMATION.clearRevealModeClasses(dialog);
  dialog.classList.remove("is-revealed", "has-multiple-results", "has-flip-results");
  publicState.liveAnimationChoice = resolvePublicLiveAnimationChoice(live);
  publicState.liveAnimationMode = publicState.liveAnimationChoice.visualMode;
  publicState.liveRevealMode = publicState.liveAnimationChoice.revealMode;
  dialog.classList.add(`mode-${publicState.liveAnimationMode}`);
  dialog.classList.add(`reveal-${publicState.liveRevealMode}`);
  publicState.liveDialogId = currentLiveId;

  setText("#public-live-phase", window.ROOC_DRAW_ANIMATION.phaseText(
    publicState.liveAnimationMode,
    live.draw_count || 1,
    publicState.liveRevealMode
  ));
  setText("#public-live-prize", live.prize_name || "抽獎");
  renderPublicLiveReveal({
    labels: [],
    rows: [],
    placeholderCount: publicState.liveRevealMode === "flip" ? live.draw_count || 1 : 0,
    prizeName: live.prize_name || "抽獎",
    revealMode: publicState.liveRevealMode
  });

  publicState.liveRollerLabels = buildPublicLiveRollerLabels();
  publicState.liveRollerIndex = 0;
  $("#public-live-roller").textContent = publicState.liveRevealMode === "flip" ? "" : (publicState.liveRollerLabels[0] || "ROOC");

  if ($("#audit-dialog").open) {
    closeAuditDialog();
  }

  if (!dialog.open) {
    dialog.showModal();
  }

  if (publicState.liveAnimationMode === "fireworks") {
    startPublicLiveFireworks();
  }

  if (publicState.liveRevealMode !== "flip" && !prefersReducedMotion()) {
    publicState.liveRollerTimer = window.setInterval(() => {
      publicState.liveRollerIndex = (publicState.liveRollerIndex + 1) % publicState.liveRollerLabels.length;
      $("#public-live-roller").textContent = publicState.liveRollerLabels[publicState.liveRollerIndex];
    }, 86);
  }

  refreshIcons();
}

function revealPublicLiveResults(draws, live = {}) {
  const dialog = $("#public-live-dialog");
  const labels = draws.map(publicDrawResultLabel).filter(Boolean);
  const hasMultipleResults = labels.length > 1;
  const choice = publicState.liveAnimationChoice || resolvePublicLiveAnimationChoice(live, draws);
  const revealMode = choice.revealMode || "roller";
  const isFlipReveal = revealMode === "flip";
  publicState.liveAnimationChoice = choice;
  publicState.liveAnimationMode = choice.visualMode || "classic";
  publicState.liveRevealMode = revealMode;
  window.ROOC_DRAW_ANIMATION.clearVisualModeClasses(dialog);
  window.ROOC_DRAW_ANIMATION.clearRevealModeClasses(dialog);
  dialog.classList.add(`mode-${publicState.liveAnimationMode}`);
  dialog.classList.add(`reveal-${revealMode}`);

  stopPublicLiveRoller();
  dialog.classList.add("is-revealed");
  dialog.classList.toggle("has-multiple-results", hasMultipleResults);
  dialog.classList.toggle("has-flip-results", isFlipReveal);
  setText("#public-live-phase", isFlipReveal ? "翻牌揭曉" : (hasMultipleResults ? "中獎名單" : "中獎者"));
  setText("#public-live-prize", live?.prize_name || draws[0]?.prize_name || "抽獎完成");
  $("#public-live-roller").textContent = isFlipReveal || hasMultipleResults ? "" : (labels[0] || "抽獎完成");
  renderPublicLiveReveal({
    labels: !isFlipReveal && hasMultipleResults ? labels : [],
    rows: isFlipReveal ? draws : [],
    placeholderCount: 0,
    prizeName: live?.prize_name || draws[0]?.prize_name || "抽獎完成",
    revealMode
  });
  if (publicState.liveAnimationMode === "fireworks" && !publicState.liveFireworks) {
    startPublicLiveFireworks();
  }
  launchPublicLiveFireworks(labels.length || live?.draw_count || draws.length);
  window.ROOC_DRAW_ANIMATION.launchConfetti(labels.length || live?.draw_count || draws.length);
  schedulePublicLiveEffectCleanup();
  refreshIcons();
}

function revealPublicLiveFailure(live) {
  const failureKey = `failed:${live.id}:${live.updated_at}`;
  if (failureKey === publicState.lastLiveResultKey) return;

  if (!$("#public-live-dialog").open) {
    openPublicLiveAnimation(live);
  }

  stopPublicLiveRoller();
  clearPublicLiveEffectCleanup();
  stopPublicLiveFireworks();
  const dialog = $("#public-live-dialog");
  dialog.classList.add("is-revealed");
  dialog.classList.remove("has-multiple-results", "has-flip-results");
  setText("#public-live-phase", "抽獎未完成");
  setText("#public-live-prize", live.prize_name || "抽獎");
  $("#public-live-roller").textContent = live.error_message || "請等待管理員重新操作";
  renderPublicLiveReveal({
    labels: [],
    rows: [],
    placeholderCount: 0,
    prizeName: live.prize_name || "抽獎",
    revealMode: "roller"
  });
  publicState.lastLiveResultKey = failureKey;
  refreshIcons();
}

function closePublicLiveDialog() {
  const dialog = $("#public-live-dialog");
  stopPublicLiveRoller();
  clearPublicLiveEffectCleanup();
  stopPublicLiveFireworks();
  if (dialog.open) {
    dialog.close();
  }
  dialog.classList.remove("is-revealed", "has-multiple-results", "has-flip-results");
  window.ROOC_DRAW_ANIMATION.clearVisualModeClasses(dialog);
  window.ROOC_DRAW_ANIMATION.clearRevealModeClasses(dialog);
  publicState.liveDialogId = "";
  publicState.liveAnimationChoice = null;
}

function stopPublicLiveRoller() {
  if (!publicState.liveRollerTimer) return;
  window.clearInterval(publicState.liveRollerTimer);
  publicState.liveRollerTimer = null;
}

function buildPublicLiveRollerLabels() {
  const labels = [
    ...(publicState.event?.draws || []).map((draw) => memberPlainText(draw.drawn_member_no, draw.drawn_role_name)),
    ...(publicState.event?.awards || []).map((award) => memberPlainText(award.final_member_no, award.final_role_name))
  ].filter(Boolean);

  const uniqueLabels = Array.from(new Set(labels)).slice(0, 80);
  if (uniqueLabels.length >= 4) {
    return uniqueLabels;
  }

  return [
    ...uniqueLabels,
    "ROOC 星辰",
    "公會名單轉動中",
    "幸運值校準中",
    "下一位會是誰",
    "抽選同步中"
  ];
}

function publicDrawResultLabel(draw) {
  return window.ROOC_DRAW_ANIMATION.resultLabel(draw);
}

function startPublicLiveFireworks() {
  if (prefersReducedMotion()) return;

  const container = $("#public-live-fireworks-layer");
  if (!container) return;

  stopPublicLiveFireworks();
  try {
    publicState.liveFireworks = window.ROOC_DRAW_ANIMATION.createFireworks(container);
    publicState.liveFireworks?.start();
  } catch {
    stopPublicLiveFireworks();
  }
}

function launchPublicLiveFireworks(resultCount) {
  if (publicState.liveAnimationMode !== "fireworks" || prefersReducedMotion()) return;
  window.ROOC_DRAW_ANIMATION.launchFireworks(publicState.liveFireworks, resultCount);
}

function schedulePublicLiveEffectCleanup() {
  clearPublicLiveEffectCleanup();
  if (publicState.liveAnimationMode !== "fireworks") return;

  publicState.liveEffectCleanupId = window.setTimeout(() => {
    publicState.liveEffectCleanupId = null;
    stopPublicLiveFireworks();
  }, PUBLIC_DRAW_EFFECT_CLEANUP_MS);
}

function clearPublicLiveEffectCleanup() {
  if (!publicState.liveEffectCleanupId) return;
  window.clearTimeout(publicState.liveEffectCleanupId);
  publicState.liveEffectCleanupId = null;
}

function stopPublicLiveFireworks() {
  clearPublicLiveEffectCleanup();
  const fireworks = publicState.liveFireworks;
  publicState.liveFireworks = null;
  window.ROOC_DRAW_ANIMATION.stopFireworks(fireworks, $("#public-live-fireworks-layer"));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function handlePublicRosterButtonClick(event) {
  const button = event.target.closest("[data-public-roster]");
  if (!button) return;

  openPublicRosterDialog(button.dataset.publicRoster);
}

function syncPublicRosterButtons() {
  document.querySelectorAll("[data-public-roster]").forEach((button) => {
    button.disabled = getPublicRosterList(button.dataset.publicRoster).length === 0;
  });
}

function openPublicRosterDialog(rosterKey) {
  const config = publicRosterDialogConfig(rosterKey);
  const list = getPublicRosterList(rosterKey);
  const dialog = $("#public-roster-dialog");

  window.ROOC_VUE_ROSTER_SHELL?.render?.({
    targetSelector: "#public-roster-dialog .modal-shell",
    eyebrow: "名單",
    title: config.title,
    closeButtonId: "close-public-roster-dialog",
    closeLabel: "關閉名單",
    subtitle: publicState.event?.title || "目前活動",
    count: list.length,
    emptyMessage: config.empty,
    items: buildPublicRosterItems(list, rosterKey),
    onClose: closePublicRosterDialog
  });

  if ($("#audit-dialog").open) closeAuditDialog();
  if ($("#public-live-dialog").open) closePublicLiveDialog();
  dialog.showModal();
  refreshIcons();
}

function closePublicRosterDialog() {
  const dialog = $("#public-roster-dialog");
  if (dialog.open) dialog.close();
}

function getPublicRosterList(rosterKey) {
  const event = publicState.event;
  if (!event) return [];

  const lists = {
    public_prizes: event.prizes,
    public_awards: event.awards,
    public_draws: event.draws,
    public_audits: event.draws.filter((draw) => draw.audit)
  };

  return asArray(lists[rosterKey]);
}

function publicRosterDialogConfig(rosterKey) {
  const configs = {
    public_prizes: {
      title: "獎項名單",
      empty: "這場活動沒有獎項紀錄。"
    },
    public_awards: {
      title: "中獎名單",
      empty: "這場活動沒有中獎紀錄。"
    },
    public_draws: {
      title: "抽獎紀錄名單",
      empty: "這場活動沒有抽獎紀錄。"
    },
    public_audits: {
      title: "驗證快照名單",
      empty: "這場活動沒有可驗證快照。"
    }
  };

  return configs[rosterKey] || { title: "查看名單", empty: "目前沒有名單資料。" };
}

function buildPublicRosterItems(list, rosterKey) {
  if (rosterKey === "public_prizes") {
    return list.map((prize, index) => ({
      id: prize.id || `public-prize-${index}`,
      title: prize.name || "未命名獎項",
      meta: publicPrizeMeta(prize)
    }));
  }

  if (rosterKey === "public_awards") {
    return list.map((award, index) => ({
      id: award.id || `public-award-${index}`,
      title: memberPlainText(award.final_member_no, award.final_role_name),
      meta: publicAwardMeta(award)
    }));
  }

  if (rosterKey === "public_audits") {
    return list.map((draw, index) => ({
      id: draw.id || `public-audit-${index}`,
      title: memberPlainText(draw.drawn_member_no, draw.drawn_role_name),
      meta: publicAuditMeta(draw)
    }));
  }

  return list.map((draw, index) => ({
    id: draw.id || `public-draw-${index}`,
    title: memberPlainText(draw.drawn_member_no, draw.drawn_role_name),
    meta: publicDrawMeta(draw)
  }));
}

function publicPrizeMeta(prize) {
  return `${prize.provider || "未填提供者"} / 名額 ${prize.quantity ?? 0} / 已完成 ${prize.filled_count ?? 0} / 剩餘 ${prize.remaining_count ?? 0}`;
}

function publicAwardMeta(award) {
  const drawn = memberPlainText(award.drawn_member_no, award.drawn_role_name);
  const status = drawStatusText[award.status] || award.status;
  return `${award.prize_name || "未命名獎項"} / ${status} / 原抽中 ${drawn} / ${formatDate(award.resolved_at)}`;
}

function publicDrawMeta(draw) {
  return `${draw.prize_name || "未命名獎項"} / ${publicDrawStatusText(draw)} / ${formatDate(draw.created_at)}`;
}

function publicAuditMeta(draw) {
  const audit = draw.audit || {};
  return `${draw.prize_name || "未命名獎項"} / 可抽 ${audit.eligible_count ?? "-"} 人 / 抽中 #${audit.selected_index ?? "-"} / ${formatPercent(audit.step_probability)}`;
}

function renderPublicTable(payload = {}) {
  return Boolean(window.ROOC_VUE_PUBLIC_TABLES?.render?.(payload));
}

function shouldRenderPublicTable(key, signature) {
  const previous = publicState.tableRenderKeys.get(key);
  if (previous === signature) return false;

  publicState.tableRenderKeys.set(key, signature);
  return true;
}

function publicRowsSignature(rows, fields = []) {
  return rows
    .slice(0, PUBLIC_TABLE_RENDER_LIMIT)
    .map((row, index) => fields.map((field) => row?.[field] ?? "").join("~") || row?.id || index)
    .join("|");
}

function publicTableFooter(totalCount, visibleCount) {
  const hiddenCount = Math.max(totalCount - visibleCount, 0);
  return hiddenCount > 0
    ? `僅顯示最近 ${visibleCount} 筆，另有 ${hiddenCount} 筆可用上方「查看名單」瀏覽。`
    : "";
}

function buildPublicPrizeTableRows(prizes) {
  return prizes.map((prize, index) => ({
    id: prize.id || `public-prize-row-${index}`,
    name: prize.name || "",
    provider: prize.provider || "",
    quantity: prize.quantity ?? "",
    filledCount: prize.filled_count ?? "",
    remainingCount: prize.remaining_count ?? ""
  }));
}

function buildPublicAwardTableRows(awards) {
  return awards.map((award, index) => ({
    id: award.id || `public-award-row-${index}`,
    prizeName: award.prize_name || "",
    provider: award.provider || "",
    drawnMember: memberPlainText(award.drawn_member_no, award.drawn_role_name),
    finalMember: memberPlainText(award.final_member_no, award.final_role_name),
    status: drawStatusText[award.status] || award.status || "",
    resolvedAt: formatDate(award.resolved_at)
  }));
}

function buildPublicDrawTableRows(draws) {
  return draws.map((draw, index) => ({
    id: draw.id || `public-draw-row-${index}`,
    prizeName: draw.prize_name || "",
    provider: draw.provider || "",
    drawnMember: memberPlainText(draw.drawn_member_no, draw.drawn_role_name),
    status: publicDrawStatusText(draw),
    probability: formatPercent(draw.audit?.step_probability)
  }));
}

function renderPrizeRows() {
  const rows = publicState.event.prizes || [];
  const visibleRows = rows.slice(0, PUBLIC_TABLE_RENDER_LIMIT);
  const signature = `${rows.length}:${publicRowsSignature(visibleRows, ["id", "quantity", "filled_count", "remaining_count"])}`;
  if (!shouldRenderPublicTable("prizes", signature)) return;

  renderPublicTable({
    targetSelector: "#public-prize-table",
    kind: "prizes",
    rows: buildPublicPrizeTableRows(visibleRows),
    emptyMessage: "這場活動沒有獎項紀錄。",
    footerMessage: publicTableFooter(rows.length, visibleRows.length),
    colspan: 5
  });
}

function renderAwardRows() {
  const rows = publicState.event.awards || [];
  const visibleRows = rows.slice(0, PUBLIC_TABLE_RENDER_LIMIT);
  const signature = `${rows.length}:${publicRowsSignature(visibleRows, ["id", "status", "final_member_no", "resolved_at"])}`;
  if (!shouldRenderPublicTable("awards", signature)) return;

  renderPublicTable({
    targetSelector: "#public-award-table",
    kind: "awards",
    rows: buildPublicAwardTableRows(visibleRows),
    emptyMessage: "這場活動沒有已確認中獎名單。",
    footerMessage: publicTableFooter(rows.length, visibleRows.length),
    colspan: 6
  });
}

function renderDrawRows() {
  const rows = publicState.event.draws || [];
  const visibleRows = rows.slice(0, PUBLIC_TABLE_RENDER_LIMIT);
  const signature = `${rows.length}:${publicRowsSignature(visibleRows, ["id", "status", "final_member_no", "updated_at", "resolved_at"])}`;
  if (!shouldRenderPublicTable("draws", signature)) return;

  renderPublicTable({
    targetSelector: "#public-draw-table",
    kind: "draws",
    rows: buildPublicDrawTableRows(visibleRows),
    emptyMessage: "這場活動沒有抽獎紀錄。",
    footerMessage: publicTableFooter(rows.length, visibleRows.length),
    colspan: 6
  });
}

function publicDrawStatusText(draw) {
  if (draw.status === "transferred") {
    return `指定轉讓：${memberPlainText(draw.final_member_no, draw.final_role_name)}`;
  }

  return drawStatusText[draw.status] || draw.status;
}

function handleDrawVerifyClick(event) {
  const button = event.target.closest("[data-verify-draw]");
  if (!button) return;

  const draw = publicState.event?.draws.find((item) => item.id === button.dataset.verifyDraw);
  if (!draw) {
    showToast("找不到這筆抽獎紀錄。", "error");
    return;
  }

  openAuditDialog(draw);
}

function openAuditDialog(draw) {
  const dialog = $("#audit-dialog");
  renderAuditContent(draw, { status: "checking" });
  dialog.showModal();
  refreshIcons();

  void verifyDrawAudit(draw)
    .then((result) => renderAuditContent(draw, result))
    .catch((error) => renderAuditContent(draw, { status: "failed", message: error.message }));
}

function closeAuditDialog() {
  const dialog = $("#audit-dialog");
  if (dialog.open) dialog.close();
}

function renderAuditContent(draw, verification) {
  const audit = draw.audit;
  const title = `${draw.prize_name} / ${memberPlainText(draw.drawn_member_no, draw.drawn_role_name)}`;
  window.ROOC_VUE_AUDIT_SHELL?.render?.({
    targetSelector: "#audit-dialog .modal-shell",
    title,
    draw,
    verification,
    hasFullSnapshot: audit ? canVerifyDrawAudit(draw, audit) : false,
    helpers: {
      displayAuditValue,
      formatPercent,
      memberPlainText
    },
    onClose: closeAuditDialog
  });
  refreshIcons();
}

async function verifyDrawAudit(draw) {
  const audit = draw.audit;
  if (!audit) {
    return { status: "failed", message: "這筆紀錄沒有公平快照。" };
  }

  if (!canVerifyDrawAudit(draw, audit)) {
    return { status: "warning", message: "這筆紀錄有機率資料，但缺少完整可抽名單或結果 Hash，無法做瀏覽器端完整重算。" };
  }

  if (!window.crypto?.subtle) {
    return { status: "failed", message: "目前瀏覽器不支援 Web Crypto，無法在本機重算 SHA-256。" };
  }

  const manifestHash = await sha256Hex(audit.eligible_manifest);
  if (manifestHash !== audit.eligible_manifest_hash) {
    return { status: "failed", message: "名單 Hash 不一致，當下可抽名單可能已被改動。" };
  }

  const auditMeta = resolveDrawAuditMeta(draw);
  if (!auditMeta.eventId || !auditMeta.prizeId || !auditMeta.slotNumber) {
    return { status: "warning", message: "這筆紀錄缺少活動、獎項或抽獎格次識別資料，無法做瀏覽器端完整重算。" };
  }

  const selectorInput = `${audit.random_seed}:${auditMeta.eventId}:${auditMeta.prizeId}:${auditMeta.slotNumber}:${audit.eligible_manifest_hash}`;
  const selectorHash = await sha256Hex(selectorInput);
  let index = Number(BigInt(`0x${selectorHash.slice(0, 12)}`) % BigInt(audit.eligible_count)) + 1;
  let verificationNote = "";

  if (selectorHash !== audit.selector_hash) {
    const legacySelectorHash = await sha256Hex(audit.random_seed);
    const isLegacyRandomizedFirstDraw = legacySelectorHash === audit.selector_hash && Number(audit.selected_index) === 1;
    if (!isLegacyRandomizedFirstDraw) {
      return { status: "failed", message: "結果 Hash 不一致，seed 或抽獎資料可能不一致。" };
    }

    index = 1;
    verificationNote = "這筆是舊版測試抽獎紀錄，結果 Hash 使用 SHA-256(Random Seed)，快照第一位即為抽中者。";
  }

  if (index !== Number(audit.selected_index)) {
    return { status: "failed", message: `重算位置是 #${index}，與紀錄 #${audit.selected_index} 不一致。` };
  }

  const selectedMember = audit.eligible_members.find((member) => Number(member.position) === index);
  if (!selectedMember || selectedMember.member_no !== draw.drawn_member_no) {
    return { status: "failed", message: "重算位置對應的成員與抽中者不一致。" };
  }

  return {
    status: "passed",
    message: `${verificationNote ? `${verificationNote} ` : ""}重算結果為 #${index} ${memberPlainText(selectedMember.member_no, selectedMember.role_name)}，與抽獎紀錄一致。`
  };
}

function resolveDrawAuditMeta(draw) {
  return {
    eventId: draw?.event_id || publicState.event?.id || "",
    prizeId: draw?.prize_id || "",
    slotNumber: draw?.slot_number ?? ""
  };
}

function canVerifyDrawAudit(draw, audit) {
  const auditMeta = resolveDrawAuditMeta(draw);
  return Boolean(
    audit?.random_seed
    && audit?.eligible_manifest
    && audit?.eligible_manifest_hash
    && audit?.selector_hash
    && audit?.eligible_count
    && auditMeta.eventId
    && auditMeta.prizeId
    && auditMeta.slotNumber !== ""
    && asArray(audit?.eligible_members).length > 0
  );
}

function displayAuditValue(value) {
  return value === "" || value == null ? "-" : value;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text ?? ""));
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function rpc(name, args) {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function requireClient() {
  if (!publicState.client) {
    throw new Error("Supabase 尚未連線。");
  }
  return publicState.client;
}

async function withBusy(target, task) {
  const buttons = Array.from(target.querySelectorAll?.("button") || []);
  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    return await task();
  } catch (error) {
    showToast(friendlyError(error.message || "操作失敗。"), "error");
    throw error;
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
    refreshIcons();
  }
}

function showToast(message, type = "info") {
  window.ROOC_VUE_TOASTS?.show?.(message, type, {
    duration: 4200
  });
}

function cleanRequired(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

function friendlyError(message) {
  const text = String(message || "");
  if (text.includes("raffle_events_slug_check")) return "活動代碼格式不正確。";
  if (text.includes("new row for relation") && text.includes("violates check constraint")) return "資料格式不符合系統規則。";
  if (text.includes("duplicate key value violates unique constraint")) return "資料已存在，請確認是否重複。";
  if (text.includes("violates foreign key constraint")) return "關聯資料不存在或已被刪除，請重新整理後再試。";
  if (text.includes("invalid input syntax for type uuid")) return "資料識別碼格式不正確，請重新整理頁面後再試。";
  if (text.includes("permission denied") || text.includes("insufficient_privilege")) return "目前沒有權限執行這個操作。";
  if (text.includes("JWT") && text.includes("expired")) return "連線憑證已過期，請重新整理頁面。";
  if (text.includes("Failed to fetch") || text.includes("NetworkError")) return "無法連線到 Supabase，請檢查網路或稍後再試。";

  return text
    .replace(/^Error:\s*/i, "")
    .replace(/JSON object requested, multiple .* rows returned/i, "資料重複，請檢查設定。")
    .trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}


function memberText(memberNo, displayName) {
  return escapeHtml(memberPlainText(memberNo, displayName));
}

function memberPlainText(memberNo, displayName) {
  const label = displayName || memberNo || "";
  const suffix = memberNo && displayName && memberNo !== displayName ? `（${memberNo}）` : "";
  return `${label}${suffix}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return `${(number * 100).toFixed(number < 0.01 ? 3 : 2)}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
