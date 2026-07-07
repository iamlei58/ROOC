const STORAGE_KEYS = {
  eventTitle: "rooc_event_title",
  eventSlug: "rooc_event_slug",
  appAdminPin: "rooc_app_admin_pin"
};

const DRAW_ANIMATION_MODES = [
  "fireworks",
  "classic",
  "spotlight",
  "starlight",
  "ripple",
  "aurora",
  "runes",
  "confetti",
  "curtain"
];

const PENDING_DRAW_PAGE_SIZE = 20;

const state = {
  client: null,
  environmentState: null,
  event: null,
  appAdminPin: "",
  adminPinPrompt: null,
  adminPinMode: "",
  adminPinRequired: false,
  confirmPrompt: null,
  occupations: [],
  members: [],
  openEvents: [],
  historyEvents: [],
  historyEvent: null,
  providerMembers: [],
  transferCandidates: [],
  transferCandidatesLoading: false,
  pendingVisibleCount: PENDING_DRAW_PAGE_SIZE,
  memberImportRawRows: [],
  memberImportRows: [],
  memberImportExisting: new Map(),
  eventSlugHint: "",
  drawAnimationMode: "fireworks",
  lastDrawAnimationMode: "",
  memberSort: {
    key: "member_no",
    direction: "asc"
  }
};

const memberCollator = new Intl.Collator("zh-Hant", {
  numeric: true,
  sensitivity: "base"
});

let memberSearchTimer = null;
let memberLoadSeq = 0;
const drawAnimationState = {
  intervalId: null,
  labels: [],
  index: 0,
  fireworks: null
};
const toastLayerState = {
  homeParent: null,
  homeNextSibling: null
};

const eventStatusText = {
  live: "進行中",
  closed: "已結束"
};

const drawStatusText = {
  pending: "待處理",
  accepted: "確認得獎",
  declined: "放棄重抽",
  transferred: "指定轉讓"
};

const MEMBER_IMPORT_HEADER_ALIASES = {
  member_no: ["編號", "成員編號", "會員編號", "id", "no", "memberno", "memberid"],
  role_name: ["角色名稱", "角色名", "角色", "名稱", "暱稱", "角色id", "角色ID", "rolename", "name", "nickname"],
  occupation: ["職業", "職位", "occupation", "job", "class"],
  joined_dc: ["是否加入dc", "已加入dc", "加入dc", "dc", "discord"],
  is_active: ["公會狀態", "狀態", "是否在公會", "公會中", "啟用", "active", "status"]
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadOptionalLocalConfig();
  bindTabs();
  bindForms();
  hydrateConfig();
  hydrateStoredPins();
  hydrateEventTitle();
  initializeSearchableSelects();
  rememberToastStackHome();
  await initializeAdminGate();
  refreshIcons();
});

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function bindTabs() {
  $all("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function switchTab(tabName) {
  $all("[data-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === tabName);
  });
  $all("[data-panel]").forEach((panel) => {
    const active = panel.dataset.panel === tabName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  if (tabName === "members") {
    void prepareMemberPanel();
  }
  if (tabName === "history") {
    void prepareHistoryPanel();
  }
  refreshIcons();
}

function bindForms() {
  $("#load-event-form").addEventListener("submit", handleLoadEvent);
  $("#refresh-events").addEventListener("click", handleRefreshEvents);
  $("#open-create-event-dialog").addEventListener("click", openCreateEventDialog);
  $("#close-create-event-dialog").addEventListener("click", closeCreateEventDialog);
  $("#cancel-create-event-dialog").addEventListener("click", closeCreateEventDialog);
  $("#create-event-form").addEventListener("submit", handleCreateEvent);
  $("#open-bonus-prize-dialog").addEventListener("click", () => openBonusPrizeDialog());
  $("#close-bonus-prize-dialog").addEventListener("click", closeBonusPrizeDialog);
  $("#cancel-bonus-prize-dialog").addEventListener("click", closeBonusPrizeDialog);
  $("#add-prize-form").addEventListener("submit", handleAddPrize);
  $("#prize-table").addEventListener("click", handlePrizeTableAction);
  $("#draw-prize-select").addEventListener("change", updateDrawCountLimit);
  $("#draw-count").addEventListener("input", () => {
    clampDrawCountInput();
    renderDrawOdds();
  });
  $("#draw-prize").addEventListener("click", handleDrawPrize);
  $("#draw-animation-dialog").addEventListener("cancel", (event) => event.preventDefault());
  $("#draw-animation-dialog").addEventListener("click", handleDrawAnimationClick);
  $("#close-draw-animation").addEventListener("click", closeDrawAnimation);
  $("#pending-card").addEventListener("click", handlePendingAction);
  $("#pending-card").addEventListener("click", handleClearPendingTransfer);
  $("#pending-card").addEventListener("submit", handlePendingTransfer);
  $("#pending-card").addEventListener("change", handlePendingTransferSelection);
  $("#pending-show-more").addEventListener("click", showMorePendingDraws);
  $("#refresh-event").addEventListener("click", () => reloadEvent());
  $all(".stats-grid").forEach((grid) => {
    grid.addEventListener("click", handleRosterButtonClick);
  });
  $("#close-event").addEventListener("click", () => setEventStatus("closed"));
  $("#reopen-event").addEventListener("click", () => setEventStatus("live"));
  $("#delete-event").addEventListener("click", () => deleteLoadedEvent("console"));
  $("#export-awards").addEventListener("click", exportAwardsExcel);
  $("#export-draw-log").addEventListener("click", exportDrawLogExcel);
  $("#history-event-form").addEventListener("submit", handleLoadHistoryEvent);
  $("#refresh-history-events").addEventListener("click", handleRefreshHistoryEvents);
  $("#export-history-awards").addEventListener("click", exportHistoryAwardsExcel);
  $("#export-history-draw-log").addEventListener("click", exportHistoryDrawLogExcel);
  $("#delete-history-event").addEventListener("click", () => deleteLoadedEvent("history"));
  $("#change-admin-pin").addEventListener("click", openChangeAdminPinDialog);
  $("#logout-admin").addEventListener("click", handleAdminLogout);
  $("#admin-pin-form").addEventListener("submit", handleAdminPinSubmit);
  $("#change-admin-pin-form").addEventListener("submit", handleChangeAdminPin);
  $("#cancel-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#dismiss-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#return-public-from-login").addEventListener("click", returnToPublicPage);
  $("#dismiss-change-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#close-roster-dialog").addEventListener("click", closeRosterDialog);
  $("#confirm-dialog-accept").addEventListener("click", () => closeConfirmDialog(true));
  $("#confirm-dialog-cancel").addEventListener("click", () => closeConfirmDialog(false));
  $("#confirm-dialog-close").addEventListener("click", () => closeConfirmDialog(false));
  $("#open-member-create-dialog").addEventListener("click", openMemberCreateDialog);
  $("#close-member-create-dialog").addEventListener("click", closeMemberCreateDialog);
  $("#open-member-import-dialog").addEventListener("click", openMemberImportDialog);
  $("#close-member-import-dialog").addEventListener("click", closeMemberImportDialog);
  $("#cancel-member-import-dialog").addEventListener("click", closeMemberImportDialog);
  $("#clear-member-import").addEventListener("click", () => resetMemberImportDialog({ keepFile: false }));
  $("#download-member-import-template").addEventListener("click", downloadMemberImportTemplate);
  $("#member-import-form").addEventListener("submit", handleMemberImportSubmit);
  $("#member-import-file").addEventListener("change", handleMemberImportFile);
  $("#member-import-form").elements.auto_create_occupations.addEventListener("change", renderMemberImportPreview);
  $("#member-import-form").elements.update_existing.addEventListener("change", renderMemberImportPreview);
  $("#open-occupation-dialog").addEventListener("click", openOccupationDialog);
  $("#close-occupation-dialog").addEventListener("click", closeOccupationDialog);
  $("#occupation-form").addEventListener("submit", handleOccupationSave);
  $("#clear-occupation-edit").addEventListener("click", clearOccupationEdit);
  $("#member-form").addEventListener("submit", handleMemberSave);
  $("#clear-member-create").addEventListener("click", () => resetMemberCreateForm({ focus: true }));
  $("#member-edit-form").addEventListener("submit", handleMemberEditSave);
  $("#close-member-edit").addEventListener("click", closeMemberEditDialog);
  $("#cancel-member-edit").addEventListener("click", closeMemberEditDialog);
  $("#member-search-form").addEventListener("submit", handleMemberSearch);
  $("#member-search-form").elements.query.addEventListener("input", scheduleMemberSearch);
  $("#member-search-form").elements.include_inactive.addEventListener("change", () => scheduleMemberSearch(0));
  $all("[data-member-sort]").forEach((button) => {
    button.addEventListener("click", () => sortMembersBy(button.dataset.memberSort));
  });
  bindDialogBackdrops();
}

function bindDialogBackdrops() {
  const dialogClosers = new Map([
    ["#create-event-dialog", closeCreateEventDialog],
    ["#bonus-prize-dialog", closeBonusPrizeDialog],
    ["#member-create-dialog", closeMemberCreateDialog],
    ["#member-import-dialog", closeMemberImportDialog],
    ["#member-edit-dialog", closeMemberEditDialog],
    ["#occupation-dialog", closeOccupationDialog],
    ["#admin-pin-dialog", cancelAdminPinPrompt],
    ["#roster-dialog", closeRosterDialog],
    ["#confirm-dialog", () => closeConfirmDialog(false)]
  ]);

  dialogClosers.forEach((closeDialog, selector) => {
    const dialog = $(selector);
    if (!dialog) return;

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog();
      }
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog();
    });

    dialog.addEventListener("close", () => {
      window.requestAnimationFrame(syncToastStackLayer);
    });
  });
}

function hydrateConfig() {
  state.environmentState = resolveSupabaseEnvironment();
  const runtime = state.environmentState.current || {};
  configureClient(runtime.url, runtime.anonKey);
  bindEnvironmentSwitcher();
  if (state.environmentState.requestedEnvironmentMissing) {
    showToast(`找不到資料庫環境「${state.environmentState.requestedEnvironmentMissing}」，已改用預設設定。`, "warning");
  }
  if (!state.client) {
    showToast(`「${getActiveEnvironmentLabel()}」Supabase 尚未設定。請設定對應的 URL 與 anon key。`, "error");
  }
}

function hydrateStoredPins() {
  state.appAdminPin = readSessionValue(STORAGE_KEYS.appAdminPin);

  if (state.appAdminPin) {
    $("#member-status").textContent = "已登入";
    $("#change-admin-pin").hidden = false;
    $("#logout-admin").hidden = false;
  }
}

async function initializeAdminGate() {
  if (!state.client) return;

  if (state.appAdminPin) {
    try {
      await validateAppAdminPassword(state.appAdminPin);
      await loadAdminBootstrapData();
      return;
    } catch (error) {
      rememberInvalidPins(error);
      showToast(friendlyError(error.message), "error");
    }
  }

  await requestAppAdminPin({ mode: "login", required: true });
}

async function validateAppAdminPassword(password) {
  await rpc("initialize_app_admin", { p_admin_pin: password });
}

async function loadAdminBootstrapData() {
  await refreshOpenEvents();
  await refreshHistoryEvents();
  await refreshPrizeProviderMembers();

  if ($("#panel-members")?.classList.contains("is-active")) {
    await loadOccupations();
    await loadMembers();
  }
}

function hydrateEventTitle() {
  const params = new URLSearchParams(window.location.search);
  state.eventSlugHint = params.get("slug") || params.get("event") || readLocalValue(STORAGE_KEYS.eventSlug) || "";
}

function configureClient(url, anonKey) {
  const cleanUrl = String(url || "").trim();
  const cleanKey = String(anonKey || "").trim();

  if (!cleanUrl || !cleanKey) {
    state.client = null;
    renderConnection(false);
    return;
  }

  if (!window.supabase?.createClient) {
    state.client = null;
    renderConnection(false);
    showToast("Supabase SDK 尚未載入。", "error");
    return;
  }

  state.client = window.supabase.createClient(cleanUrl, cleanKey);
  renderConnection(true);
}

function renderConnection(connected) {
  const connectionPill = $("#connection-pill");
  connectionPill.classList.toggle("is-connected", connected);
  connectionPill.classList.toggle("is-test-environment", connected && state.environmentState && !state.environmentState.isDefault);
  $("#connection-text").textContent = connected && state.environmentState && !state.environmentState.isDefault
    ? `${getActiveEnvironmentLabel()} 已連線`
    : connected ? "Supabase 已連線" : "尚未連線";
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
  if (window.ROOC_CONFIG?.mountEnvironmentSwitcher && state.environmentState) {
    window.ROOC_CONFIG.mountEnvironmentSwitcher(state.environmentState);
  }
}

function getActiveEnvironmentLabel() {
  return state.environmentState?.current?.label || "正式資料庫";
}

function readLocalValue(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLocalValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage can be unavailable in private or locked-down contexts.
  }
}

function readSessionValue(key) {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    if (value) {
      window.sessionStorage.setItem(key, value);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Keep the app usable even when sessionStorage is blocked.
  }
}

function rememberAppAdminPin(pin) {
  state.appAdminPin = pin;
  writeSessionValue(STORAGE_KEYS.appAdminPin, pin);
  $("#member-status").textContent = "已登入";
  $("#change-admin-pin").hidden = false;
  $("#logout-admin").hidden = false;
}

function forgetAppAdminPin() {
  state.appAdminPin = "";
  state.event = null;
  state.openEvents = [];
  state.historyEvents = [];
  state.historyEvent = null;
  state.providerMembers = [];
  state.transferCandidates = [];
  state.transferCandidatesLoading = false;
  state.memberImportRawRows = [];
  state.memberImportRows = [];
  state.memberImportExisting = new Map();
  state.eventSlugHint = "";
  writeSessionValue(STORAGE_KEYS.appAdminPin, "");
  writeLocalValue(STORAGE_KEYS.eventSlug, "");
  writeLocalValue(STORAGE_KEYS.eventTitle, "");
  $("#member-status").textContent = "未載入";
  $("#change-admin-pin").hidden = true;
  $("#logout-admin").hidden = true;
  $("#console-detail").hidden = true;
  $("#console-empty").hidden = false;
  $("#console-status").textContent = "未載入";
  renderOpenEventOptions();
  renderHistoryEventOptions();
  clearHistoryDetail();
  populatePrizeProviderSelect();
  populateTransferMemberSelect();
}

function initializeSearchableSelects() {
  enhanceSelect($("#event-title-select"), {
    placeholder: "搜尋未完成活動",
    noResults: "沒有未完成活動"
  });
  enhanceSelect($("#history-event-select"), {
    placeholder: "搜尋已結束活動",
    noResults: "沒有歷史活動"
  });
  enhanceSelect($("#prize-provider-select"), {
    placeholder: "搜尋提供者",
    noResults: "找不到公會中成員"
  });
}

