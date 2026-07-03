const STORAGE_KEYS = {
  url: "rooc_supabase_url",
  anonKey: "rooc_supabase_anon_key"
};

const state = {
  client: null,
  publicRaffle: null,
  adminRaffle: null,
  adminPin: ""
};

const statusText = {
  open: "開放中",
  closed: "已關閉",
  drawn: "已開獎"
};

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindForms();
  hydrateConfig();
  hydrateSlugFromUrl();
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
  $("#settings-form").addEventListener("submit", handleSettings);
  $("#clear-settings").addEventListener("click", clearSettings);
  $("#lookup-form").addEventListener("submit", handleLookup);
  $("#join-form").addEventListener("submit", handleJoin);
  $("#create-form").addEventListener("submit", handleCreate);
  $("#manage-form").addEventListener("submit", handleManageLoad);
  $("#open-raffle").addEventListener("click", () => setRaffleStatus("open"));
  $("#close-raffle").addEventListener("click", () => setRaffleStatus("closed"));
  $("#draw-raffle").addEventListener("click", handleDraw);
  $("#copy-link").addEventListener("click", copyShareLink);
}

function hydrateConfig() {
  const runtime = window.ROOC_SUPABASE_CONFIG || {};
  const url = localStorage.getItem(STORAGE_KEYS.url) || runtime.url || "";
  const anonKey = localStorage.getItem(STORAGE_KEYS.anonKey) || runtime.anonKey || "";

  $("#supabase-url").value = url;
  $("#supabase-anon-key").value = anonKey;
  configureClient(url, anonKey, false);
}

function hydrateSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("r") || params.get("raffle") || "";
  if (!slug) return;

  $("#lookup-slug").value = slug;
  switchTab("join");
  if (state.client) {
    loadPublicRaffle(slug).catch((error) => showToast(error.message, "error"));
  }
}

function configureClient(url, anonKey, persist) {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();

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
  if (persist) {
    localStorage.setItem(STORAGE_KEYS.url, cleanUrl);
    localStorage.setItem(STORAGE_KEYS.anonKey, cleanKey);
  }
  renderConnection(true);
}

function renderConnection(connected) {
  $("#connection-pill").classList.toggle("is-connected", connected);
  $("#connection-text").textContent = connected ? "Supabase 已連線" : "尚未連線";
  $("#settings-status").textContent = connected ? "已設定" : "未設定";
}

async function handleSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  configureClient(data.get("supabase_url"), data.get("supabase_anon_key"), true);
  showToast("Supabase 設定已儲存。", "success");
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEYS.url);
  localStorage.removeItem(STORAGE_KEYS.anonKey);
  $("#supabase-url").value = "";
  $("#supabase-anon-key").value = "";
  state.client = null;
  renderConnection(false);
  showToast("本機設定已清除。", "success");
}

async function handleLookup(event) {
  event.preventDefault();
  const slug = new FormData(event.currentTarget).get("slug");
  await withBusy(event.currentTarget, async () => {
    await loadPublicRaffle(slug);
  });
}

async function loadPublicRaffle(slug) {
  requireClient();
  const cleanSlug = cleanRequired(slug, "請輸入抽獎代碼。");
  const rows = await rpc("get_raffle_public", { p_slug: cleanSlug });
  if (!rows || rows.length === 0) {
    throw new Error("找不到這個抽獎。");
  }
  state.publicRaffle = rows[0];
  renderPublicRaffle();
}

function renderPublicRaffle() {
  const raffle = state.publicRaffle;
  $("#public-empty").hidden = true;
  $("#public-detail").hidden = false;
  $("#public-status").textContent = statusText[raffle.status] || raffle.status;
  $("#public-detail-status").textContent = statusText[raffle.status] || raffle.status;
  $("#public-title").textContent = raffle.title;
  $("#public-description").textContent = raffle.description || "尚未提供活動說明。";
  $("#public-count").textContent = raffle.participant_count ?? 0;
  $("#public-winners-count").textContent = raffle.winners_count ?? 1;
  $("#public-drawn-at").textContent = raffle.drawn_at ? formatDate(raffle.drawn_at) : "尚未開獎";
  $("#join-form").hidden = raffle.status !== "open";
  renderWinners("#public-winners", raffle.winners || []);
  refreshIcons();
}

async function handleJoin(event) {
  event.preventDefault();
  const raffle = state.publicRaffle;
  if (!raffle) {
    showToast("請先查詢抽獎。", "error");
    return;
  }

  await withBusy(event.currentTarget, async () => {
    const data = new FormData(event.currentTarget);
    await rpc("join_raffle", {
      p_slug: raffle.slug,
      p_display_name: data.get("display_name"),
      p_email: data.get("email"),
      p_note: data.get("note")
    });
    event.currentTarget.reset();
    await loadPublicRaffle(raffle.slug);
    showToast("報名完成。", "success");
  });
}

