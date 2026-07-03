const STORAGE_KEYS = {
  eventSlug: "rooc_event_slug"
};

const state = {
  client: null,
  event: null,
  eventPin: "",
  appAdminPin: "",
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
  hydrateEventSlug();
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
  $("#app-admin-form").addEventListener("submit", handleAppAdmin);
  $("#member-form").addEventListener("submit", handleMemberSave);
  $("#member-search-form").addEventListener("submit", handleMemberSearch);
}

function hydrateConfig() {
  const runtime = window.ROOC_SUPABASE_CONFIG || {};
  configureClient(runtime.url, runtime.anonKey);
  if (!state.client) {
    showToast("Supabase 尚未設定。請設定 SUPABASE_URL 與 SUPABASE_ANON_KEY。", "error");
  }
}

function hydrateEventSlug() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("event") || params.get("r") || localStorage.getItem(STORAGE_KEYS.eventSlug) || "";
  if (slug) {
    $("#event-slug").value = slug;
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

async function handleLoadEvent(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  await withBusy(event.currentTarget, async () => {
    await loadEvent(data.get("slug"), data.get("admin_pin"));
  });
}

async function handleCreateEvent(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);

  await withBusy(event.currentTarget, async () => {
    const rows = await rpc("create_raffle_event", {
      p_title: data.get("title"),
      p_slug: data.get("slug"),
      p_description: data.get("description"),
      p_admin_pin: data.get("admin_pin")
    });
    const created = rows?.[0];
    if (!created) throw new Error("活動建立失敗。");

    $("#event-slug").value = created.slug;
    $("#event-pin").value = data.get("admin_pin");
    event.currentTarget.reset();
    await loadEvent(created.slug, data.get("admin_pin"));
    switchTab("console");
    showToast(`活動已建立：${created.slug}`, "success");
  });
}

async function loadEvent(slug, pin) {
  requireClient();
  const cleanSlug = cleanRequired(slug, "請輸入活動代碼。");
  const cleanPin = cleanRequired(pin, "請輸入活動 PIN。");
  const rows = await rpc("get_raffle_event_admin", {
    p_slug: cleanSlug,
    p_admin_pin: cleanPin
  });

  if (!rows || rows.length === 0) {
    throw new Error("找不到活動或 PIN 不正確。");
  }

  state.event = normalizeEvent(rows[0]);
  state.eventPin = cleanPin;
  localStorage.setItem(STORAGE_KEYS.eventSlug, cleanSlug);
  renderEvent();
}