function enhanceSelect(select, options = {}) {
  if (!select || !window.jQuery?.fn?.select2) return;

  const selectElement = window.jQuery(select);
  if (selectElement.data("select2")) return;
  const dropdownParent = select.closest(".modal-shell") || select.closest("dialog") || document.body;

  selectElement.select2({
    width: "100%",
    placeholder: options.placeholder || "請選擇",
    allowClear: true,
    dropdownParent: window.jQuery(dropdownParent),
    language: {
      noResults: () => options.noResults || "沒有符合的結果",
      searching: () => "搜尋中..."
    }
  });
}

function destroyEnhancedSelect(select) {
  if (!select || !window.jQuery?.fn?.select2) return;
  const selectElement = window.jQuery(select);
  try {
    if (selectElement.data("select2")) {
      selectElement.select2("destroy");
    }
  } catch {
    // Select2 can be left in a stale state after modal toggles; ignore and rebuild later.
  }
}

function setSelectValue(select, value, label = value) {
  if (!select || !value) return;
  const exists = Array.from(select.options).some((option) => option.value === value);
  if (!exists) {
    select.append(new Option(label, value, true, true));
  }
  select.value = value;
  syncEnhancedSelect(select);
}

function syncEnhancedSelect(select) {
  if (!select || !window.jQuery?.fn?.select2) return;
  const selectElement = window.jQuery(select);
  if (selectElement.data("select2")) {
    selectElement.val(select.value).trigger("change");
  }
}

async function refreshOpenEvents(preferredSlug = "") {
  const rows = await rpc("list_open_raffle_events", {
    p_app_admin_pin: state.appAdminPin
  });
  state.openEvents = (rows || []).filter((event) => event.status === "live");
  const loadedLiveSlug = state.event?.status === "live" ? state.event.slug : "";
  renderOpenEventOptions(preferredSlug || loadedLiveSlug || state.eventSlugHint);
}

function renderOpenEventOptions(preferredSlug = "") {
  const select = $("#event-title-select");
  if (!select) return;

  const current = preferredSlug || select.value;
  const hasOpenEvents = state.openEvents.length > 0;
  destroyEnhancedSelect(select);
  select.innerHTML = "";
  select.append(new Option(hasOpenEvents ? "選擇活動" : "目前沒有未完成活動", ""));

  state.openEvents.forEach((event) => {
    const label = `${event.title} / ${formatDate(event.created_at)}`;
    select.append(new Option(label, event.slug));
  });

  if (current && Array.from(select.options).some((option) => option.value === current)) {
    select.value = current;
    state.eventSlugHint = current;
  } else {
    select.value = "";
    if (current && current === state.eventSlugHint) {
      state.eventSlugHint = "";
      writeLocalValue(STORAGE_KEYS.eventSlug, "");
    }
  }

  select.disabled = !hasOpenEvents;
  $("#load-event-form button[type='submit']").disabled = !hasOpenEvents;
  enhanceSelect(select, {
    placeholder: hasOpenEvents ? "搜尋未完成活動" : "目前沒有未完成活動，請先建立活動",
    noResults: "沒有未完成活動"
  });
  syncEnhancedSelect(select);
}

async function refreshHistoryEvents(preferredSlug = "") {
  const rows = await rpc("list_closed_raffle_events", {
    p_app_admin_pin: state.appAdminPin
  });
  state.historyEvents = rows || [];
  renderHistoryEventOptions(preferredSlug || state.historyEvent?.slug || "");
}

function renderHistoryEventOptions(preferredSlug = "") {
  const select = $("#history-event-select");
  if (!select) return;

  const current = preferredSlug || select.value;
  const hasHistoryEvents = state.historyEvents.length > 0;
  destroyEnhancedSelect(select);
  select.innerHTML = "";
  select.append(new Option(hasHistoryEvents ? "選擇歷史活動" : "目前沒有已結束活動", ""));

  state.historyEvents.forEach((event) => {
    const label = `${event.title} / ${formatDate(event.closed_at || event.created_at)}`;
    select.append(new Option(label, event.slug));
  });

  if (current && Array.from(select.options).some((option) => option.value === current)) {
    select.value = current;
  } else {
    select.value = "";
  }

  select.disabled = !hasHistoryEvents;
  $("#history-event-form button[type='submit']").disabled = !hasHistoryEvents;
  enhanceSelect(select, {
    placeholder: hasHistoryEvents ? "搜尋已結束活動" : "目前沒有已結束活動",
    noResults: "沒有歷史活動"
  });
  syncEnhancedSelect(select);
}

async function refreshPrizeProviderMembers() {
  if (!state.appAdminPin) {
    state.providerMembers = [];
    populatePrizeProviderSelect();
    return;
  }

  const rows = await rpc("get_rooc_members", {
    p_app_admin_pin: state.appAdminPin,
    p_query: null,
    p_include_inactive: false
  });
  state.providerMembers = rows || [];
  populatePrizeProviderSelect();
}

async function refreshTransferCandidates() {
  if (!state.appAdminPin || !state.event?.slug || (state.event.pending_draws || []).length === 0) {
    state.transferCandidates = [];
    state.transferCandidatesLoading = false;
    renderPendingDraw();
    return;
  }

  state.transferCandidatesLoading = true;
  populateTransferMemberSelect();

  try {
    const rows = await rpc("get_raffle_transfer_candidates", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin
    });
    state.transferCandidates = rows || [];
  } finally {
    state.transferCandidatesLoading = false;
    renderPendingDraw();
  }
}

function populatePrizeProviderSelect(preferredMemberNo = "") {
  const select = $("#prize-provider-select");
  if (!select) return;

  const current = preferredMemberNo || select.value;
  destroyEnhancedSelect(select);
  select.innerHTML = "";
  select.append(new Option("選擇提供者", ""));

  state.providerMembers.forEach((member) => {
    select.append(new Option(memberOptionLabel(member), member.member_no));
  });

  if (current && Array.from(select.options).some((option) => option.value === current)) {
    select.value = current;
  } else {
    select.value = "";
  }

  select.disabled = state.providerMembers.length === 0;
  enhanceSelect(select, {
    placeholder: "搜尋提供者",
    noResults: "找不到公會中成員"
  });
  syncEnhancedSelect(select);
}

function populateTransferMemberSelect(preferredMemberNo = "") {
  const selects = $all("[data-transfer-select]");
  if (selects.length === 0) return;

  selects.forEach((select) => {
    const current = preferredMemberNo || select.value;
    destroyEnhancedSelect(select);
    select.innerHTML = "";
    const placeholder = state.transferCandidatesLoading
      ? "載入可轉讓名單中"
      : state.transferCandidates.length === 0
        ? "沒有可轉讓成員"
        : "選擇轉讓對象";
    select.append(new Option(placeholder, ""));

    state.transferCandidates.forEach((member) => {
      select.append(new Option(memberOptionLabel(member), member.member_no));
    });

    if (current && Array.from(select.options).some((option) => option.value === current)) {
      select.value = current;
    } else {
      select.value = "";
    }

    select.disabled = state.transferCandidatesLoading || state.transferCandidates.length === 0;
    enhanceSelect(select, {
      placeholder: "搜尋可轉讓成員",
      noResults: "沒有可轉讓成員"
    });
    bindTransferSelectChange(select);
    syncEnhancedSelect(select);
    updatePendingPrimaryAction(select.closest(".pending-item"));
  });
}

function bindTransferSelectChange(select) {
  select.onchange = () => updatePendingPrimaryAction(select.closest(".pending-item"));

  if (!window.jQuery?.fn?.select2) return;

  window.jQuery(select)
    .off(".pendingTransfer")
    .on("change.pendingTransfer select2:select.pendingTransfer select2:clear.pendingTransfer", () => {
      updatePendingPrimaryAction(select.closest(".pending-item"));
    });
}

function memberOptionLabel(member) {
  return `${member.role_name || member.member_no}（${member.member_no}）`;
}

function updateDrawCountLimit() {
  const countInput = $("#draw-count");
  const { prize, limit } = getSelectedDrawLimit();

  countInput.max = String(Math.max(limit, 1));
  countInput.disabled = limit === 0;
  $("#draw-prize").disabled = state.event?.status !== "live" || !prize;

  const current = Number(countInput.value || 1);
  if (!Number.isFinite(current) || current < 1 || current > limit) {
    countInput.value = String(limit > 0 ? Math.min(Math.max(Math.trunc(current || 1), 1), limit) : 0);
  }
  renderDrawOdds();
}

function drawUnavailableMessage(prizeRemaining, eligibleRemaining) {
  if (prizeRemaining <= 0) {
    return "這個獎項目前沒有剩餘名額，請先調整名額或處理待處理抽獎。";
  }

  if (eligibleRemaining <= 0) {
    return "目前沒有可抽成員，可能都已被排除或只剩獎項提供者。";
  }

  return "這個獎項目前沒有可抽名額，請先調整名額或處理待處理抽獎。";
}

function clampDrawCountInput() {
  const countInput = $("#draw-count");
  if (!countInput || countInput.value === "") return;

  const value = Number(countInput.value);
  const { limit } = getSelectedDrawLimit();
  if (!Number.isFinite(value)) return;

  if (limit === 0) {
    countInput.value = "0";
    return;
  }

  if (value < 1) {
    countInput.value = "1";
    return;
  }

  if (limit > 0 && value > limit) {
    countInput.value = String(limit);
    return;
  }

  if (!Number.isInteger(value)) {
    countInput.value = String(Math.trunc(value));
  }
}

function getSelectedDrawLimit() {
  const prizeId = $("#draw-prize-select")?.value;
  const prize = state.event?.prizes?.find((item) => item.id === prizeId);
  const prizeRemaining = Math.max(Number(prize?.remaining_count || 0), 0);
  const eligibleRemaining = Math.max(Number(prize?.eligible_count ?? state.event?.eligible_count ?? 0), 0);

  return {
    prize,
    prizeRemaining,
    eligibleRemaining,
    limit: Math.min(prizeRemaining, eligibleRemaining)
  };
}

function renderDrawOdds() {
  const card = $("#draw-odds-card");
  if (!card) return;

  const { prize, eligibleRemaining, limit } = getSelectedDrawLimit();
  const countInput = $("#draw-count");
  const rawDrawCount = Number(countInput?.value || 1);

  if (!state.event || !prize || eligibleRemaining <= 0 || limit <= 0) {
    card.hidden = true;
    return;
  }

  const drawCount = Math.min(Math.max(Math.trunc(rawDrawCount || 1), 1), limit);
  const probability = drawCount / eligibleRemaining;
  const providerExcluded = prize.provider_excluded ? 1 : 0;
  const excludedCount = Number(state.event.excluded_count || 0);
  const activeCount = Number(state.event.total_active_members || 0);

  $("#draw-odds-probability").textContent = `${drawCount}/${eligibleRemaining} = ${formatPercent(probability)}`;
  $("#draw-odds-formula").textContent = `可抽人數 = 公會中 ${activeCount} - 已排除 ${excludedCount} - 獎項提供者 ${providerExcluded} = ${eligibleRemaining}；每位本輪機率 = 抽出人數 / 可抽人數。`;
  card.hidden = false;
}

async function handleLoadEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await withBusy(form, async () => {
    const slug = cleanRequired(data.get("slug"), "請選擇活動。");
    await loadEvent(slug);
  });
}

async function handleRefreshEvents() {
  await withBusy($("#load-event-form"), async () => {
    await ensureAppAdminPin();
    await refreshOpenEvents();
    showToast("未完成活動已刷新。", "success");
  });
}

function openCreateEventDialog() {
  const dialog = $("#create-event-dialog");
  const form = $("#create-event-form");
  showModalDialog(dialog);
  refreshIcons();
  window.setTimeout(() => form.elements.title.focus(), 0);
}

function closeCreateEventDialog() {
  const dialog = $("#create-event-dialog");
  $("#create-event-form").reset();
  closeModalDialog(dialog);
}

function openBonusPrizeDialog(prizeId = "") {
  ensureEventLoaded();
  if (state.event.status !== "live") {
    showToast("活動已結束，不能新增或調整獎項。", "error");
    return;
  }

  const prize = prizeId ? state.event.prizes.find((item) => item.id === prizeId) : null;
  if (prizeId && !prize) {
    showToast("找不到要調整的獎項。", "error");
    return;
  }

  resetBonusPrizeForm();

  const dialog = $("#bonus-prize-dialog");
  const form = $("#add-prize-form");
  const isExistingPrize = Boolean(prize);
  const nameInput = $("#bonus-prize-name");
  const providerSelect = $("#prize-provider-select");
  const quantityInput = $("#bonus-prize-quantity");
  const submitButton = form.querySelector('button[type="submit"]');

  form.dataset.mode = isExistingPrize ? "quantity" : "create";
  $("#bonus-prize-id").value = prize?.id || "";
  $("#bonus-prize-mode").textContent = isExistingPrize ? "調整" : "新增";
  $("#bonus-prize-title").textContent = isExistingPrize ? "調整獎項名額" : "新增獎項";
  $("#bonus-prize-submit-label").textContent = isExistingPrize ? "儲存名額" : "新增獎項";
  $("#bonus-quantity-label").textContent = isExistingPrize ? "總名額" : "名額";

  $all("[data-new-prize-field]").forEach((field) => {
    field.hidden = isExistingPrize;
  });

  nameInput.disabled = isExistingPrize;
  nameInput.required = !isExistingPrize;
  providerSelect.disabled = isExistingPrize;
  providerSelect.required = !isExistingPrize;

  if (isExistingPrize) {
    const usedCount = Number(prize.filled_count || 0) + Number(prize.pending_count || 0);
    const currentQuantity = Number(prize.quantity || 0);
    $("#bonus-selected-prize").hidden = false;
    $("#bonus-selected-prize-name").textContent = `${prize.name} / ${prize.provider} / 目前 ${currentQuantity} 名額，已抽或待處理 ${usedCount} 名`;
    quantityInput.min = String(Math.max(usedCount, 1));
    quantityInput.max = "200";
    quantityInput.value = String(Math.max(currentQuantity, usedCount, 1));
    quantityInput.disabled = false;
    if (submitButton) submitButton.disabled = false;
  } else {
    $("#bonus-selected-prize").hidden = true;
    quantityInput.min = "1";
    quantityInput.max = "200";
    quantityInput.disabled = false;
    if (submitButton) submitButton.disabled = false;
    quantityInput.value = "1";
    populatePrizeProviderSelect();
  }

  showModalDialog(dialog);

  refreshIcons();
  window.setTimeout(() => {
    if (isExistingPrize) {
      quantityInput.focus();
      quantityInput.select();
      return;
    }
    nameInput.focus();
  }, 0);
}

function closeBonusPrizeDialog() {
  const dialog = $("#bonus-prize-dialog");
  resetBonusPrizeForm();
  closeModalDialog(dialog);
}

