const STORAGE_KEYS = {
  eventTitle: "rooc_event_title",
  appAdminPin: "rooc_app_admin_pin"
};

const state = {
  client: null,
  event: null,
  appAdminPin: "",
  adminPinPrompt: null,
  occupations: [],
  members: []
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

document.addEventListener("DOMContentLoaded", async () => {
  await loadOptionalLocalConfig();
  bindTabs();
  bindForms();
  hydrateConfig();
  hydrateStoredPins();
  hydrateEventTitle();
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
  refreshIcons();
}

function bindForms() {
  $("#load-event-form").addEventListener("submit", handleLoadEvent);
  $("#create-event-form").addEventListener("submit", handleCreateEvent);
  $("#add-prize-form").addEventListener("submit", handleAddPrize);
  $("#draw-prize").addEventListener("click", handleDrawPrize);
  $("#accept-draw").addEventListener("click", () => resolvePendingDraw("accept"));
  $("#decline-draw").addEventListener("click", () => resolvePendingDraw("decline"));
  $("#transfer-form").addEventListener("submit", handleTransferDraw);
  $("#refresh-event").addEventListener("click", () => reloadEvent());
  $("#close-event").addEventListener("click", () => setEventStatus("closed"));
  $("#reopen-event").addEventListener("click", () => setEventStatus("live"));
  $("#export-awards").addEventListener("click", exportAwardsCsv);
  $("#change-admin-pin").addEventListener("click", openChangeAdminPinDialog);
  $("#admin-pin-form").addEventListener("submit", handleAdminPinSubmit);
  $("#change-admin-pin-form").addEventListener("submit", handleChangeAdminPin);
  $("#cancel-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#dismiss-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#dismiss-change-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#open-occupation-dialog").addEventListener("click", openOccupationDialog);
  $("#close-occupation-dialog").addEventListener("click", closeOccupationDialog);
  $("#occupation-form").addEventListener("submit", handleOccupationSave);
  $("#clear-occupation-edit").addEventListener("click", clearOccupationEdit);
  $("#member-form").addEventListener("submit", handleMemberSave);
  $("#clear-member-edit").addEventListener("click", clearMemberEdit);
  $("#member-edit-form").addEventListener("submit", handleMemberEditSave);
  $("#close-member-edit").addEventListener("click", closeMemberEditDialog);
  $("#cancel-member-edit").addEventListener("click", closeMemberEditDialog);
  $("#member-search-form").addEventListener("submit", handleMemberSearch);
}

function hydrateConfig() {
  const runtime = window.ROOC_SUPABASE_CONFIG || {};
  configureClient(runtime.url, runtime.anonKey);
  if (!state.client) {
    showToast("Supabase 尚未設定。請設定 SUPABASE_URL 與 SUPABASE_ANON_KEY。", "error");
  }
}

function hydrateStoredPins() {
  state.appAdminPin = readSessionValue(STORAGE_KEYS.appAdminPin);

  if (state.appAdminPin) {
    $("#member-status").textContent = "PIN 已暫存";
  }
}

function hydrateEventTitle() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title") || params.get("event") || readLocalValue(STORAGE_KEYS.eventTitle) || "";
  if (title) {
    $("#event-title-query").value = title;
  }
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
  $("#connection-pill").classList.toggle("is-connected", connected);
  $("#connection-text").textContent = connected ? "Supabase 已連線" : "尚未連線";
}

async function loadOptionalLocalConfig() {
  const runtime = window.ROOC_SUPABASE_CONFIG || {};
  if (runtime.url && runtime.anonKey) return;

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
  $("#member-status").textContent = "PIN 已暫存";
}

function forgetAppAdminPin() {
  state.appAdminPin = "";
  writeSessionValue(STORAGE_KEYS.appAdminPin, "");
  $("#member-status").textContent = "未載入";
}

async function handleLoadEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await withBusy(form, async () => {
    await loadEvent(data.get("title"));
  });
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

    $("#event-title-query").value = title;
    form.reset();
    await loadEvent(title);
    switchTab("console");
    showToast(`活動已建立：${title}`, "success");
  });
}

async function loadEvent(title) {
  requireClient();
  const cleanTitle = cleanRequired(title, "請輸入活動名稱。");
  await ensureAppAdminPin();
  const rows = await rpc("get_raffle_event_admin_by_title", {
    p_title: cleanTitle,
    p_app_admin_pin: state.appAdminPin
  });

  if (!rows || rows.length === 0) {
    throw new Error("找不到活動。");
  }

  state.event = normalizeEvent(rows[0]);
  writeLocalValue(STORAGE_KEYS.eventTitle, state.event.title);
  renderEvent();
}