async function handleCreate(event) {
  event.preventDefault();

  await withBusy(event.currentTarget, async () => {
    const data = new FormData(event.currentTarget);
    const rows = await rpc("create_raffle", {
      p_title: data.get("title"),
      p_slug: data.get("slug"),
      p_description: data.get("description"),
      p_winners_count: Number(data.get("winners_count") || 1),
      p_admin_pin: data.get("admin_pin"),
      p_starts_at: toIsoOrNull(data.get("starts_at")),
      p_ends_at: toIsoOrNull(data.get("ends_at"))
    });

    const created = rows?.[0];
    if (!created) throw new Error("建立失敗。");

    $("#manage-slug").value = created.slug;
    $("#manage-pin").value = data.get("admin_pin");
    state.adminPin = data.get("admin_pin");
    event.currentTarget.reset();
    await loadAdminRaffle(created.slug, state.adminPin);
    switchTab("admin");
    showToast(`已建立抽獎：${created.slug}`, "success");
  });
}

async function handleManageLoad(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  await withBusy(event.currentTarget, async () => {
    await loadAdminRaffle(data.get("slug"), data.get("admin_pin"));
  });
}

async function loadAdminRaffle(slug, pin) {
  requireClient();
  const cleanSlug = cleanRequired(slug, "請輸入抽獎代碼。");
  const cleanPin = cleanRequired(pin, "請輸入管理 PIN。");
  const rows = await rpc("get_raffle_admin", {
    p_slug: cleanSlug,
    p_admin_pin: cleanPin
  });

  if (!rows || rows.length === 0) {
    throw new Error("管理 PIN 不正確或找不到抽獎。");
  }

  state.adminRaffle = rows[0];
  state.adminPin = cleanPin;
  renderAdminRaffle();
}

function renderAdminRaffle() {
  const raffle = state.adminRaffle;
  $("#admin-detail").hidden = false;
  $("#admin-status").textContent = statusText[raffle.status] || raffle.status;
  $("#admin-title").textContent = raffle.title;
  $("#admin-detail-status").textContent = statusText[raffle.status] || raffle.status;
  $("#admin-count").textContent = raffle.participant_count ?? 0;
  $("#admin-winners-count").textContent = raffle.winners_count ?? 1;
  $("#admin-drawn-at").textContent = raffle.drawn_at ? formatDate(raffle.drawn_at) : "未開獎";
  $("#share-link").value = buildShareLink(raffle.slug);

  const drawn = raffle.status === "drawn";
  $("#open-raffle").disabled = drawn || raffle.status === "open";
  $("#close-raffle").disabled = drawn || raffle.status === "closed";
  $("#draw-raffle").disabled = drawn || Number(raffle.participant_count || 0) === 0;

  renderWinners("#admin-winners", raffle.winners || []);
  renderParticipants(raffle.participants || []);
  refreshIcons();
}

function renderParticipants(participants) {
  const body = $("#participant-table");
  body.innerHTML = "";

  if (participants.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4" class="empty-cell">目前沒有報名資料。</td>`;
    body.appendChild(row);
    return;
  }

  participants.forEach((participant) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(participant.display_name)}</td>
      <td>${escapeHtml(participant.email || "未提供")}</td>
      <td>${escapeHtml(participant.note || "")}</td>
      <td>${escapeHtml(formatDate(participant.created_at))}</td>
    `;
    body.appendChild(row);
  });
}

function renderWinners(selector, winners) {
  const container = $(selector);
  container.innerHTML = "";
  container.hidden = winners.length === 0;

  winners.forEach((winner) => {
    const item = document.createElement("div");
    item.className = "winner-chip";
    item.innerHTML = `
      <span class="winner-rank">#${escapeHtml(winner.position)}</span>
      <strong>${escapeHtml(winner.display_name)}</strong>
    `;
    container.appendChild(item);
  });
}

async function setRaffleStatus(status) {
  if (!state.adminRaffle) return;
  await withBusy($("#admin-detail"), async () => {
    await rpc("set_raffle_status", {
      p_slug: state.adminRaffle.slug,
      p_admin_pin: state.adminPin,
      p_status: status
    });
    await loadAdminRaffle(state.adminRaffle.slug, state.adminPin);
    showToast(status === "open" ? "抽獎已開放。" : "抽獎已關閉。", "success");
  });
  if (state.adminRaffle) renderAdminRaffle();
}

async function handleDraw() {
  if (!state.adminRaffle) return;
  const ok = window.confirm("確定開獎？開獎後名單會固定。");
  if (!ok) return;

  await withBusy($("#admin-detail"), async () => {
    await rpc("draw_raffle", {
      p_slug: state.adminRaffle.slug,
      p_admin_pin: state.adminPin,
      p_winners_count: state.adminRaffle.winners_count
    });
    await loadAdminRaffle(state.adminRaffle.slug, state.adminPin);
    showToast("開獎完成。", "success");
  });
  if (state.adminRaffle) renderAdminRaffle();
}

async function copyShareLink() {
  const link = $("#share-link").value;
  if (!link) return;

  try {
    await navigator.clipboard.writeText(link);
    showToast("連結已複製。", "success");
  } catch {
    $("#share-link").select();
    showToast("請使用瀏覽器複製選取的連結。", "info");
  }
}

async function rpc(name, args) {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function requireClient() {
  if (!state.client) {
    switchTab("settings");
    throw new Error("請先設定 Supabase。");
  }
  return state.client;
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
  }, 4200);
}

function buildShareLink(slug) {
  const url = new URL(window.location.href);
  url.searchParams.set("r", slug);
  url.hash = "";
  return url.toString();
}

function cleanRequired(value, message) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(message);
  return clean;
}

function toIsoOrNull(value) {
  if (!value) return null;
  return new Date(value).toISOString();
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