function resetBonusPrizeForm() {
  const form = $("#add-prize-form");
  if (!form) return;

  const providerSelect = $("#prize-provider-select");
  form.reset();
  form.dataset.mode = "create";
  $("#bonus-prize-id").value = "";
  $("#bonus-selected-prize").hidden = true;
  $("#bonus-selected-prize-name").textContent = "";
  $("#bonus-prize-mode").textContent = "新增";
  $("#bonus-prize-title").textContent = "新增獎項";
  $("#bonus-prize-submit-label").textContent = "新增獎項";
  $("#bonus-quantity-label").textContent = "名額";
  $("#bonus-prize-quantity").min = "1";
  $("#bonus-prize-quantity").max = "200";
  $("#bonus-prize-quantity").disabled = false;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = false;

  $all("[data-new-prize-field]").forEach((field) => {
    field.hidden = false;
  });

  $("#bonus-prize-name").disabled = false;
  $("#bonus-prize-name").required = true;
  providerSelect.disabled = false;
  providerSelect.required = true;
  populatePrizeProviderSelect();
}

async function handleCreateEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  await withBusy(form, async () => {
    const title = cleanRequired(data.get("title"), "請輸入活動名稱。");
    await ensureAppAdminPin();
    const rows = await rpc("create_raffle_event", {
      p_title: title,
      p_slug: null,
      p_description: data.get("description"),
      p_admin_pin: state.appAdminPin
    });
    const created = rows?.[0];
    if (!created) throw new Error("活動建立失敗。");

    form.reset();
    closeCreateEventDialog();
    await refreshOpenEvents(created.slug);
    await loadEvent(created.slug);
    showToast(`活動已建立：${title}`, "success");
  });
}

async function loadEvent(slug) {
  requireClient();
  const cleanSlug = cleanRequired(slug, "請選擇活動。");
  await ensureAppAdminPin();
  const rows = await rpc("get_raffle_event_admin", {
    p_slug: cleanSlug,
    p_admin_pin: state.appAdminPin
  });

  if (!rows || rows.length === 0) {
    throw new Error("找不到活動。");
  }

  state.event = normalizeEvent(rows[0]);
  state.pendingVisibleCount = PENDING_DRAW_PAGE_SIZE;
  state.transferCandidates = [];
  state.transferCandidatesLoading = state.event.pending_draws.length > 0;
  syncLoadedEventSelection();
  renderEvent();
  await refreshPrizeProviderMembers();
  await refreshTransferCandidates();
}

function syncLoadedEventSelection() {
  const select = $("#event-title-select");
  if (state.event?.status === "live") {
    writeLocalValue(STORAGE_KEYS.eventSlug, state.event.slug);
    writeLocalValue(STORAGE_KEYS.eventTitle, "");
    state.eventSlugHint = state.event.slug;
    setSelectValue(select, state.event.slug, state.event.title);
    return;
  }

  if (select) {
    select.value = "";
    syncEnhancedSelect(select);
  }
  state.eventSlugHint = "";
  writeLocalValue(STORAGE_KEYS.eventSlug, "");
  writeLocalValue(STORAGE_KEYS.eventTitle, "");
}

async function reloadEvent() {
  if (!state.event) {
    showToast("請先載入活動。", "error");
    return;
  }
  await withBusy($("#console-detail"), async () => {
    await loadEvent(state.event.slug);
    showToast("活動已刷新。", "success");
  });
}

async function prepareHistoryPanel() {
  await withBusy($("#panel-history"), async () => {
    await ensureAppAdminPin();
    await refreshHistoryEvents();
  });
}

async function handleRefreshHistoryEvents() {
  await withBusy($("#history-event-form"), async () => {
    await ensureAppAdminPin();
    await refreshHistoryEvents();
    showToast("歷史活動已刷新。", "success");
  });
}

async function handleLoadHistoryEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await withBusy(form, async () => {
    const slug = cleanRequired(data.get("slug"), "請選擇歷史活動。");
    await loadHistoryEvent(slug);
  });
}

async function loadHistoryEvent(slug) {
  requireClient();
  const cleanSlug = cleanRequired(slug, "請選擇歷史活動。");
  await ensureAppAdminPin();
  const rows = await rpc("get_raffle_event_admin", {
    p_slug: cleanSlug,
    p_admin_pin: state.appAdminPin
  });

  if (!rows || rows.length === 0) {
    throw new Error("找不到活動。");
  }

  state.historyEvent = normalizeEvent(rows[0]);
  const label = `${state.historyEvent.title} / ${formatDate(state.historyEvent.closed_at || state.historyEvent.created_at)}`;
  setSelectValue($("#history-event-select"), state.historyEvent.slug, label);
  renderHistoryEvent();
}

function renderHistoryEvent() {
  const event = state.historyEvent;
  if (!event) {
    clearHistoryDetail();
    return;
  }

  $("#history-empty").hidden = true;
  $("#history-detail").hidden = false;
  $("#history-status").textContent = eventStatusText[event.status] || event.status;
  $("#history-event-status-badge").textContent = eventStatusText[event.status] || event.status;
  $("#history-title").textContent = event.title;
  $("#history-closed-at").textContent = event.closed_at ? `結束時間：${formatDate(event.closed_at)}` : `建立時間：${formatDate(event.created_at)}`;
  $("#history-stat-prizes").textContent = event.prizes.length;
  $("#history-stat-awards").textContent = event.awards.length;
  $("#history-stat-draws").textContent = event.recent_draws.length;
  $("#history-stat-excluded").textContent = event.excluded_count ?? 0;
  syncHistoryRosterButtons();

  renderPrizeRows("#history-prize-table", event.prizes, "這場活動沒有獎項紀錄。");
  renderAwardRows("#history-award-table", event.awards, "這場活動沒有中獎紀錄。");
  renderDrawLogRows("#history-draw-log-table", event.recent_draws, "這場活動沒有抽獎紀錄。", event.slug);
  refreshIcons();
}

function clearHistoryDetail() {
  const detail = $("#history-detail");
  const empty = $("#history-empty");
  if (!detail || !empty) return;

  detail.hidden = true;
  empty.hidden = false;
  $("#history-status").textContent = "未載入";
  $("#history-title").textContent = "尚未載入";
  $("#history-event-status-badge").textContent = "未載入";
  $("#history-closed-at").textContent = "";
}

function normalizeEvent(event) {
  const pendingDraws = sortDrawRows(event.pending_draw);
  return {
    ...event,
    prizes: asArray(event.prizes),
    awards: asArray(event.awards),
    recent_draws: asArray(event.recent_draws),
    pending_draws: pendingDraws,
    pending_draw: pendingDraws[0] || null
  };
}

function renderEvent() {
  const event = state.event;
  $("#console-empty").hidden = true;
  $("#console-detail").hidden = false;
  $("#console-status").textContent = eventStatusText[event.status] || event.status;
  $("#event-status-badge").textContent = eventStatusText[event.status] || event.status;
  $("#event-title").textContent = event.title;
  $("#stat-active-members").textContent = event.total_active_members ?? 0;
  $("#stat-eligible").textContent = event.eligible_count ?? 0;
  $("#stat-excluded").textContent = event.excluded_count ?? 0;
  $("#stat-awards").textContent = event.award_count ?? 0;
  syncRosterButtons();

  $("#close-event").disabled = event.status === "closed";
  $("#reopen-event").disabled = event.status === "live";
  $("#draw-prize").disabled = event.status !== "live";
  $("#open-bonus-prize-dialog").disabled = event.status !== "live";

  renderPrizeOptions();
  renderPendingDraw();
  renderPrizeTable();
  renderAwards();
  renderDrawLog();
  refreshIcons();
}

function renderPrizeOptions() {
  const select = $("#draw-prize-select");
  const previousValue = select.value;
  select.innerHTML = "";

  const prizes = state.event.prizes || [];
  if (prizes.length === 0) {
    select.append(new Option("尚未新增獎項", ""));
    select.disabled = true;
    $("#draw-prize").disabled = true;
    updateDrawCountLimit();
    return;
  }

  prizes.forEach((prize) => {
    const drawLimit = Math.min(
      Math.max(Number(prize.remaining_count || 0), 0),
      Math.max(Number(prize.eligible_count ?? state.event?.eligible_count ?? 0), 0)
    );
    const label = `${prize.name} / ${prize.provider} / 可抽 ${drawLimit}`;
    select.append(new Option(label, prize.id));
  });
  if (previousValue && prizes.some((prize) => prize.id === previousValue)) {
    select.value = previousValue;
  }
  select.disabled = false;
  $("#draw-prize").disabled = state.event.status !== "live";
  updateDrawCountLimit();
}

function syncRosterButtons() {
  $all("[data-roster]").forEach((button) => {
    button.disabled = getRosterCount(button.dataset.roster, "console") === 0;
  });
}

function syncHistoryRosterButtons() {
  $all("[data-history-roster]").forEach((button) => {
    button.disabled = getRosterCount(button.dataset.historyRoster, "history") === 0;
  });
}

async function handleRosterButtonClick(event) {
  const button = event.target.closest("[data-roster], [data-history-roster]");
  if (!button) return;
  const isHistoryRoster = Boolean(button.dataset.historyRoster);
  const source = isHistoryRoster ? "history" : "console";
  const rosterKey = button.dataset.roster || button.dataset.historyRoster;

  button.disabled = true;
  try {
    await ensureRosterLoaded(rosterKey, source);
    openRosterDialog(rosterKey, source);
  } catch (error) {
    showToast(friendlyError(error.message || "名單載入失敗。"), "error");
  } finally {
    if (source === "history") {
      syncHistoryRosterButtons();
    } else {
      syncRosterButtons();
    }
  }
}

async function ensureRosterLoaded(rosterKey, source = "console") {
  const targetEvent = source === "history" ? state.historyEvent : state.event;
  if (!targetEvent) throw new Error("請先載入活動。");

  if (source === "history" && rosterKey !== "history_excluded_members") return;
  const targetKey = source === "history" ? "excluded_members" : rosterKey;
  if (Array.isArray(targetEvent[targetKey])) return;

  const rows = await rpc("get_raffle_event_rosters", {
    p_slug: targetEvent.slug,
    p_admin_pin: state.appAdminPin
  });
  const rosters = rows?.[0] || {};
  targetEvent.active_members = asArray(rosters.active_members);
  targetEvent.eligible_members = asArray(rosters.eligible_members);
  targetEvent.excluded_members = asArray(rosters.excluded_members);
  targetEvent.awarded_members = asArray(rosters.awarded_members);
}

function openRosterDialog(rosterKey, source = "console") {
  const config = rosterDialogConfig(rosterKey);
  const list = getRosterList(rosterKey, source);
  $("#roster-dialog-title").textContent = config.title;
  $("#roster-dialog-count").textContent = `${list.length} 筆`;
  $("#roster-dialog-subtitle").textContent = (source === "history" ? state.historyEvent?.title : state.event?.title) || "目前活動";
  $("#roster-dialog-list").innerHTML = renderRosterDialogItems(list, config.empty, rosterKey);
  showModalDialog($("#roster-dialog"));
  refreshIcons();
}

function closeRosterDialog() {
  closeModalDialog($("#roster-dialog"));
}

function getRosterList(rosterKey, source = "console") {
  const targetEvent = source === "history" ? state.historyEvent : state.event;
  if (!targetEvent) return [];

  const historyLists = {
    history_prizes: targetEvent.prizes,
    history_awards: targetEvent.awards,
    history_draws: targetEvent.recent_draws,
    history_excluded_members: targetEvent.excluded_members
  };

  return asArray(historyLists[rosterKey] ?? targetEvent[rosterKey]);
}

function getRosterCount(rosterKey, source = "console") {
  const targetEvent = source === "history" ? state.historyEvent : state.event;
  if (!targetEvent) return 0;

  const counts = {
    active_members: Number(targetEvent.total_active_members || 0),
    eligible_members: Number(targetEvent.eligible_count || 0),
    excluded_members: Number(targetEvent.excluded_count || 0),
    awarded_members: Number(targetEvent.award_count || 0),
    history_prizes: asArray(targetEvent.prizes).length,
    history_awards: asArray(targetEvent.awards).length,
    history_draws: asArray(targetEvent.recent_draws).length,
    history_excluded_members: Number(targetEvent.excluded_count || 0)
  };

  return counts[rosterKey] ?? getRosterList(rosterKey, source).length;
}

function rosterDialogConfig(rosterKey) {
  const configs = {
    active_members: {
      title: "公會中成員名單",
      empty: "目前沒有公會中成員。"
    },
    eligible_members: {
      title: "剩餘可抽名單",
      empty: "目前沒有可抽成員。"
    },
    excluded_members: {
      title: "已排除名單",
      empty: "目前沒有已排除成員。"
    },
    awarded_members: {
      title: "已發獎名單",
      empty: "目前沒有已發獎成員。"
    },
    history_prizes: {
      title: "歷史獎項名單",
      empty: "這場活動沒有獎項紀錄。"
    },
    history_awards: {
      title: "歷史中獎名單",
      empty: "這場活動沒有中獎紀錄。"
    },
    history_draws: {
      title: "歷史抽獎紀錄",
      empty: "這場活動沒有抽獎紀錄。"
    },
    history_excluded_members: {
      title: "歷史已排除名單",
      empty: "這場活動沒有已排除成員。"
    }
  };
  return configs[rosterKey] || { title: "查看名單", empty: "目前沒有名單資料。" };
}

function renderRosterDialogItems(list, emptyMessage, rosterKey = "") {
  if (list.length === 0) {
    return `<div class="empty-state compact-empty"><p>${escapeHtml(emptyMessage)}</p></div>`;
  }

  if (rosterKey === "history_prizes") {
    return list.map((prize) => `
      <article class="roster-member">
        <div>
          <strong>${escapeHtml(prize.name)}</strong>
          <p>${escapeHtml(historyPrizeMeta(prize))}</p>
        </div>
      </article>
    `).join("");
  }

  if (rosterKey === "history_awards") {
    return list.map((award) => `
      <article class="roster-member">
        <div>
          <strong>${memberText(award.final_member_no, award.final_role_name)}</strong>
          <p>${escapeHtml(historyAwardMeta(award))}</p>
        </div>
      </article>
    `).join("");
  }

  if (rosterKey === "history_draws") {
    return list.map((draw) => `
      <article class="roster-member">
        <div>
          <strong>${memberText(draw.drawn_member_no, draw.drawn_role_name)}</strong>
          <p>${escapeHtml(historyDrawMeta(draw))}</p>
        </div>
      </article>
    `).join("");
  }

  return list.map((member) => `
    <article class="roster-member">
      <div>
        <strong>${memberText(member.member_no, member.role_name)}</strong>
        <p>${escapeHtml(statMemberMeta(member) || "沒有額外資訊")}</p>
      </div>
    </article>
  `).join("");
}