async function reloadEvent() {
  if (!state.event) {
    showToast("請先載入活動。", "error");
    return;
  }
  await withBusy($("#console-detail"), async () => {
    await loadEvent(state.event.title);
    showToast("活動已刷新。", "success");
  });
}

function normalizeEvent(event) {
  return {
    ...event,
    prizes: asArray(event.prizes),
    awards: asArray(event.awards),
    recent_draws: asArray(event.recent_draws),
    pending_draw: event.pending_draw || null
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

  $("#close-event").disabled = event.status === "closed";
  $("#reopen-event").disabled = event.status === "live";
  $("#draw-prize").disabled = event.status !== "live" || Boolean(event.pending_draw);

  renderPrizeOptions();
  renderPendingDraw();
  renderPrizeTable();
  renderAwards();
  renderDrawLog();
  refreshIcons();
}

function renderPrizeOptions() {
  const select = $("#draw-prize-select");
  select.innerHTML = "";

  const openPrizes = state.event.prizes.filter((prize) => Number(prize.remaining_count || 0) > 0);
  if (openPrizes.length === 0) {
    select.append(new Option("沒有可抽獎項", ""));
    select.disabled = true;
    return;
  }

  openPrizes.forEach((prize) => {
    const label = `${prize.name} / ${prize.provider} / 剩 ${prize.remaining_count}`;
    select.append(new Option(label, prize.id));
  });
  select.disabled = false;
}

function renderPendingDraw() {
  const pending = state.event.pending_draw;
  const card = $("#pending-card");
  card.hidden = !pending;

  if (!pending) return;

  $("#pending-member").textContent = `${pending.role_name}（${pending.member_no}）`;
  $("#pending-detail").textContent = [
    `${pending.prize_name} #${pending.slot_number}`,
    `提供者：${pending.provider}`,
    `職業：${pending.occupation || "未填"}`,
    `DC：${pending.joined_dc ? "已加入" : "未加入"}`
  ].join(" / ");
}

function renderPrizeTable() {
  const body = $("#prize-table");
  body.innerHTML = "";

  if (state.event.prizes.length === 0) {
    appendEmptyRow(body, 5, "尚未新增獎項。");
    return;
  }

  state.event.prizes.forEach((prize) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(prize.name)}</td>
      <td>${escapeHtml(prize.provider)}</td>
      <td>${escapeHtml(prize.quantity)}</td>
      <td>${escapeHtml(prize.filled_count)}</td>
      <td>${escapeHtml(prize.remaining_count)}</td>
    `;
    body.appendChild(row);
  });
}

function renderAwards() {
  const body = $("#award-table");
  body.innerHTML = "";

  if (state.event.awards.length === 0) {
    appendEmptyRow(body, 5, "尚未有中獎紀錄。");
    return;
  }

  state.event.awards.forEach((award) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(award.prize_name)} #${escapeHtml(award.slot_number)}</td>
      <td>${memberText(award.drawn_member_no, award.drawn_role_name)}</td>
      <td>${memberText(award.final_member_no, award.final_role_name)}</td>
      <td>${escapeHtml(drawStatusText[award.status] || award.status)}</td>
      <td>${escapeHtml(formatDate(award.resolved_at))}</td>
    `;
    body.appendChild(row);
  });
}