async function reloadEvent() {
  if (!state.event) {
    showToast("請先載入活動。", "error");
    return;
  }
  await withBusy($("#console-detail"), async () => {
    await loadEvent(state.event.slug, state.eventPin);
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

  $("#pending-member").textContent = `${pending.display_name}（${pending.member_no}）`;
  $("#pending-detail").textContent = [
    `${pending.prize_name} #${pending.slot_number}`,
    `提供者：${pending.provider}`,
    `職業：${pending.occupation || "未填"}`,
    `角色 ID：${pending.role_id || "未填"}`,
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
      <td>${memberText(award.drawn_member_no, award.drawn_display_name)}</td>
      <td>${memberText(award.final_member_no, award.final_display_name)}</td>
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
      <td>${memberText(draw.drawn_member_no, draw.drawn_display_name)}</td>
      <td>${escapeHtml(drawStatusText[draw.status] || draw.status)}</td>
      <td><code>${escapeHtml(shortToken(draw.random_token))}</code></td>
    `;
    body.appendChild(row);
  });
}

async function handleAddPrize(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);

  await withBusy(event.currentTarget, async () => {
    ensureEventLoaded();
    await rpc("add_raffle_prize", {
      p_slug: state.event.slug,
      p_admin_pin: state.eventPin,
      p_name: data.get("name"),
      p_provider: data.get("provider"),
      p_quantity: Number(data.get("quantity") || 1)
    });
    event.currentTarget.reset();
    await loadEvent(state.event.slug, state.eventPin);
    showToast("獎項已新增。", "success");
  });
}

async function handleDrawPrize() {
  await withBusy($("#console-detail"), async () => {
    ensureEventLoaded();
    const prizeId = $("#draw-prize-select").value;
    if (!prizeId) {
      throw new Error("沒有可抽的獎項。");
    }

    await rpc("draw_raffle_prize", {
      p_slug: state.event.slug,
      p_admin_pin: state.eventPin,
      p_prize_id: prizeId
    });
    await loadEvent(state.event.slug, state.eventPin);
    showToast("已抽出，請處理結果。", "success");
  });
}

async function resolvePendingDraw(action, transferMemberNo = null, note = null) {
  await withBusy($("#pending-card"), async () => {
    ensureEventLoaded();
    const pending = state.event.pending_draw;
    if (!pending) {
      throw new Error("目前沒有待處理抽獎。");
    }

    await rpc("resolve_raffle_draw", {
      p_slug: state.event.slug,
      p_admin_pin: state.eventPin,
      p_draw_id: pending.id,
      p_action: action,
      p_transfer_member_no: transferMemberNo,
      p_note: note
    });
    $("#transfer-form").reset();
    await loadEvent(state.event.slug, state.eventPin);
    showToast(drawStatusText[actionMap(action)] || "抽獎結果已處理。", "success");
  });
}

async function handleTransferDraw(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
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
    if (status === "closed" && !window.confirm("確定要結束這場活動？")) return;
  } catch (error) {
    showToast(error.message, "error");
    return;
  }

  await withBusy($("#console-detail"), async () => {
    await rpc("set_raffle_event_status", {
      p_slug: state.event.slug,
      p_admin_pin: state.eventPin,
      p_status: status
    });
    await loadEvent(state.event.slug, state.eventPin);
    showToast(`${label}完成。`, "success");
  });
}

async function handleAppAdmin(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const pin = cleanRequired(data.get("app_admin_pin"), "請輸入成員管理 PIN。");

  await withBusy(event.currentTarget, async () => {
    await rpc("initialize_app_admin", { p_admin_pin: pin });
    state.appAdminPin = pin;
    $("#member-status").textContent = "已驗證";
    await loadMembers();
    showToast("成員管理 PIN 已套用。", "success");
  });
}

async function handleMemberSave(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);

  await withBusy(event.currentTarget, async () => {
    requireAppAdmin();
    await rpc("upsert_rooc_member", {
      p_app_admin_pin: state.appAdminPin,
      p_member_no: data.get("member_no"),
      p_display_name: data.get("display_name"),
      p_occupation: data.get("occupation"),
      p_role_id: data.get("role_id"),
      p_joined_dc: data.get("joined_dc") === "on",
      p_is_active: data.get("is_active") === "on"
    });
    event.currentTarget.reset();
    event.currentTarget.elements.is_active.checked = true;
    await loadMembers();
    showToast("成員已儲存。", "success");
  });
}

async function handleMemberSearch(event) {
  event.preventDefault();
  await withBusy(event.currentTarget, async () => {
    requireAppAdmin();
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
    appendEmptyRow(body, 7, "沒有符合條件的成員。");
    return;
  }

  state.members.forEach((member) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(member.member_no)}</td>
      <td>${escapeHtml(member.display_name || member.member_no)}</td>
      <td>${escapeHtml(member.occupation || "")}</td>
      <td>${escapeHtml(member.role_id || "")}</td>
      <td>${member.joined_dc ? "是" : "否"}</td>
      <td>${member.is_active ? "啟用" : "停用"}</td>
      <td>
        <button class="btn table-action" type="button" data-toggle-member="${escapeHtml(member.member_no)}" data-active="${member.is_active ? "0" : "1"}">
          ${member.is_active ? "停用" : "啟用"}
        </button>
      </td>
    `;
    body.appendChild(row);
  });

  $all("[data-toggle-member]").forEach((button) => {
    button.addEventListener("click", () => toggleMember(button.dataset.toggleMember, button.dataset.active === "1"));
  });
}

async function toggleMember(memberNo, isActive) {
  await withBusy($("#member-table"), async () => {
    requireAppAdmin();
    await rpc("set_rooc_member_active", {
      p_app_admin_pin: state.appAdminPin,
      p_member_no: memberNo,
      p_is_active: isActive
    });
    await loadMembers();
    showToast(isActive ? "成員已啟用。" : "成員已停用。", "success");
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
    award.drawn_display_name,
    award.final_member_no,
    award.final_display_name,
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

function requireAppAdmin() {
  if (!state.appAdminPin) {
    switchTab("members");
    throw new Error("請先套用成員管理 PIN。");
  }
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
    showToast(error.message || "操作失敗。", "error");
  } finally {
    setBusy(target, false);
  }
}

function setBusy(target, busy) {
  const buttons = target.querySelectorAll ? target.querySelectorAll("button") : [];
  buttons.forEach((button) => {
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
  });
}

function showToast(message, type = "info") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  toast.dataset.type = type;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4600);
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