function historyPrizeMeta(prize) {
  return [
    prize.provider ? `提供者：${prize.provider}` : "",
    `名額：${Number(prize.quantity || 0)}`,
    `已發獎：${Number(prize.filled_count || 0)}`,
    `剩餘：${Number(prize.remaining_count || 0)}`
  ].filter(Boolean).join(" / ");
}

function historyAwardMeta(award) {
  return [
    award.prize_name ? `獎項：${award.prize_name}` : "",
    award.provider ? `提供者：${award.provider}` : "",
    award.drawn_member_no ? `原抽中：${memberPlainText(award.drawn_member_no, award.drawn_role_name)}` : "",
    award.status ? `狀態：${drawStatusText[award.status] || award.status}` : "",
    award.resolved_at ? `時間：${formatDate(award.resolved_at)}` : ""
  ].filter(Boolean).join(" / ");
}

function historyDrawMeta(draw) {
  return [
    draw.prize_name ? `獎項：${draw.prize_name}` : "",
    draw.provider ? `提供者：${draw.provider}` : "",
    draw.status ? `結果：${drawLogResultText(draw)}` : "",
    draw.step_probability != null ? `機率：${formatPercent(draw.step_probability)}` : "",
    draw.created_at ? `時間：${formatDate(draw.created_at)}` : ""
  ].filter(Boolean).join(" / ");
}

function statMemberMeta(member) {
  return [
    member.occupation ? `職業：${member.occupation}` : "",
    member.joined_dc === true ? "DC：已加入" : member.joined_dc === false ? "DC：未加入" : "",
    member.reason ? `原因：${drawStatusText[member.reason] || statReasonText(member.reason)}` : "",
    member.prize_name ? `獎項：${member.prize_name}` : ""
  ].filter(Boolean).join(" / ");
}

function statReasonText(reason) {
  const labels = {
    pending: "待處理",
    accepted: "確認得獎",
    declined: "放棄重抽",
    transferred_from: "原抽中後轉讓",
    transferred_to: "指定轉讓"
  };
  return labels[reason] || reason;
}

function renderPendingDraw() {
  const pendingDraws = sortDrawRows(state.event.pending_draws || []);
  const card = $("#pending-card");
  const list = $("#pending-list");
  const moreButton = $("#pending-show-more");
  const moreLabel = $("#pending-show-more-label");
  const visibleCount = Math.min(state.pendingVisibleCount, pendingDraws.length);
  const visibleDraws = pendingDraws.slice(0, visibleCount);
  const hiddenCount = Math.max(pendingDraws.length - visibleCount, 0);

  card.hidden = pendingDraws.length === 0;
  list.innerHTML = "";
  $("#pending-count").textContent = hiddenCount > 0 ? `${pendingDraws.length} 筆，顯示 ${visibleCount}` : `${pendingDraws.length} 筆`;
  moreButton.hidden = hiddenCount === 0;
  moreLabel.textContent = hiddenCount > 0 ? `顯示更多（剩 ${hiddenCount} 筆）` : "顯示更多";

  if (pendingDraws.length === 0) return;

  visibleDraws.forEach((pending) => {
    const item = document.createElement("section");
    item.className = "pending-item";
    item.dataset.drawId = pending.id;
    item.innerHTML = `
      <div class="pending-summary">
        <div>
          <h4>${escapeHtml(pending.role_name)}（${escapeHtml(pending.member_no)}）</h4>
          <p class="description">${escapeHtml([
            pending.prize_name,
            `提供者：${pending.provider}`,
            `職業：${pending.occupation || "未填"}`,
            `DC：${pending.joined_dc ? "已加入" : "未加入"}`
          ].join(" / "))}</p>
        </div>
      </div>
      <div class="button-row">
        <button class="btn primary pending-primary-action" type="button" data-pending-action="accept" data-draw-id="${escapeHtml(pending.id)}">
          <i data-lucide="check"></i>
          <span>確認得獎</span>
        </button>
        <button class="btn secondary" type="button" data-pending-action="decline" data-draw-id="${escapeHtml(pending.id)}">
          <i data-lucide="rotate-ccw"></i>
          <span>放棄並重抽</span>
        </button>
      </div>
      <form class="transfer-form" data-transfer-form data-draw-id="${escapeHtml(pending.id)}">
        <label>
          <span>指定轉讓給成員</span>
          <select name="member_no" data-transfer-select>
            <option value="">選擇轉讓對象</option>
          </select>
        </label>
        <label>
          <span>備註</span>
          <input name="note" autocomplete="off" placeholder="">
        </label>
      </form>
      <div class="pending-transfer-notice" data-transfer-notice hidden></div>
    `;
    list.appendChild(item);
  });
  populateTransferMemberSelect();
  refreshIcons();
}

function showMorePendingDraws() {
  state.pendingVisibleCount += PENDING_DRAW_PAGE_SIZE;
  renderPendingDraw();
}

function renderPrizeTable() {
  renderPrizeRows("#prize-table", state.event.prizes, "尚未新增獎項。", { actions: true });
}

function renderPrizeRows(selector, prizes, emptyMessage, options = {}) {
  const body = $(selector);
  body.innerHTML = "";
  const columnCount = options.actions ? 6 : 5;

  if (prizes.length === 0) {
    appendEmptyRow(body, columnCount, emptyMessage);
    return;
  }

  prizes.forEach((prize) => {
    const row = document.createElement("tr");
    const canAdjust = options.actions && state.event?.status === "live";
    const drawCount = Number(prize.filled_count || 0) + Number(prize.pending_count || 0);
    const anyDrawCount = Number(prize.draw_count ?? drawCount);
    const canDelete = options.actions && state.event?.status === "live" && anyDrawCount === 0;
    row.innerHTML = `
      <td>${escapeHtml(prize.name)}</td>
      <td>${escapeHtml(prize.provider)}</td>
      <td>${escapeHtml(prize.quantity)}</td>
      <td>${escapeHtml(prize.filled_count)}</td>
      <td>${escapeHtml(prize.remaining_count)}</td>
      ${options.actions ? `
        <td class="table-actions-cell">
          <button class="btn table-action" type="button" data-prize-action="bonus" data-prize-id="${escapeHtml(prize.id)}" ${canAdjust ? "" : "disabled"}>
            <i data-lucide="sliders-horizontal"></i>
            <span>調整</span>
          </button>
          <button class="btn table-action danger-action" type="button" data-prize-action="delete" data-prize-id="${escapeHtml(prize.id)}" ${canDelete ? "" : "disabled"}>
            <i data-lucide="trash-2"></i>
            <span>刪除</span>
          </button>
        </td>
      ` : ""}
    `;
    body.appendChild(row);
  });
}

function handlePrizeTableAction(event) {
  const button = event.target.closest("[data-prize-action]");
  if (!button) return;

  if (button.dataset.prizeAction === "bonus") {
    try {
      openBonusPrizeDialog(button.dataset.prizeId || "");
    } catch (error) {
      showToast(friendlyError(error.message || "無法開啟獎項調整視窗。"), "error");
    }
  }

  if (button.dataset.prizeAction === "delete") {
    void deletePrize(button.dataset.prizeId || "");
  }
}

async function deletePrize(prizeId) {
  const prize = state.event?.prizes?.find((item) => item.id === prizeId);
  if (!prize) {
    showToast("找不到這個獎項。", "error");
    return;
  }

  const drawCount = Number(prize.draw_count ?? (Number(prize.filled_count || 0) + Number(prize.pending_count || 0)));
  if (drawCount > 0) {
    showToast("此獎項已有抽獎紀錄，不能刪除。", "error");
    return;
  }

  const confirmed = await requestConfirmDialog({
    title: "刪除獎項",
    message: `確定要刪除「${prize.name}」嗎？這個操作無法復原。`,
    confirmLabel: "刪除獎項"
  });
  if (!confirmed) {
    return;
  }

  await withBusy($("#prize-table"), async () => {
    ensureEventLoaded();
    await ensureAppAdminPin();
    await rpc("delete_raffle_prize", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_prize_id: prizeId
    });
    await loadEvent(state.event.slug);
    showToast("獎項已刪除。", "success");
  });
}

function renderAwards() {
  renderAwardRows("#award-table", state.event.awards, "尚未有中獎紀錄。");
}