function renderDrawLog() {
  const body = $("#draw-log-table");
  body.innerHTML = "";

  if (state.event.recent_draws.length === 0) {
    appendEmptyRow(body, 4, "尚未有抽獎紀錄。");
    return;
  }

  state.event.recent_draws.forEach((draw) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(draw.prize_name)} #${escapeHtml(draw.slot_number)}</td>
      <td>${memberText(draw.drawn_member_no, draw.drawn_role_name)}</td>
      <td>${escapeHtml(drawStatusText[draw.status] || draw.status)}</td>
      <td><code>${escapeHtml(shortToken(draw.random_token))}</code></td>
    `;
    body.appendChild(row);
  });
}

async function handleAddPrize(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  await withBusy(form, async () => {
    ensureEventLoaded();
    await ensureAppAdminPin();
    await rpc("add_raffle_prize", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_name: data.get("name"),
      p_provider: data.get("provider"),
      p_quantity: Number(data.get("quantity") || 1)
    });
    form.reset();
    await loadEvent(state.event.title);
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

    await rpc("draw_raffle_prize", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_prize_id: prizeId
    });
    await loadEvent(state.event.title);
    showToast("已抽出，請處理結果。", "success");
  });
}

async function resolvePendingDraw(action, transferMemberNo = null, note = null) {
  await withBusy($("#pending-card"), async () => {
    ensureEventLoaded();
    await ensureAppAdminPin();
    const pending = state.event.pending_draw;
    if (!pending) {
      throw new Error("目前沒有待處理抽獎。");
    }

    await rpc("resolve_raffle_draw", {
      p_slug: state.event.slug,
      p_admin_pin: state.appAdminPin,
      p_draw_id: pending.id,
      p_action: action,
      p_transfer_member_no: transferMemberNo,
      p_note: note
    });
    $("#transfer-form").reset();
    await loadEvent(state.event.title);
    showToast(drawStatusText[actionMap(action)] || "抽獎結果已處理。", "success");
  });
}

async function handleTransferDraw(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    const memberNo = cleanRequired(data.get("member_no"), "請輸入指定轉讓會員編號。");
    await resolvePendingDraw("transfer", memberNo, data.get("note"));
  } catch (error) {
    showToast(error.message, "error");
  }
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
    showToast(error.message, "error");
    return;
  }

  if (status === "closed") {
    const confirmed = await confirmToast("確定要結束這場活動？", {
      confirmText: "結束活動",
      cancelText: "取消"
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
    await loadEvent(state.event.title);
    showToast(`${label}完成。`, "success");
  });
}

async function handleAdminPinSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const pin = cleanRequired(data.get("app_admin_pin"), "請輸入成員管理 PIN。");

  await withBusy(form, async () => {
    await rpc("initialize_app_admin", { p_admin_pin: pin });
    rememberAppAdminPin(pin);
    await loadOccupations();
    await loadMembers();
    closeAdminPinDialog(pin);
    showToast("成員管理 PIN 已驗證。", "success");
  });
}

async function handleChangeAdminPin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const currentPin = cleanRequired(data.get("current_pin"), "請輸入目前 PIN。");
  const newPin = cleanRequired(data.get("new_pin"), "請輸入新 PIN。");
  const confirmPin = cleanRequired(data.get("confirm_pin"), "請再次輸入新 PIN。");

  if (newPin.length < 4) {
    showToast("新 PIN 至少需要 4 個字元。", "error");
    return;
  }

  if (newPin !== confirmPin) {
    showToast("兩次新 PIN 不一致。", "error");
    return;
  }

  await withBusy(form, async () => {
    await rpc("change_app_admin_pin", {
      p_current_pin: currentPin,
      p_new_pin: newPin
    });
    rememberAppAdminPin(newPin);
    await loadOccupations();
    await loadMembers();
    closeAdminPinDialog();
    showToast("成員管理 PIN 已修改。", "success");
  });
}

async function ensureAppAdminPin() {
  if (state.appAdminPin) {
    return state.appAdminPin;
  }

  const pin = await requestAppAdminPin();
  if (!pin) {
    throw new Error("需要成員管理 PIN。");
  }
  return pin;
}

function requestAppAdminPin() {
  if (state.adminPinPrompt) {
    return state.adminPinPrompt.promise;
  }

  const promise = new Promise((resolve) => {
    state.adminPinPrompt = { resolve, promise: null };
  });
  state.adminPinPrompt.promise = promise;
  openAdminPinDialog("verify");
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

  $("#admin-pin-title").textContent = isChange ? "修改成員管理 PIN" : "成員管理 PIN";
  verifyForm.hidden = isChange;
  changeForm.hidden = !isChange;
  verifyForm.reset();
  changeForm.reset();

  if (!dialog.open) {
    dialog.showModal();
  }
  refreshIcons();

  window.setTimeout(() => {
    const input = isChange ? changeForm.elements.current_pin : verifyForm.elements.app_admin_pin;
    input?.focus();
  }, 0);
}

function cancelAdminPinPrompt() {
  closeAdminPinDialog(null);
}

function closeAdminPinDialog(resolveValue = null) {
  const prompt = state.adminPinPrompt;
  state.adminPinPrompt = null;
  $("#admin-pin-form").reset();
  $("#change-admin-pin-form").reset();
  if ($("#admin-pin-dialog").open) {
    $("#admin-pin-dialog").close();
  }
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
    $("#occupation-dialog").showModal();
    refreshIcons();
  });
}

function closeOccupationDialog() {
  clearOccupationEdit();
  $("#occupation-dialog").close();
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
    clearMemberEdit();
    await loadMembers();
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
    showToast("成員修改已儲存。", "success");
  });
}

async function saveMemberForm(form) {
  const data = new FormData(form);
  await ensureAppAdminPin();
  const roleName = cleanRequired(data.get("role_name"), "請輸入角色名稱。");
  await rpc("upsert_rooc_member", {
    p_app_admin_pin: state.appAdminPin,
    p_member_no: data.get("member_no"),
    p_original_member_no: data.get("original_member_no"),
    p_role_name: roleName,
    p_occupation: data.get("occupation"),
    p_joined_dc: data.get("joined_dc") === "on",
    p_is_active: data.get("is_active") === "on"
  });
}

async function handleMemberSearch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await withBusy(form, async () => {
    await ensureAppAdminPin();
    await loadMembers();
  });
}

async function loadMembers() {
  const searchForm = $("#member-search-form");
  const data = new FormData(searchForm);
  const rows = await rpc("get_rooc_members", {
    p_app_admin_pin: state.appAdminPin,
    p_query: data.get("query"),
    p_include_inactive: data.get("include_inactive") === "on"
  });
  state.members = rows || [];
  renderMembers();
}

function renderMembers() {
  const body = $("#member-table");
  body.innerHTML = "";
  $("#member-status").textContent = `${state.members.length} 筆`;

  if (state.members.length === 0) {
    appendEmptyRow(body, 6, "沒有符合條件的成員。");
    return;
  }

  state.members.forEach((member) => {
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
  if (!dialog.open) {
    dialog.showModal();
  }
  refreshIcons();
  window.setTimeout(() => form.elements.role_name.focus(), 0);
}

function closeMemberEditDialog() {
  const dialog = $("#member-edit-dialog");
  $("#member-edit-form").reset();
  if (dialog.open) {
    dialog.close();
  }
}

function clearMemberEdit() {
  const form = $("#member-form");
  form.reset();
  form.elements.occupation.value = "";
  form.elements.is_active.checked = true;
  form.elements.member_no.focus();
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
    showToast(isActive ? "成員已恢復公會中。" : "成員已標記退會。", "success");
  });
}

function exportAwardsCsv() {
  try {
    ensureEventLoaded();
  } catch (error) {
    showToast(error.message, "error");
    return;
  }

  const rows = state.event.awards;
  if (rows.length === 0) {
    showToast("目前沒有中獎名單可匯出。", "error");
    return;
  }

  const headers = ["獎項", "提供者", "名額序", "原抽中編號", "原抽中名稱", "領獎編號", "領獎名稱", "狀態", "備註", "時間"];
  const csvRows = rows.map((award) => [
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

  downloadCsv(`${state.event.slug}-awards.csv`, [headers, ...csvRows]);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
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
  if (message.includes("App admin PIN is invalid") || message.includes("App admin PIN is not initialized")) {
    forgetAppAdminPin();
  }
}

function friendlyError(message) {
  const text = String(message || "");
  if (text.includes("App admin PIN is invalid")) return "成員管理 PIN 不正確。";
  if (text.includes("App admin PIN is not initialized")) return "尚未設定成員管理 PIN。";
  if (text.includes("App admin PIN must be at least 4 characters")) return "成員管理 PIN 至少需要 4 個字元。";
  if (text.includes("Raffle event not found")) return "找不到活動。";
  if (text.includes("Raffle event title already exists")) return "活動名稱已存在。";
  if (text.includes("Member number already exists")) return "成員編號已存在。";
  if (text.includes("Member number is required")) return "請輸入成員編號。";
  if (text.includes("Role name is required")) return "請輸入角色名稱。";
  return text || "操作失敗。";
}

function setBusy(target, busy) {
  const buttons = target.querySelectorAll ? target.querySelectorAll("button") : [];
  buttons.forEach((button) => {
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
  });
}

function showToast(message, type = "info", options = {}) {
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
    const toast = showToast(message, "warning", {
      persist: true,
      actions: [
        {
          label: options.confirmText || "確認",
          kind: "primary",
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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function memberText(memberNo, displayName) {
  const label = displayName || memberNo || "";
  const suffix = memberNo && displayName && memberNo !== displayName ? `（${memberNo}）` : "";
  return escapeHtml(`${label}${suffix}`);
}

function appendEmptyRow(body, colspan, message) {
  const row = document.createElement("tr");
  row.innerHTML = `<td colspan="${colspan}" class="empty-cell">${escapeHtml(message)}</td>`;
  body.appendChild(row);
}

function shortToken(token) {
  if (!token) return "";
  return `${String(token).slice(0, 8)}...`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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