function renderAwardRows(selector, awards, emptyMessage) {
  const body = $(selector);
  body.innerHTML = "";

  if (awards.length === 0) {
    appendEmptyRow(body, 6, emptyMessage);
    return;
  }

  awards.forEach((award) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(award.prize_name)}</td>
      <td>${escapeHtml(award.provider)}</td>
      <td>${memberText(award.drawn_member_no, award.drawn_role_name)}</td>
      <td>${memberText(award.final_member_no, award.final_role_name)}</td>
      <td>${escapeHtml(drawStatusText[award.status] || award.status)}</td>
      <td>${escapeHtml(formatDate(award.resolved_at))}</td>
    `;
    body.appendChild(row);
  });
}

function renderDrawLog() {
  renderDrawLogRows("#draw-log-table", state.event.recent_draws, "尚未有抽獎紀錄。", state.event.slug);
}

function renderDrawLogRows(selector, draws, emptyMessage, eventSlug = "") {
  const body = $(selector);
  body.innerHTML = "";

  if (draws.length === 0) {
    appendEmptyRow(body, 6, emptyMessage);
    return;
  }

  draws.forEach((draw) => {
    const row = document.createElement("tr");
    const verifyUrl = buildPublicVerifyUrl(eventSlug, draw.id);
    row.innerHTML = `
      <td>${escapeHtml(draw.prize_name)}</td>
      <td>${escapeHtml(draw.provider || "")}</td>
      <td>${memberText(draw.drawn_member_no, draw.drawn_role_name)}</td>
      <td>${escapeHtml(drawLogResultText(draw))}</td>
      <td>${escapeHtml(formatPercent(draw.step_probability))}</td>
      <td>
        <a class="btn table-action" href="${escapeHtml(verifyUrl)}" target="_blank" rel="noopener">
          <i data-lucide="shield-check"></i>
          <span>驗證</span>
        </a>
      </td>
    `;
    body.appendChild(row);
  });
}

function drawLogResultText(draw) {
  if (draw.status === "transferred") {
    return `指定轉讓：${memberPlainText(draw.final_member_no, draw.final_role_name)}`;
  }

  return drawStatusText[draw.status] || draw.status;
}

function buildPublicVerifyUrl(eventSlug, drawId = "") {
  const url = new URL("public.html", window.location.href);
  if (eventSlug) url.searchParams.set("event", eventSlug);
  if (drawId) url.searchParams.set("draw", drawId);
  if (state.environmentState && !state.environmentState.isDefault) {
    url.searchParams.set("env", state.environmentState.current.id);
  }
  return `${url.pathname}${url.search}`;
}

async function handleAddPrize(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const quantityInput = $("#bonus-prize-quantity");

  await withBusy(form, async () => {
    ensureEventLoaded();
    await ensureAppAdminPin();
    const prizeId = String(data.get("prize_id") || "").trim();
    const quantity = parseBoundedInteger(data.get("quantity"), {
      min: Number(quantityInput.min || 1),
      max: Number(quantityInput.max || 200),
      label: prizeId ? "總名額" : "名額"
    });

    if (prizeId) {
      const prize = state.event.prizes.find((item) => item.id === prizeId);
      if (!prize) {
        throw new Error("找不到要調整的獎項。");
      }
      const usedCount = Number(prize.filled_count || 0) + Number(prize.pending_count || 0);
      if (quantity < usedCount) {
        throw new Error(`總名額不能低於已抽出或待處理數量，目前至少需要 ${usedCount} 名。`);
      }
    }

    if (prizeId) {
      await rpc("set_raffle_prize_quantity", {
        p_slug: state.event.slug,
        p_admin_pin: state.appAdminPin,
        p_prize_id: prizeId,
        p_quantity: quantity
      });
      closeBonusPrizeDialog();
      await loadEvent(state.event.slug);
      showToast(`獎項名額已調整為 ${quantity} 名。`, "success");
      return;
    }

    const prizeName = cleanRequired(data.get("name"), "請輸入獎項名稱。");
    const provider = cleanRequired(data.get("provider"), "請選擇獎項提供者。");
    await rpc("add_raffle_prize", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_name: prizeName,
      p_provider: provider,
      p_quantity: quantity
    });
    closeBonusPrizeDialog();
    await loadEvent(state.event.slug);
    showToast("獎項已新增。", "success");
  });
}

async function handleDrawPrize() {
  await withBusy($("#console-detail"), async () => {
    ensureEventLoaded();
    await ensureAppAdminPin();
    const prizeId = $("#draw-prize-select").value;
    if (!prizeId) {
      throw new Error("沒有可抽的獎項。");
    }
    const drawCount = Number($("#draw-count").value || 1);
    const { prize, limit, prizeRemaining, eligibleRemaining } = getSelectedDrawLimit();

    if (limit <= 0) {
      throw new Error(drawUnavailableMessage(prizeRemaining, eligibleRemaining));
    }

    if (!Number.isInteger(drawCount) || drawCount < 1) {
      throw new Error("抽出人數必須是 1 以上的整數。");
    }

    if (drawCount > limit) {
      $("#draw-count").value = String(limit);
      throw new Error(`抽出人數不能大於剩餘可抽數量，目前最多 ${limit} 位（獎項剩餘 ${prizeRemaining}、可抽成員 ${eligibleRemaining}）。`);
    }

    const [liveDraw] = await rpc("start_raffle_live_draw", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_prize_id: prizeId,
      p_draw_count: drawCount
    });

    const animationContext = {
      prizeName: liveDraw?.prize_name || prize?.name || $("#draw-prize-select").selectedOptions[0]?.textContent || "抽獎",
      drawCount
    };

    let keepResultOpen = false;
    try {
      openDrawAnimation(animationContext);
      const [drawnRows] = await Promise.all([
        rpc("draw_raffle_prize", {
          p_slug: state.event.slug,
          p_admin_pin: state.appAdminPin,
          p_prize_id: prizeId,
          p_draw_count: drawCount
        }),
        waitForAnimation(2200)
      ]);

      const orderedDrawnRows = sortDrawRows(drawnRows || []);
      await revealDrawAnimationResults(orderedDrawnRows, animationContext);
      await finishLiveDraw(liveDraw?.id, "completed", orderedDrawnRows);
      await loadEvent(state.event.slug);
      showToast(drawCount > 1 ? `已抽出 ${drawCount} 位，請處理結果。` : "已抽出，請處理結果。", "success");
      keepResultOpen = true;
    } catch (error) {
      await finishLiveDraw(liveDraw?.id, "failed", [], error.message);
      throw error;
    } finally {
      if (!keepResultOpen) {
        closeDrawAnimation();
      }
    }
  });
}

async function finishLiveDraw(liveId, status, drawRows = [], errorMessage = "") {
  if (!liveId || !state.event?.slug || !state.appAdminPin) return;

  try {
    await rpc("finish_raffle_live_draw", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_live_id: liveId,
      p_status: status,
      p_draw_ids: drawRows.map((row) => row.draw_id).filter(Boolean),
      p_error_message: errorMessage || null
    });
  } catch (error) {
    showToast(`直播狀態更新失敗：${friendlyError(error.message)}`, "warning");
  }
}

function openDrawAnimation(context) {
  const dialog = $("#draw-animation-dialog");
  const phase = $("#draw-animation-phase");
  const prize = $("#draw-animation-prize");
  const roller = $("#draw-animation-roller");
  const results = $("#draw-animation-results");
  const mode = pickDrawAnimationMode();
  const isFireworksMode = mode === "fireworks";

  stopDrawRoller();
  stopDrawFireworks();
  clearDrawAnimationModeClasses(dialog);
  dialog.classList.remove("is-revealed", "has-multiple-results");
  dialog.classList.add(`mode-${mode}`);
  phase.textContent = drawAnimationPhaseText(mode, context.drawCount);
  prize.textContent = context.prizeName;
  results.innerHTML = "";

  drawAnimationState.labels = buildDrawRollerLabels();
  drawAnimationState.index = 0;
  roller.textContent = drawAnimationState.labels[0] || "ROOC";

  showModalDialog(dialog);

  if (isFireworksMode) {
    startDrawFireworks();
  }

  if (!prefersReducedMotion()) {
    drawAnimationState.intervalId = window.setInterval(() => {
      drawAnimationState.index = (drawAnimationState.index + 1) % drawAnimationState.labels.length;
      roller.textContent = drawAnimationState.labels[drawAnimationState.index];
    }, 82);
  }
}

async function revealDrawAnimationResults(rows, context) {
  const dialog = $("#draw-animation-dialog");
  const phase = $("#draw-animation-phase");
  const roller = $("#draw-animation-roller");
  const results = $("#draw-animation-results");
  const labels = rows.map(drawResultLabel).filter(Boolean);
  const hasMultipleResults = labels.length > 1;

  stopDrawRoller();
  dialog.classList.add("is-revealed");
  dialog.classList.toggle("has-multiple-results", hasMultipleResults);
  phase.textContent = hasMultipleResults ? "中獎名單" : "中獎者";
  roller.textContent = hasMultipleResults ? "" : (labels[0] || context.prizeName);
  results.innerHTML = (hasMultipleResults ? labels : [])
    .map((label, index) => `<div class="draw-result-item" style="animation-delay: ${index * 0.06}s">${escapeHtml(label)}</div>`)
    .join("");

  launchDrawFireworks(labels.length || context.drawCount);
  launchDrawConfetti(labels.length || context.drawCount);
  await waitForAnimation(prefersReducedMotion() ? 260 : 1450);
}

function closeDrawAnimation() {
  const dialog = $("#draw-animation-dialog");
  stopDrawRoller();
  stopDrawFireworks();
  closeModalDialog(dialog);
  dialog.classList.remove("is-revealed", "has-multiple-results");
  clearDrawAnimationModeClasses(dialog);
}

function handleDrawAnimationClick(event) {
  const dialog = $("#draw-animation-dialog");
  if (!dialog.classList.contains("is-revealed")) return;

  if (event.target === dialog) {
    closeDrawAnimation();
  }
}

function pickDrawAnimationMode() {
  const pool = DRAW_ANIMATION_MODES.filter((mode) => mode !== state.lastDrawAnimationMode);
  const options = pool.length > 0 ? pool : DRAW_ANIMATION_MODES;
  const mode = options[Math.floor(Math.random() * options.length)] || "fireworks";
  state.drawAnimationMode = mode;
  state.lastDrawAnimationMode = mode;
  return mode;
}

function clearDrawAnimationModeClasses(dialog) {
  DRAW_ANIMATION_MODES.forEach((mode) => {
    dialog.classList.remove(`mode-${mode}`);
  });
}

function drawAnimationPhaseText(mode, drawCount) {
  const prefix = {
    fireworks: "煙火升空中",
    classic: "跑燈抽選中",
    spotlight: "聚光抽選中",
    starlight: "星幕抽選中",
    ripple: "能量聚集中",
    aurora: "極光流轉中",
    runes: "符紋輪轉中",
    confetti: "花火飄落中",
    curtain: "舞台揭幕中"
  }[mode] || "抽選中";

  return drawCount > 1 ? `${prefix} / ${drawCount} 位` : prefix;
}

function stopDrawRoller() {
  if (drawAnimationState.intervalId) {
    window.clearInterval(drawAnimationState.intervalId);
    drawAnimationState.intervalId = null;
  }
}

function buildDrawRollerLabels() {
  const labels = state.providerMembers
    .map((member) => memberOptionLabel(member))
    .filter(Boolean);

  if (labels.length > 0) {
    return labels;
  }

  return ["公會成員", "ROOC", "今日手氣", "幸運名單", "抽選中"];
}

function drawResultLabel(row) {
  if (!row) return "";
  const roleName = row.role_name || row.member_no || "";
  const memberNo = row.member_no && row.member_no !== roleName ? `（${row.member_no}）` : "";
  return `${roleName}${memberNo}`;
}

function sortDrawRows(rows) {
  return asArray(rows)
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftSlot = Number(left.row?.slot_number ?? Number.MAX_SAFE_INTEGER);
      const rightSlot = Number(right.row?.slot_number ?? Number.MAX_SAFE_INTEGER);
      if (leftSlot !== rightSlot) return leftSlot - rightSlot;

      const leftTime = Date.parse(left.row?.created_at || "") || 0;
      const rightTime = Date.parse(right.row?.created_at || "") || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;

      return left.index - right.index;
    })
    .map((item) => item.row);
}

function launchDrawConfetti(resultCount) {
  if (typeof window.confetti !== "function") return;

  const count = Math.min(Math.max(resultCount || 1, 1), 8);
  const baseOptions = {
    particleCount: 48 + count * 12,
    spread: 64,
    startVelocity: 44,
    ticks: 180,
    scalar: 0.92,
    colors: ["#087f8c", "#d95d39", "#f4b942", "#2f855a", "#ffffff"],
    zIndex: 2000,
    disableForReducedMotion: true
  };

  window.confetti({
    ...baseOptions,
    angle: 60,
    origin: { x: 0.18, y: 0.74 }
  });
  window.confetti({
    ...baseOptions,
    angle: 120,
    origin: { x: 0.82, y: 0.74 }
  });
}

function startDrawFireworks() {
  if (prefersReducedMotion()) return;

  const container = $("#draw-fireworks-layer");
  const FireworksConstructor = getFireworksConstructor();
  if (!container || typeof FireworksConstructor !== "function") return;

  stopDrawFireworks();
  try {
    drawAnimationState.fireworks = new FireworksConstructor(container, {
      autoresize: true,
      opacity: 0.46,
      acceleration: 1.04,
      friction: 0.97,
      gravity: 1.35,
      particles: 44,
      traceLength: 3,
      traceSpeed: 9,
      explosion: 5,
      intensity: 18,
      flickering: 54,
      hue: { min: 22, max: 190 },
      delay: { min: 34, max: 74 },
      rocketsPoint: { min: 28, max: 72 },
      brightness: { min: 54, max: 88 },
      decay: { min: 0.015, max: 0.03 },
      mouse: { click: false, move: false, max: 1 }
    });
    drawAnimationState.fireworks.start();
  } catch {
    stopDrawFireworks();
  }
}

function launchDrawFireworks(resultCount) {
  if (state.drawAnimationMode !== "fireworks" || prefersReducedMotion()) return;

  const fireworks = drawAnimationState.fireworks;
  if (!fireworks?.launch) return;

  const count = Math.min(Math.max(resultCount || 1, 2), 8);
  fireworks.launch(count);
}

function stopDrawFireworks() {
  const fireworks = drawAnimationState.fireworks;
  drawAnimationState.fireworks = null;

  if (fireworks?.stop) {
    try {
      fireworks.stop(true);
    } catch {
      // Animation cleanup should never block the raffle flow.
    }
  }

  const container = $("#draw-fireworks-layer");
  if (container) {
    container.innerHTML = "";
  }
}

function getFireworksConstructor() {
  return window.Fireworks?.default || window.Fireworks?.Fireworks || window.Fireworks || null;
}

function waitForAnimation(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

async function resolvePendingDraw(action, drawId, transferMemberNo = null, note = null) {
  await withBusy($("#pending-card"), async () => {
    ensureEventLoaded();
    await ensureAppAdminPin();
    if (!drawId) {
      throw new Error("目前沒有待處理抽獎。");
    }

    await rpc("resolve_raffle_draw", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_draw_id: drawId,
      p_action: action,
      p_transfer_member_no: transferMemberNo,
      p_note: note
    });
    await loadEvent(state.event.slug);
    showToast(drawStatusText[actionMap(action)] || "抽獎結果已處理。", "success");
  });
}

async function handlePendingAction(event) {
  const button = event.target.closest("[data-pending-action]");
  if (!button) return;
  const item = button.closest(".pending-item");
  const form = item?.querySelector("[data-transfer-form]");
  const data = form ? new FormData(form) : null;
  const transferMemberNo = String(data?.get("member_no") || "").trim();

  if (button.dataset.pendingAction === "accept" && transferMemberNo) {
    await resolvePendingDraw("transfer", button.dataset.drawId, transferMemberNo, data.get("note"));
    return;
  }

  await resolvePendingDraw(button.dataset.pendingAction, button.dataset.drawId);
}

async function handlePendingTransfer(event) {
  const form = event.target.closest("[data-transfer-form]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    const memberNo = cleanRequired(data.get("member_no"), "請選擇轉讓對象。");
    await resolvePendingDraw("transfer", form.dataset.drawId, memberNo, data.get("note"));
  } catch (error) {
    showToast(friendlyError(error.message), "error");
  }
}

function handlePendingTransferSelection(event) {
  const select = event.target.closest("[data-transfer-select]");
  if (!select) return;
  updatePendingPrimaryAction(select.closest(".pending-item"));
}

function handleClearPendingTransfer(event) {
  const button = event.target.closest("[data-clear-transfer]");
  if (!button) return;
  const item = button.closest(".pending-item");
  const select = item?.querySelector("[data-transfer-select]");
  if (!select) return;

  select.value = "";
  syncEnhancedSelect(select);
  updatePendingPrimaryAction(item);
}

function updatePendingPrimaryAction(item) {
  if (!item) return;

  const select = item.querySelector("[data-transfer-select]");
  const button = item.querySelector(".pending-primary-action");
  if (!select || !button) return;

  const hasTransferTarget = Boolean(select.value);
  const label = button.querySelector("span");
  const icon = button.querySelector("i");
  const notice = item.querySelector("[data-transfer-notice]");
  const transferLabel = select.selectedOptions[0]?.textContent || "";

  item.classList.toggle("has-transfer-target", hasTransferTarget);
  if (notice) {
    notice.hidden = !hasTransferTarget;
    notice.innerHTML = hasTransferTarget
      ? `
        <span>將指定轉讓給 ${escapeHtml(transferLabel)}，請按「指定轉讓」完成處理。</span>
        <button class="btn secondary pending-clear-transfer" type="button" data-clear-transfer>
          <i data-lucide="x"></i>
          <span>取消轉讓</span>
        </button>
      `
      : "";
  }
  button.classList.toggle("primary", !hasTransferTarget);
  button.classList.toggle("accent", hasTransferTarget);
  button.dataset.pendingAction = "accept";
  if (label) {
    label.textContent = hasTransferTarget ? "指定轉讓" : "確認得獎";
  }
  if (icon) {
    icon.setAttribute("data-lucide", hasTransferTarget ? "move-right" : "check");
  }
  refreshIcons();
}

function actionMap(action) {
  if (action === "accept") return "accepted";
  if (action === "decline") return "declined";
  if (action === "transfer") return "transferred";
  return action;
}

async function setEventStatus(status) {
  let label = "";
  try {
    ensureEventLoaded();
    label = status === "closed" ? "結束活動" : "重新開放活動";
  } catch (error) {
    showToast(friendlyError(error.message), "error");
    return;
  }

  if (status === "closed") {
    const confirmed = await requestConfirmDialog({
      title: "結束活動",
      message: "確定要結束這場活動？結束後可在歷史紀錄查看，也可以重新開放。",
      confirmLabel: "結束活動",
      confirmIcon: "circle-stop",
      confirmKind: "primary"
    });
    if (!confirmed) return;
  }

  await withBusy($("#console-detail"), async () => {
    await ensureAppAdminPin();
    await rpc("set_raffle_event_status", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_status: status
    });
    await loadEvent(state.event.slug);
    await refreshOpenEvents(status === "live" ? state.event.slug : "");
    await refreshHistoryEvents(status === "closed" ? state.event.slug : "");
    showToast(`${label}完成。`, "success");
  });
}

async function deleteLoadedEvent(source) {
  const targetEvent = source === "history" ? state.historyEvent : state.event;
  if (!targetEvent) {
    showToast("請先載入活動。", "error");
    return;
  }

  const confirmed = await requestConfirmDialog({
    title: "刪除活動",
    message: `確定刪除「${targetEvent.title}」？獎項、中獎名單與抽獎紀錄都會一併刪除。`,
    confirmLabel: "刪除活動",
    confirmIcon: "trash-2",
    confirmKind: "danger"
  });
  if (!confirmed) return;

  const busyTarget = source === "history" ? $("#history-detail") : $("#console-detail");
  await withBusy(busyTarget, async () => {
    await ensureAppAdminPin();
    await rpc("delete_raffle_event", {
      p_slug: targetEvent.slug,
      p_admin_pin: state.appAdminPin
    });

    if (state.historyEvent?.slug === targetEvent.slug) {
      state.historyEvent = null;
      clearHistoryDetail();
    }

    if (state.event?.slug === targetEvent.slug) {
      clearLoadedEvent();
    }

    await refreshOpenEvents();
    await refreshHistoryEvents();
    showToast("活動已刪除。", "success");
  });
}

function clearLoadedEvent() {
  state.event = null;
  $("#console-detail").hidden = true;
  $("#console-empty").hidden = false;
  $("#console-status").textContent = "未載入";
  $("#event-title-select").value = "";
  syncEnhancedSelect($("#event-title-select"));
  state.eventSlugHint = "";
  writeLocalValue(STORAGE_KEYS.eventSlug, "");
  writeLocalValue(STORAGE_KEYS.eventTitle, "");
}

async function handleAdminPinSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const pin = cleanRequired(data.get("app_admin_pin"), "請輸入管理密碼。");

  await withBusy(form, async () => {
    await validateAppAdminPassword(pin);
    rememberAppAdminPin(pin);
    await loadAdminBootstrapData();
    closeAdminPinDialog(pin);
    showToast("管理密碼已驗證。", "success");
  });
}

async function handleChangeAdminPin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const currentPin = cleanRequired(data.get("current_pin"), "請輸入目前密碼。");
  const newPin = cleanRequired(data.get("new_pin"), "請輸入新密碼。");
  const confirmPin = cleanRequired(data.get("confirm_pin"), "請再次輸入新密碼。");

  if (newPin.length < 4) {
    showToast("新密碼至少需要 4 個字元。", "error");
    return;
  }

  if (newPin !== confirmPin) {
    showToast("兩次新密碼不一致。", "error");
    return;
  }

  await withBusy(form, async () => {
    await rpc("change_app_admin_pin", {
      p_current_pin: currentPin,
      p_new_pin: newPin
    });
    rememberAppAdminPin(newPin);
    await refreshOpenEvents();
    await refreshHistoryEvents();
    await refreshPrizeProviderMembers();
    await loadOccupations();
    await loadMembers();
    closeAdminPinDialog();
    showToast("管理密碼已修改。", "success");
  });
}

async function handleAdminLogout() {
  forgetAppAdminPin();
  showToast("已登出。", "success");

  if (state.client) {
    await requestAppAdminPin({ mode: "login", required: true });
  }
}

async function ensureAppAdminPin() {
  if (state.appAdminPin) {
    return state.appAdminPin;
  }

  const pin = await requestAppAdminPin();
  if (!pin) {
    throw new Error("需要管理密碼。");
  }
  return pin;
}

function requestAppAdminPin(options = {}) {
  if (state.adminPinPrompt) {
    return state.adminPinPrompt.promise;
  }

  const promise = new Promise((resolve) => {
    state.adminPinPrompt = { resolve, promise: null };
  });
  state.adminPinPrompt.promise = promise;
  state.adminPinMode = options.mode || "verify";
  state.adminPinRequired = Boolean(options.required);
  openAdminPinDialog(state.adminPinMode);
  return promise;
}

function openChangeAdminPinDialog() {
  openAdminPinDialog("change");
}

function openAdminPinDialog(mode) {
  const dialog = $("#admin-pin-dialog");
  const verifyForm = $("#admin-pin-form");
  const changeForm = $("#change-admin-pin-form");
  const isChange = mode === "change";
  const isLogin = mode === "login";
  const isRequired = Boolean(state.adminPinRequired);
  const canReturnPublic = isLogin && isRequired;

  $("#admin-pin-title").textContent = isChange ? "修改管理密碼" : isLogin ? "後台登入" : "管理密碼";
  $("#admin-pin-label").textContent = isLogin ? "輸入管理密碼" : "首次設定或驗證管理密碼";
  $("#admin-pin-submit-label").textContent = isLogin ? "登入" : "確認";
  $("#cancel-admin-pin").hidden = isRequired && !canReturnPublic;
  $("#cancel-admin-pin").setAttribute("aria-label", canReturnPublic ? "返回公開驗證" : "取消管理密碼驗證");
  $("#dismiss-admin-pin").hidden = isRequired;
  $("#return-public-from-login").hidden = !canReturnPublic;
  verifyForm.hidden = isChange;
  changeForm.hidden = !isChange;
  verifyForm.reset();
  changeForm.reset();

  showModalDialog(dialog);
  refreshIcons();

  window.setTimeout(() => {
    const input = isChange ? changeForm.elements.current_pin : verifyForm.elements.app_admin_pin;
    input?.focus();
  }, 0);
}

function cancelAdminPinPrompt() {
  if (state.adminPinRequired) {
    if (state.adminPinMode === "login") {
      returnToPublicPage();
    }
    return;
  }
  closeAdminPinDialog(null);
}

function returnToPublicPage() {
  window.location.href = buildPublicPageUrl();
}

function buildPublicPageUrl() {
  const url = new URL("public.html", window.location.href);
  const params = new URLSearchParams(window.location.search);
  const eventSlug = params.get("event") || params.get("slug") || state.eventSlugHint || "";
  if (eventSlug) {
    url.searchParams.set("event", eventSlug);
  }
  return `${url.pathname}${url.search}`;
}

function closeAdminPinDialog(resolveValue = null) {
  const prompt = state.adminPinPrompt;
  state.adminPinPrompt = null;
  state.adminPinMode = "";
  state.adminPinRequired = false;
  $("#admin-pin-form").reset();
  $("#change-admin-pin-form").reset();
  $("#return-public-from-login").hidden = true;
  closeModalDialog($("#admin-pin-dialog"));
  if (prompt) {
    prompt.resolve(resolveValue);
  }
}

async function prepareMemberPanel() {
  if (!state.appAdminPin || !state.client) return;
  await withBusy($("#panel-members"), async () => {
    await loadOccupations();
    await loadMembers();
  });
}

async function handleOccupationSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  await withBusy(form, async () => {
    await ensureAppAdminPin();
    const originalName = String(data.get("original_name") || "").trim();
    await rpc("upsert_rooc_occupation", {
      p_app_admin_pin: state.appAdminPin,
      p_name: data.get("name"),
      p_original_name: originalName,
      p_is_active: data.get("is_active") === "on"
    });
    clearOccupationEdit();
    await loadOccupations();
    await loadMembers();
    showToast(originalName ? "職業修改已儲存。" : "職業已新增。", "success");
  });
}

async function openOccupationDialog() {
  await withBusy($("#occupation-dialog"), async () => {
    await ensureAppAdminPin();
    await loadOccupations();
    showModalDialog($("#occupation-dialog"));
    refreshIcons();
  });
}

function closeOccupationDialog() {
  const dialog = $("#occupation-dialog");
  clearOccupationEdit();
  closeModalDialog(dialog);
}

async function loadOccupations() {
  const rows = await rpc("get_rooc_occupations", {
    p_app_admin_pin: state.appAdminPin,
    p_include_inactive: true
  });
  state.occupations = rows || [];
  renderOccupations();
  renderOccupationOptions();
}

function renderOccupations() {
  const body = $("#occupation-table");
  body.innerHTML = "";

  if (state.occupations.length === 0) {
    appendEmptyRow(body, 3, "尚未建立職業。");
    return;
  }

  state.occupations.forEach((occupation) => {
    const activeLabel = occupation.is_active ? "啟用中" : "已停用";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(occupation.name)}</td>
      <td><span class="table-badge ${occupation.is_active ? "is-on" : "is-off"}">${activeLabel}</span></td>
      <td>
        <button class="btn table-action" type="button" data-edit-occupation="${escapeHtml(occupation.name)}" data-active="${occupation.is_active ? "1" : "0"}">
          編輯
        </button>
        <button class="btn table-action" type="button" data-toggle-occupation="${escapeHtml(occupation.name)}" data-active="${occupation.is_active ? "0" : "1"}">
          ${occupation.is_active ? "停用" : "啟用"}
        </button>
      </td>
    `;
    body.appendChild(row);
  });

  $all("[data-edit-occupation]").forEach((button) => {
    button.addEventListener("click", () => editOccupation(button.dataset.editOccupation, button.dataset.active === "1"));
  });
  $all("[data-toggle-occupation]").forEach((button) => {
    button.addEventListener("click", () => toggleOccupation(button.dataset.toggleOccupation, button.dataset.active === "1"));
  });
}

function renderOccupationOptions() {
  $all("[data-occupation-select], #member-occupation, #edit-member-occupation").forEach((select) => {
    populateOccupationSelect(select, select.value);
  });
}

function populateOccupationSelect(select, current = "") {
  if (!select) return;
  select.innerHTML = "";
  select.append(new Option("未設定", ""));

  state.occupations
    .filter((occupation) => occupation.is_active)
    .forEach((occupation) => {
      select.append(new Option(occupation.name, occupation.name));
    });

  if (current && state.occupations.some((occupation) => occupation.name === current)) {
    if (!Array.from(select.options).some((option) => option.value === current)) {
      select.append(new Option(`${current}（已停用）`, current));
    }
    select.value = current;
  }
}

function editOccupation(name, isActive) {
  const form = $("#occupation-form");
  form.elements.original_name.value = name;
  form.elements.name.value = name;
  form.elements.is_active.checked = isActive;
  renderOccupationEditState(name);
  form.elements.name.focus();
}

function renderOccupationEditState(name = "") {
  const isEditing = Boolean(name);
  $("#occupation-form-mode").textContent = isEditing ? "編輯職業" : "新增職業";
  $("#occupation-edit-label").textContent = isEditing ? `正在編輯：${name}` : "建立新的職業選項";
  $("#occupation-edit-badge").textContent = isEditing ? "編輯中" : "新增";
  $("#occupation-submit-label").textContent = isEditing ? "儲存修改" : "新增職業";
  const icon = $("#occupation-form button[type='submit'] i");
  if (icon) {
    icon.dataset.lucide = isEditing ? "save" : "plus";
    refreshIcons();
  }
}

async function toggleOccupation(name, isActive) {
  await withBusy($("#occupation-table"), async () => {
    await ensureAppAdminPin();
    await rpc("upsert_rooc_occupation", {
      p_app_admin_pin: state.appAdminPin,
      p_name: name,
      p_original_name: name,
      p_is_active: isActive
    });
    await loadOccupations();
    showToast(isActive ? "職業已啟用。" : "職業已停用。", "success");
  });
}

function clearOccupationEdit() {
  const form = $("#occupation-form");
  if (!form) return;
  form.reset();
  form.elements.original_name.value = "";
  form.elements.is_active.checked = true;
  renderOccupationEditState();
}

async function handleMemberSave(event) {
  event.preventDefault();
  const form = event.currentTarget;

  await withBusy(form, async () => {
    await saveMemberForm(form);
    closeMemberCreateDialog();
    await loadMembers();
    await refreshPrizeProviderMembers();
    await refreshTransferCandidates();
    showToast("成員已新增。", "success");
  });
}

async function handleMemberEditSave(event) {
  event.preventDefault();
  const form = event.currentTarget;

  await withBusy(form, async () => {
    await saveMemberForm(form);
    closeMemberEditDialog();
    await loadMembers();
    await refreshPrizeProviderMembers();
    await refreshTransferCandidates();
    showToast("成員修改已儲存。", "success");
  });
}

async function saveMemberForm(form) {
  const data = new FormData(form);
  await ensureAppAdminPin();
  const memberNo = cleanRequired(data.get("member_no"), "請輸入成員編號。");
  const originalMemberNo = String(data.get("original_member_no") || "").trim();
  const roleName = cleanRequired(data.get("role_name"), "請輸入角色名稱。");

  if (!originalMemberNo) {
    await ensureMemberNoAvailable(memberNo);
  }

  await rpc("upsert_rooc_member", {
    p_app_admin_pin: state.appAdminPin,
    p_member_no: memberNo,
    p_original_member_no: originalMemberNo || null,
    p_role_name: roleName,
    p_occupation: data.get("occupation"),
    p_joined_dc: data.get("joined_dc") === "on",
    p_is_active: data.get("is_active") === "on"
  });
}

async function ensureMemberNoAvailable(memberNo) {
  const rows = await rpc("get_rooc_members", {
    p_app_admin_pin: state.appAdminPin,
    p_query: memberNo,
    p_include_inactive: true
  });

  if ((rows || []).some((member) => member.member_no === memberNo)) {
    throw new Error("成員編號已存在。");
  }
}

async function handleMemberSearch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearMemberSearchTimer();
  await withBusy(form, async () => {
    await ensureAppAdminPin();
    await loadMembers();
  });
}

function scheduleMemberSearch(delay = 300) {
  clearMemberSearchTimer();
  memberSearchTimer = window.setTimeout(() => {
    if (!state.appAdminPin) return;

    void withBusy($("#member-search-form"), async () => {
      await ensureAppAdminPin();
      await loadMembers();
    });
  }, delay);
}

function clearMemberSearchTimer() {
  if (memberSearchTimer) {
    window.clearTimeout(memberSearchTimer);
    memberSearchTimer = null;
  }
}

async function loadMembers() {
  const loadSeq = ++memberLoadSeq;
  const searchForm = $("#member-search-form");
  const data = new FormData(searchForm);
  const rows = await rpc("get_rooc_members", {
    p_app_admin_pin: state.appAdminPin,
    p_query: data.get("query"),
    p_include_inactive: data.get("include_inactive") === "on"
  });
  if (loadSeq !== memberLoadSeq) return;
  state.members = rows || [];
  renderMembers();
}

function sortMembersBy(key) {
  if (!key) return;

  if (state.memberSort.key === key) {
    state.memberSort.direction = state.memberSort.direction === "asc" ? "desc" : "asc";
  } else {
    state.memberSort = {
      key,
      direction: "asc"
    };
  }

  renderMembers();
}

function renderMembers() {
  const body = $("#member-table");
  body.innerHTML = "";
  $("#member-status").textContent = `${state.members.length} 筆`;
  renderMemberSortButtons();

  if (state.members.length === 0) {
    appendEmptyRow(body, 6, "沒有符合條件的成員。");
    return;
  }

  getSortedMembers().forEach((member) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(member.member_no)}</td>
      <td>${escapeHtml(member.role_name || "")}</td>
      <td>${escapeHtml(member.occupation || "")}</td>
      <td>${member.joined_dc ? "是" : "否"}</td>
      <td><span class="table-badge ${member.is_active ? "is-on" : "is-off"}">${member.is_active ? "公會中" : "已退會"}</span></td>
      <td>
        <button class="btn table-action" type="button" data-edit-member="${escapeHtml(member.member_no)}">
          編輯
        </button>
        <button class="btn table-action" type="button" data-toggle-member="${escapeHtml(member.member_no)}" data-active="${member.is_active ? "0" : "1"}">
          ${member.is_active ? "標記退會" : "恢復公會中"}
        </button>
      </td>
    `;
    body.appendChild(row);
  });

  $all("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => editMember(button.dataset.editMember));
  });
  $all("[data-toggle-member]").forEach((button) => {
    button.addEventListener("click", () => toggleMember(button.dataset.toggleMember, button.dataset.active === "1"));
  });
}

function getSortedMembers() {
  const direction = state.memberSort.direction === "desc" ? -1 : 1;
  return state.members
    .map((member, index) => ({ member, index }))
    .sort((left, right) => {
      const result = compareMemberValue(left.member, right.member, state.memberSort.key);
      if (result !== 0) return result * direction;
      return left.index - right.index;
    })
    .map((item) => item.member);
}

function compareMemberValue(left, right, key) {
  if (key === "joined_dc" || key === "is_active") {
    return booleanSortValue(right[key]) - booleanSortValue(left[key]);
  }

  return memberCollator.compare(memberSortText(left[key]), memberSortText(right[key]));
}

function booleanSortValue(value) {
  return value ? 1 : 0;
}

function memberSortText(value) {
  return String(value || "").trim();
}

function renderMemberSortButtons() {
  $all("[data-member-sort]").forEach((button) => {
    const isActive = button.dataset.memberSort === state.memberSort.key;
    const icon = isActive
      ? (state.memberSort.direction === "asc" ? "arrow-up" : "arrow-down")
      : "arrow-up-down";

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.querySelector("[data-member-sort-icon]").innerHTML = `<i data-lucide="${icon}"></i>`;
  });
  refreshIcons();
}

async function openMemberCreateDialog() {
  await withBusy($("#open-member-create-dialog").parentElement, async () => {
    await ensureAppAdminPin();
    await loadOccupations();

    const dialog = $("#member-create-dialog");
    resetMemberCreateForm();
    showModalDialog(dialog);
    refreshIcons();
    window.setTimeout(() => $("#member-form").elements.member_no.focus(), 0);
  });
}

function closeMemberCreateDialog() {
  const dialog = $("#member-create-dialog");
  resetMemberCreateForm();
  closeModalDialog(dialog);
}

function editMember(memberNo) {
  const member = state.members.find((item) => item.member_no === memberNo);
  if (!member) {
    showToast("找不到這筆成員資料。", "error");
    return;
  }

  const dialog = $("#member-edit-dialog");
  const form = $("#member-edit-form");
  form.elements.original_member_no.value = member.member_no || "";
  form.elements.member_no.value = member.member_no || "";
  form.elements.role_name.value = member.role_name || "";
  populateOccupationSelect(form.elements.occupation, member.occupation || "");
  form.elements.joined_dc.checked = Boolean(member.joined_dc);
  form.elements.is_active.checked = Boolean(member.is_active);
  showModalDialog(dialog);
  refreshIcons();
  window.setTimeout(() => form.elements.role_name.focus(), 0);
}

function closeMemberEditDialog() {
  const dialog = $("#member-edit-dialog");
  $("#member-edit-form").reset();
  closeModalDialog(dialog);
}

function resetMemberCreateForm(options = {}) {
  const { focus = false } = options;
  const form = $("#member-form");
  form.reset();
  form.elements.occupation.value = "";
  form.elements.is_active.checked = true;
  if (focus) {
    form.elements.member_no.focus();
  }
}

async function openMemberImportDialog() {
  await withBusy($("#open-member-import-dialog").parentElement, async () => {
    await ensureAppAdminPin();
    await loadOccupations();
    resetMemberImportDialog({ keepFile: false });
    showModalDialog($("#member-import-dialog"));
    refreshIcons();
  });
}

function closeMemberImportDialog() {
  resetMemberImportDialog({ keepFile: false });
  closeModalDialog($("#member-import-dialog"));
}

function resetMemberImportDialog(options = {}) {
  const { keepFile = false } = options;
  const form = $("#member-import-form");

  if (!keepFile) {
    form.reset();
    form.elements.auto_create_occupations.checked = true;
    form.elements.update_existing.checked = false;
  }

  state.memberImportRawRows = [];
  state.memberImportRows = [];
  state.memberImportExisting = new Map();
  $("#member-import-table").innerHTML = "";
  $("#member-import-summary").hidden = true;
  $("#member-import-preview").hidden = true;
  $("#confirm-member-import").disabled = true;
}

async function handleMemberImportFile(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) {
    resetMemberImportDialog({ keepFile: true });
    return;
  }

  const form = $("#member-import-form");
  await withBusy(form, async () => {
    await ensureAppAdminPin();
    await loadOccupations();
    state.memberImportRawRows = [];
    state.memberImportRows = [];
    state.memberImportExisting = new Map();
    renderMemberImportPreview();
    const rawRows = await readMemberImportFile(file);
    if (rawRows.length === 0) {
      throw new Error("檔案裡沒有可匯入的資料。");
    }

    state.memberImportRawRows = rawRows;
    state.memberImportExisting = await buildMemberImportExistingMap(rawRows);
    renderMemberImportPreview();
  });
  renderMemberImportPreview();
}

async function readMemberImportFile(file) {
  if (!String(file?.name || "").toLowerCase().endsWith(".xlsx")) {
    throw new Error("請選擇 .xlsx Excel 檔案。");
  }

  if (!window.XLSX?.read || !window.XLSX?.utils?.sheet_to_json) {
    throw new Error("Excel 解析套件尚未載入，請重新整理頁面。");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    throw new Error("檔案裡沒有工作表。");
  }

  const sheet = workbook.Sheets[sheetName];
  return window.XLSX.utils
    .sheet_to_json(sheet, { defval: "", raw: false })
    .filter((row) => !isImportRowBlank(row));
}

async function buildMemberImportExistingMap(rawRows) {
  const memberNos = Array.from(new Set(
    rawRows
      .map((row) => cleanImportValue(pickImportValue(row, "member_no")))
      .filter(Boolean)
  ));
  const existing = new Map();

  for (const memberNo of memberNos) {
    existing.set(memberNo, await memberExists(memberNo));
  }

  return existing;
}

async function memberExists(memberNo) {
  const rows = await rpc("get_rooc_members", {
    p_app_admin_pin: state.appAdminPin,
    p_query: memberNo,
    p_include_inactive: true
  });
  return (rows || []).some((member) => member.member_no === memberNo);
}

function renderMemberImportPreview() {
  const rows = buildMemberImportRows();
  state.memberImportRows = rows;
  renderMemberImportSummary(rows);
  renderMemberImportTable(rows);
}

function buildMemberImportRows() {
  const form = $("#member-import-form");
  const autoCreateOccupations = form.elements.auto_create_occupations.checked;
  const updateExisting = form.elements.update_existing.checked;
  const activeOccupations = new Set(
    state.occupations
      .filter((occupation) => occupation.is_active)
      .map((occupation) => occupation.name)
  );
  const memberNoCounts = countImportMemberNos(state.memberImportRawRows);

  return state.memberImportRawRows.map((raw, index) => {
    const memberNo = cleanImportValue(pickImportValue(raw, "member_no"));
    const roleName = cleanImportValue(pickImportValue(raw, "role_name"));
    const occupation = cleanImportValue(pickImportValue(raw, "occupation"));
    const joinedDc = parseImportDcValue(pickImportValue(raw, "joined_dc"));
    const isActive = parseImportActiveValue(pickImportValue(raw, "is_active"));
    const exists = memberNo ? Boolean(state.memberImportExisting.get(memberNo)) : false;
    const errors = [];
    let newOccupation = false;

    if (!memberNo) errors.push("缺少編號");
    if (!roleName) errors.push("缺少角色名稱");
    if (memberNo && memberNo.length > 80) errors.push("編號超過 80 字");
    if (roleName && roleName.length > 120) errors.push("角色名稱超過 120 字");
    if (memberNo && memberNoCounts.get(memberNo) > 1) errors.push("檔案內編號重複");
    if (exists && !updateExisting) errors.push("編號已存在");

    if (occupation && !activeOccupations.has(occupation)) {
      if (autoCreateOccupations) {
        newOccupation = true;
      } else {
        errors.push("職業未啟用");
      }
    }

    return {
      rowNumber: index + 2,
      member_no: memberNo,
      role_name: roleName,
      occupation,
      joined_dc: joinedDc,
      is_active: isActive,
      exists,
      newOccupation,
      errors
    };
  });
}

function countImportMemberNos(rawRows) {
  const counts = new Map();
  rawRows.forEach((raw) => {
    const memberNo = cleanImportValue(pickImportValue(raw, "member_no"));
    if (!memberNo) return;
    counts.set(memberNo, (counts.get(memberNo) || 0) + 1);
  });
  return counts;
}

function renderMemberImportSummary(rows = state.memberImportRows) {
  const summary = $("#member-import-summary");
  const preview = $("#member-import-preview");
  const validRows = rows.filter((row) => row.errors.length === 0);
  const errorRows = rows.filter((row) => row.errors.length > 0);
  const newOccupations = getMemberImportNewOccupations(validRows);

  summary.hidden = rows.length === 0;
  preview.hidden = rows.length === 0;
  $("#member-import-total").textContent = `${rows.length} 筆`;
  $("#member-import-valid").textContent = `${validRows.length} 筆可匯入`;
  $("#member-import-error").textContent = `${errorRows.length} 筆錯誤`;
  $("#member-import-occupation").textContent = `${newOccupations.length} 個新職業`;
  $("#confirm-member-import").disabled = validRows.length === 0;
}

function renderMemberImportTable(rows = state.memberImportRows) {
  const body = $("#member-import-table");
  body.innerHTML = "";

  if (rows.length === 0) {
    appendEmptyRow(body, 7, "尚未選擇檔案。");
    return;
  }

  rows.forEach((row) => {
    const rowElement = document.createElement("tr");
    const status = memberImportStatus(row);
    const note = row.importMessage || row.errors.join("、") || (row.newOccupation ? "將建立職業" : "");
    rowElement.classList.toggle("import-row-error", row.errors.length > 0 || row.importStatus === "failed");
    rowElement.classList.toggle("import-row-done", row.importStatus === "done");
    rowElement.innerHTML = `
      <td><span class="table-badge ${status.className}">${status.label}</span></td>
      <td>${escapeHtml(row.member_no)}</td>
      <td>${escapeHtml(row.role_name)}</td>
      <td>${escapeHtml(row.occupation || "")}</td>
      <td>${row.joined_dc ? "是" : "否"}</td>
      <td>${row.is_active ? "公會中" : "已退會"}</td>
      <td>${escapeHtml(note)}</td>
    `;
    body.appendChild(rowElement);
  });
}

function memberImportStatus(row) {
  if (row.importStatus === "importing") return { label: "匯入中", className: "is-pending" };
  if (row.importStatus === "done") return { label: "完成", className: "is-on" };
  if (row.importStatus === "failed") return { label: "失敗", className: "is-off" };
  if (row.errors.length > 0) return { label: "錯誤", className: "is-off" };
  if (row.exists) return { label: "更新", className: "is-pending" };
  return { label: "新增", className: "is-on" };
}

function getMemberImportNewOccupations(rows = state.memberImportRows) {
  return Array.from(new Set(
    rows
      .filter((row) => row.errors.length === 0 && row.newOccupation && row.occupation)
      .map((row) => row.occupation)
  ));
}

async function handleMemberImportSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  await withBusy(form, async () => {
    await ensureAppAdminPin();
    await loadOccupations();
    renderMemberImportPreview();

    const rows = state.memberImportRows.filter((row) => row.errors.length === 0);
    if (rows.length === 0) {
      throw new Error("沒有可匯入的資料。");
    }

    const newOccupations = getMemberImportNewOccupations(rows);
    for (const occupation of newOccupations) {
      await rpc("upsert_rooc_occupation", {
        p_app_admin_pin: state.appAdminPin,
        p_name: occupation,
        p_original_name: null,
        p_is_active: true
      });
    }

    if (newOccupations.length > 0) {
      await loadOccupations();
    }

    let successCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      row.importStatus = "importing";
      row.importMessage = "匯入中";
      renderMemberImportTable();

      try {
        await rpc("upsert_rooc_member", {
          p_app_admin_pin: state.appAdminPin,
          p_member_no: row.member_no,
          p_original_member_no: row.exists ? row.member_no : null,
          p_role_name: row.role_name,
          p_occupation: row.occupation || null,
          p_joined_dc: row.joined_dc,
          p_is_active: row.is_active
        });
        row.importStatus = "done";
        row.importMessage = row.exists ? "已更新" : "已新增";
        row.exists = true;
        state.memberImportExisting.set(row.member_no, true);
        successCount += 1;
      } catch (error) {
        row.importStatus = "failed";
        row.importMessage = friendlyError(error.message);
        failedCount += 1;
      }

      renderMemberImportTable();
    }

    await loadMembers();
    await refreshPrizeProviderMembers();
    await refreshTransferCandidates();
    showToast(`匯入完成：成功 ${successCount} 筆，失敗 ${failedCount} 筆。`, failedCount > 0 ? "warning" : "success");
  });
  renderMemberImportSummary();
  renderMemberImportTable();
}

function downloadMemberImportTemplate() {
  if (!canExportXlsx()) {
    showToast("Excel 匯出套件尚未載入，請重新整理後再試。", "error");
    return;
  }

  downloadXlsx("rooc-members-template.xlsx", "成員匯入範本", [
    ["編號", "角色名稱", "職業", "是否加入DC", "公會狀態"],
    ["M0001", "雞蛋糕", "神官", "是", "公會中"],
    ["M0002", "Nanami", "騎士", "否", "公會中"]
  ], [
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 }
  ]);
}

function pickImportValue(row, key) {
  const aliases = MEMBER_IMPORT_HEADER_ALIASES[key].map(normalizeImportHeader);
  const matchedKey = Object.keys(row).find((header) => aliases.includes(normalizeImportHeader(header)));
  return matchedKey ? row[matchedKey] : "";
}

function normalizeImportHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/\\]/g, "");
}

function cleanImportValue(value) {
  return String(value ?? "").trim();
}

function isImportRowBlank(row) {
  return Object.values(row).every((value) => cleanImportValue(value) === "");
}

function parseImportDcValue(value) {
  const text = normalizeImportBooleanText(value);
  if (!text) return false;
  if (text.includes("未加入") || text.includes("否") || text.includes("無") || text === "0" || text === "false" || text === "no" || text === "n") return false;
  if (text.includes("已加入") || text.includes("加入") || text.includes("是") || text === "1" || text === "true" || text === "yes" || text === "y") return true;
  return false;
}

function parseImportActiveValue(value) {
  const text = normalizeImportBooleanText(value);
  if (!text) return true;
  if (text.includes("退") || text.includes("離") || text.includes("停") || text.includes("否") || text === "0" || text === "false" || text === "no" || text === "n") return false;
  if (text.includes("公會中") || text.includes("在會") || text.includes("啟用") || text.includes("是") || text === "1" || text === "true" || text === "yes" || text === "y") return true;
  return true;
}

function normalizeImportBooleanText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

async function toggleMember(memberNo, isActive) {
  await withBusy($("#member-table"), async () => {
    await ensureAppAdminPin();
    await rpc("set_rooc_member_active", {
      p_app_admin_pin: state.appAdminPin,
      p_member_no: memberNo,
      p_is_active: isActive
    });
    await loadMembers();
    await refreshPrizeProviderMembers();
    await refreshTransferCandidates();
    showToast(isActive ? "成員已恢復公會中。" : "成員已標記退會。", "success");
  });
}

function exportAwardsExcel() {
  try {
    ensureEventLoaded();
  } catch (error) {
    showToast(friendlyError(error.message), "error");
    return;
  }

  exportEventAwardsExcel(state.event);
}

function exportHistoryAwardsExcel() {
  if (!state.historyEvent) {
    showToast("請先載入歷史活動。", "error");
    return;
  }

  exportEventAwardsExcel(state.historyEvent);
}

function exportDrawLogExcel() {
  try {
    ensureEventLoaded();
  } catch (error) {
    showToast(friendlyError(error.message), "error");
    return;
  }

  exportEventDrawLogExcel(state.event);
}

function exportHistoryDrawLogExcel() {
  if (!state.historyEvent) {
    showToast("請先載入歷史活動。", "error");
    return;
  }

  exportEventDrawLogExcel(state.historyEvent);
}

function exportEventAwardsExcel(event) {
  const rows = event.awards;
  if (rows.length === 0) {
    showToast("目前沒有中獎名單可匯出。", "error");
    return;
  }

  if (!canExportXlsx()) {
    showToast("Excel 匯出套件尚未載入，請重新整理後再試。", "error");
    return;
  }

  const headers = ["獎項", "提供者", "名額序", "原抽中編號", "原抽中名稱", "領獎編號", "領獎名稱", "狀態", "備註", "時間"];
  const excelRows = rows.map((award) => [
    award.prize_name,
    award.provider,
    award.slot_number,
    award.drawn_member_no,
    award.drawn_role_name,
    award.final_member_no,
    award.final_role_name,
    drawStatusText[award.status] || award.status,
    award.note || "",
    formatDate(award.resolved_at)
  ]);

  downloadXlsx(`${event.slug}-awards.xlsx`, "中獎名單", [headers, ...excelRows], [
    { wch: 20 },
    { wch: 18 },
    { wch: 8 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 18 }
  ]);
}

function exportEventDrawLogExcel(event) {
  const rows = asArray(event.recent_draws);
  if (rows.length === 0) {
    showToast("目前沒有抽獎紀錄可匯出。", "error");
    return;
  }

  if (!canExportXlsx()) {
    showToast("Excel 匯出套件尚未載入，請重新整理後再試。", "error");
    return;
  }

  const headers = [
    "獎項",
    "提供者",
    "名額序",
    "抽中編號",
    "抽中名稱",
    "領獎編號",
    "領獎名稱",
    "結果",
    "單步機率",
    "建立時間",
    "處理時間",
    "公開驗證連結"
  ];
  const excelRows = rows.map((draw) => [
    draw.prize_name,
    draw.provider,
    draw.slot_number,
    draw.drawn_member_no,
    draw.drawn_role_name,
    draw.final_member_no,
    draw.final_role_name,
    drawLogResultText(draw),
    formatPercent(draw.step_probability),
    formatDate(draw.created_at),
    formatDate(draw.resolved_at),
    buildPublicVerifyUrl(event.slug, draw.id)
  ]);

  downloadXlsx(`${event.slug}-draw-log.xlsx`, "抽獎紀錄", [headers, ...excelRows], [
    { wch: 20 },
    { wch: 18 },
    { wch: 8 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 22 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 42 }
  ]);
}

function canExportXlsx() {
  return Boolean(window.XLSX?.utils?.aoa_to_sheet && window.XLSX?.utils?.book_new && window.XLSX?.writeFile);
}

function downloadXlsx(filename, sheetName, rows, columns = []) {
  const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
  if (columns.length > 0) {
    worksheet["!cols"] = columns;
  }

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  window.XLSX.writeFile(workbook, filename);
}

async function rpc(name, args) {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function requireClient() {
  if (!state.client) {
    throw new Error("Supabase 尚未設定。請設定 SUPABASE_URL 與 SUPABASE_ANON_KEY。");
  }
  return state.client;
}

function ensureEventLoaded() {
  if (!state.event) {
    switchTab("console");
    throw new Error("請先載入活動。");
  }
}

async function withBusy(target, action) {
  setBusy(target, true);
  try {
    await action();
  } catch (error) {
    rememberInvalidPins(error);
    showToast(friendlyError(error.message || "操作失敗。"), "error");
  } finally {
    setBusy(target, false);
  }
}

function rememberInvalidPins(error) {
  const message = String(error?.message || "");
  if (
    message.includes("App admin PIN is invalid") ||
    message.includes("App admin PIN is not initialized") ||
    message.includes("成員管理 PIN 不正確") ||
    message.includes("尚未設定成員管理 PIN") ||
    message.includes("管理密碼不正確") ||
    message.includes("尚未設定管理密碼")
  ) {
    forgetAppAdminPin();
  }
}

function friendlyError(message) {
  const text = String(message || "");
  const normalized = text
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.includes("App admin PIN is invalid") || text.includes("成員管理 PIN 不正確") || text.includes("管理密碼不正確")) return "管理密碼不正確。";
  if (text.includes("App admin PIN is not initialized") || text.includes("尚未設定成員管理 PIN") || text.includes("尚未設定管理密碼")) return "尚未設定管理密碼。";
  if (text.includes("App admin PIN must be at least 4 characters") || text.includes("成員管理 PIN 至少需要 4 個字元") || text.includes("管理密碼至少需要 4 個字元")) return "管理密碼至少需要 4 個字元。";
  if (text.includes("Raffle event not found") || text.includes("找不到活動")) return "找不到活動。";
  if (text.includes("Raffle event title already exists") || text.includes("活動名稱已存在")) return "活動名稱已存在。";
  if (text.includes("raffle_events_slug_check")) return "活動代碼格式不正確。請使用至少 3 個小寫英文字母、數字或連字號。";
  if (text.includes("new row for relation") && text.includes("violates check constraint")) return "資料格式不符合系統規則，請檢查輸入內容。";
  if (text.includes("duplicate key value violates unique constraint") && text.includes("raffle_events_title")) return "活動名稱已存在。";
  if (text.includes("duplicate key value violates unique constraint") && text.includes("raffle_events_slug")) return "活動代碼已存在，請換一個活動名稱。";
  if (text.includes("duplicate key value violates unique constraint") && text.includes("rooc_members")) return "成員編號已存在。";
  if (text.includes("duplicate key value violates unique constraint") && text.includes("rooc_occupations")) return "職業名稱已存在。";
  if (text.includes("duplicate key value violates unique constraint")) return "資料已存在，請確認是否重複新增。";
  if (text.includes("violates foreign key constraint")) return "關聯資料不存在或已被刪除，請重新整理後再試。";
  if (text.includes("invalid input syntax for type uuid")) return "資料識別碼格式不正確，請重新整理頁面後再試。";
  if (text.includes("permission denied") || text.includes("insufficient_privilege")) return "目前沒有權限執行這個操作。";
  if (text.includes("Could not find the function") || text.includes("PGRST202")) return "資料庫功能尚未更新，請稍後重新整理頁面。";
  if (text.includes("JWT") && text.includes("expired")) return "連線憑證已過期，請重新整理頁面。";
  if (text.includes("Failed to fetch") || text.includes("NetworkError")) return "無法連線到 Supabase，請檢查網路或稍後再試。";
  if (text.includes("JSON object requested, multiple")) return "資料重複，請檢查設定。";
  if (text.includes("Cannot read properties") || text.includes("is not a function")) return "介面狀態不同步，請重新整理頁面後再試。";
  if (text.includes("An invalid form control") || text.includes("not focusable")) return "表單欄位狀態異常，請重新開啟視窗後再試。";
  if (text.includes("The specified value") && text.includes("cannot be parsed")) return "請輸入有效的數字。";
  if (text.includes("總名額不能低於已抽出或待處理數量")) return text;
  if (text.includes("名額不能低於已抽出或待處理數量")) return "總名額不能低於已抽出或待處理數量。";
  if (text.includes("活動已關閉，不能加碼獎項")) return "活動已結束，不能調整獎項。";
  if (text.includes("找不到要加碼的獎項")) return "找不到要調整的獎項。";
  if (text.includes("加碼名額必須介於") || text.includes("新增名額必須介於")) return "新增名額必須是有效範圍內的數字。";
  if (text.includes("獎項名額加碼後不能超過 200")) return "獎項名額調整後不能超過 200。";
  if (text.includes("獎項名額調整後不能超過 200")) return text;
  if (text.includes("找不到要調整的獎項")) return "找不到要調整的獎項。";
  if (text.includes("獎項名額必須介於 1 到 200")) return "獎項名額必須介於 1 到 200。";
  if (text.includes("此獎項已有抽獎紀錄，不能刪除")) return "此獎項已有抽獎紀錄，不能刪除。";
  if (text.includes("找不到要刪除的獎項")) return "找不到要刪除的獎項。";
  if (text.includes("Member number already exists") || text.includes("成員編號已存在")) return "成員編號已存在。";
  if (text.includes("Member number is required") || text.includes("請輸入成員編號")) return "請輸入成員編號。";
  if (text.includes("Role name is required") || text.includes("請輸入角色名稱")) return "請輸入角色名稱。";
  if (text.includes("此職業目前未啟用")) return "此職業目前未啟用。";
  if (text.includes("請輸入職業名稱")) return "請輸入職業名稱。";
  return normalized || "操作失敗。";
}

function setBusy(target, busy) {
  const buttons = target.querySelectorAll ? target.querySelectorAll("button") : [];
  buttons.forEach((button) => {
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
  });
}

function requestConfirmDialog(options = {}) {
  if (state.confirmPrompt) {
    return state.confirmPrompt.promise;
  }

  const promise = new Promise((resolve) => {
    state.confirmPrompt = { resolve, promise: null };
  });
  state.confirmPrompt.promise = promise;

  $("#confirm-dialog-title").textContent = options.title || "確認操作";
  $("#confirm-dialog-message").textContent = options.message || "確定要繼續嗎？";
  const acceptButton = $("#confirm-dialog-accept");
  const acceptIcon = acceptButton.querySelector("i");
  $("#confirm-dialog-accept-label").textContent = options.confirmLabel || "確認";
  acceptButton.classList.remove("primary", "accent", "danger", "secondary");
  acceptButton.classList.add(options.confirmKind || "danger");
  acceptIcon?.setAttribute("data-lucide", options.confirmIcon || "check");
  showModalDialog($("#confirm-dialog"));
  refreshIcons();
  window.setTimeout(() => $("#confirm-dialog-cancel").focus(), 0);

  return promise;
}

function closeConfirmDialog(result = false) {
  const prompt = state.confirmPrompt;
  state.confirmPrompt = null;
  closeModalDialog($("#confirm-dialog"));
  if (prompt) {
    prompt.resolve(Boolean(result));
  }
}

function showModalDialog(dialog) {
  if (!dialog) return;
  if (!dialog.open) {
    dialog.showModal();
  }
  syncToastStackLayer();
}

function closeModalDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) {
    dialog.close();
    return;
  }
  syncToastStackLayer();
}

function rememberToastStackHome() {
  const stack = $("#toast-stack");
  if (!stack || toastLayerState.homeParent) return;

  toastLayerState.homeParent = stack.parentNode;
  toastLayerState.homeNextSibling = stack.nextSibling;
}

function syncToastStackLayer() {
  const stack = $("#toast-stack");
  if (!stack) return;

  rememberToastStackHome();
  const dialog = getActiveDialog();
  const target = dialog;

  if (target) {
    if (stack.parentNode !== target) {
      target.appendChild(stack);
    }
    stack.classList.add("is-in-dialog");
    return;
  }

  const homeParent = toastLayerState.homeParent;
  if (!homeParent) return;

  if (stack.parentNode !== homeParent) {
    const nextSibling = toastLayerState.homeNextSibling?.parentNode === homeParent
      ? toastLayerState.homeNextSibling
      : null;
    homeParent.insertBefore(stack, nextSibling);
  }
  stack.classList.remove("is-in-dialog");
}

function getActiveDialog() {
  const openDialogs = $all("dialog[open]");
  return openDialogs[openDialogs.length - 1] || null;
}

function showToast(message, type = "info", options = {}) {
  syncToastStackLayer();
  const stack = $("#toast-stack");
  const toast = buildToast(message, type, options);
  stack.appendChild(toast);
  refreshIcons();

  if (!options.persist) {
    window.setTimeout(() => dismissToast(toast), options.duration || 4600);
  }

  return toast;
}

function confirmToast(message, options = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const toast = showToast(message, options.type || "warning", {
      persist: true,
      actions: [
        {
          label: options.confirmText || "確認",
          kind: options.confirmKind || "primary",
          onClick: () => {
            resolved = true;
            dismissToast(toast);
            resolve(true);
          }
        },
        {
          label: options.cancelText || "取消",
          kind: "secondary",
          onClick: () => {
            resolved = true;
            dismissToast(toast);
            resolve(false);
          }
        }
      ],
      onDismiss: () => {
        if (!resolved) resolve(false);
      }
    });
  });
}

function buildToast(message, type, options) {
  const toast = document.createElement("article");
  toast.className = "toast";
  toast.dataset.type = type;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = document.createElement("i");
  icon.dataset.lucide = toastIcon(type);
  toast.appendChild(icon);

  const content = document.createElement("div");
  content.className = "toast-content";
  content.textContent = message;
  toast.appendChild(content);

  if (options.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "toast-actions";
    options.actions.forEach((action) => {
      const button = document.createElement("button");
      button.className = `toast-action ${action.kind || "secondary"}`;
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      actions.appendChild(button);
    });
    toast.appendChild(actions);
  }

  const dismiss = document.createElement("button");
  dismiss.className = "toast-dismiss";
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "關閉提示");
  dismiss.innerHTML = '<i data-lucide="x"></i>';
  dismiss.addEventListener("click", () => dismissToast(toast));
  toast.appendChild(dismiss);
  toast.afterDismiss = options.onDismiss;

  toast.addEventListener("transitionend", () => {
    if (toast.dataset.dismissed === "true") {
      finishToastDismiss(toast);
    }
  });

  return toast;
}

function dismissToast(toast) {
  if (!toast || toast.dataset.dismissed === "true") return;
  toast.dataset.dismissed = "true";
  toast.classList.add("is-dismissing");
  window.setTimeout(() => finishToastDismiss(toast), 240);
}

function finishToastDismiss(toast) {
  if (!toast || toast.dataset.finished === "true") return;
  toast.dataset.finished = "true";
  toast.remove();
  toast.afterDismiss?.();
}

function toastIcon(type) {
  if (type === "success") return "circle-check";
  if (type === "error") return "circle-alert";
  if (type === "warning") return "triangle-alert";
  return "info";
}

function cleanRequired(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

function parseBoundedInteger(value, options = {}) {
  const label = options.label || "數值";
  const text = String(value ?? "").trim();
  const number = Number(text);
  const min = Number.isFinite(options.min) ? options.min : 1;
  const max = Number.isFinite(options.max) ? options.max : 200;

  if (!text || !Number.isInteger(number)) {
    throw new Error(`${label}必須是整數。`);
  }

  if (number < min || number > max) {
    throw new Error(`${label}必須介於 ${min} 到 ${max}。`);
  }

  return number;
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

function appendEmptyRow(body, colspan, message) {
  const row = document.createElement("tr");
  row.innerHTML = `<td colspan="${colspan}" class="empty-cell">${escapeHtml(message)}</td>`;
  body.appendChild(row);
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
