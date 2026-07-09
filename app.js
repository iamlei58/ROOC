const STORAGE_KEYS = {
  eventTitle: "rooc_event_title",
  eventSlug: "rooc_event_slug",
  appAdminPin: "rooc_app_admin_pin",
  activeTab: "rooc_admin_active_tab"
};

const ADMIN_TAB_KEYS = ["console", "history", "guides", "members"];

const PENDING_DRAW_PAGE_SIZE = 20;
const DRAW_LOG_RENDER_LIMIT = 80;
const AWARD_RENDER_LIMIT = 120;
const DRAW_EFFECT_CLEANUP_MS = 2600;
const GUIDE_IMAGE_BUCKET = "rooc-guide-images";
const GUIDE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const GUIDE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
  guidePosts: [],
  guideCurrentId: "",
  guidesLoaded: false,
  publicAuditEvents: new Map(),
  auditDialogSeq: 0,
  providerMembers: [],
  transferCandidates: [],
  transferCandidatesLoading: false,
  pendingVisibleCount: PENDING_DRAW_PAGE_SIZE,
  memberImportRawRows: [],
  memberImportRows: [],
  memberImportExisting: new Map(),
  eventSlugHint: "",
  eventMutationKey: "",
  drawAnimationMode: "fireworks",
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
let guideSearchTimer = null;
let guideLoadSeq = 0;
let guideScrollSyncLock = false;
const guideImageViewState = {
  zoom: 100,
  x: 0,
  y: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
};
const drawAnimationState = {
  intervalId: null,
  labels: [],
  index: 0,
  fireworks: null,
  effectCleanupId: null
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

function setText(selector, text) {
  window.ROOC_VUE_TEXT_CONTENT?.render?.({
    targetSelector: selector,
    text: text ?? ""
  });
}

function bindTabs() {
  const activeTab = resolveAdminInitialTab();
  if (renderAdminTabs(activeTab)) {
    switchTab(activeTab, { persist: false, prepare: false });
    return;
  }

  $all("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  switchTab(activeTab, { persist: false, prepare: false });
}

function switchTab(tabName, options = {}) {
  const activeTab = ADMIN_TAB_KEYS.includes(tabName) ? tabName : "console";
  if (options.persist !== false) {
    writeLocalValue(STORAGE_KEYS.activeTab, activeTab);
    updateTabHash(activeTab);
  }
  window.ROOC_VUE_ADMIN_TABS?.setActive?.(activeTab);
  $all("[data-tab]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === activeTab);
  });
  $all("[data-panel]").forEach((panel) => {
    const active = panel.dataset.panel === activeTab;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  if (options.prepare !== false) {
    void prepareActiveAdminPanel(activeTab);
  }
  refreshIcons();
}

async function prepareActiveAdminPanel(tabName = getActiveAdminTab()) {
  if (tabName === "members") {
    await prepareMemberPanel();
  }
  if (tabName === "guides") {
    await prepareGuidePanel();
  }
  if (tabName === "history") {
    await prepareHistoryPanel();
  }
}

function getActiveAdminTab() {
  return $("[data-panel].is-active")?.dataset.panel || "console";
}

function resolveAdminInitialTab() {
  const hashTab = normalizeTabName(window.location.hash.slice(1), ADMIN_TAB_KEYS);
  if (hashTab) return hashTab;
  return normalizeTabName(readLocalValue(STORAGE_KEYS.activeTab), ADMIN_TAB_KEYS) || "console";
}

function normalizeTabName(value, allowedTabs) {
  const tabName = String(value || "").replace(/^#/, "").trim();
  return allowedTabs.includes(tabName) ? tabName : "";
}

function updateTabHash(tabName) {
  if (window.location.hash.slice(1) === tabName) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${tabName}`);
}

function renderAdminTabs(activeTab = "console") {
  return Boolean(window.ROOC_VUE_ADMIN_TABS?.render?.({
    targetSelector: "#admin-tabs",
    activeTab,
    tabs: [
      { key: "console", label: "抽獎控制台", icon: "sparkles" },
      { key: "history", label: "歷史紀錄", icon: "history" },
      { key: "guides", label: "攻略", icon: "book-open" },
      { key: "members", label: "公會成員", icon: "users" }
    ],
    onSelect: switchTab,
    onRendered: refreshIcons
  }));
}

function bindForms() {
  $("#load-event-form").addEventListener("submit", handleLoadEvent);
  bindAutoLoadSelect("#event-title-select", loadSelectedEventFromSelect);
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
  $("#toggle-event-status").addEventListener("click", handleToggleEventStatus);
  $all(".stats-grid").forEach((grid) => {
    grid.addEventListener("click", handleRosterButtonClick);
  });
  $("#delete-event").addEventListener("click", () => deleteLoadedEvent("console"));
  $("#export-awards").addEventListener("click", exportAwardsExcel);
  $("#export-draw-log").addEventListener("click", exportDrawLogExcel);
  $("#draw-log-table").addEventListener("click", handleAdminDrawVerifyClick);
  $("#history-event-form").addEventListener("submit", handleLoadHistoryEvent);
  bindAutoLoadSelect("#history-event-select", loadSelectedHistoryEventFromSelect);
  $("#refresh-history-events").addEventListener("click", handleRefreshHistoryEvents);
  $("#export-history-awards").addEventListener("click", exportHistoryAwardsExcel);
  $("#export-history-draw-log").addEventListener("click", exportHistoryDrawLogExcel);
  $("#history-draw-log-table").addEventListener("click", handleAdminDrawVerifyClick);
  $("#reopen-history-event").addEventListener("click", reopenHistoryEvent);
  $("#delete-history-event").addEventListener("click", () => deleteLoadedEvent("history"));
  $("#change-admin-pin").addEventListener("click", openChangeAdminPinDialog);
  $("#logout-admin").addEventListener("click", handleAdminLogout);
  $("#admin-pin-form").addEventListener("submit", handleAdminPinSubmit);
  $("#change-admin-pin-form").addEventListener("submit", handleChangeAdminPin);
  $("#cancel-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#dismiss-admin-pin").addEventListener("click", cancelAdminPinPrompt);
  $("#return-public-from-login").addEventListener("click", returnToPublicPage);
  $("#dismiss-change-admin-pin").addEventListener("click", cancelAdminPinPrompt);
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
  $("#guide-search-form").addEventListener("submit", handleGuideSearch);
  $("#guide-search-form").elements.query.addEventListener("input", scheduleGuideSearch);
  $("#guide-search-form").elements.status.addEventListener("change", () => scheduleGuideSearch(0));
  $("#refresh-guides").addEventListener("click", handleRefreshGuides);
  $("#create-guide-post").addEventListener("click", () => resetGuideForm({ focus: true, showEditor: true }));
  $("#back-to-guide-list").addEventListener("click", showGuideListView);
  $("#guide-post-list").addEventListener("click", handleGuideListClick);
  $("#guide-post-form").addEventListener("submit", handleGuideSave);
  $("#guide-post-form").elements.content.addEventListener("input", renderGuidePreview);
  $("#guide-post-form").elements.title.addEventListener("input", renderGuidePreview);
  $("#guide-post-form").elements.summary.addEventListener("input", renderGuidePreview);
  bindGuideScrollSync();
  $all("[data-guide-category-preset]").forEach((button) => {
    button.addEventListener("click", () => applyGuideCategoryPreset(button.dataset.guideCategoryPreset));
  });
  $("#guide-markdown-toolbar").addEventListener("click", handleGuideMarkdownToolbarClick);
  $("#guide-image-upload").addEventListener("change", handleGuideMarkdownImageUpload);
  $("#delete-guide-post").addEventListener("click", handleGuideDelete);
  $("#guide-preview").addEventListener("click", handleGuideImageClick);
  $("#close-guide-image").addEventListener("click", closeGuideImageDialog);
  $("#guide-image-zoom-out").addEventListener("click", () => stepGuideImageZoom(-20));
  $("#guide-image-zoom-in").addEventListener("click", () => stepGuideImageZoom(20));
  $("#guide-image-zoom-reset").addEventListener("click", () => setGuideImageZoom(100));
  $("#guide-image-zoom-range").addEventListener("input", (event) => setGuideImageZoom(event.target.value));
  bindGuideImagePan();
  if (!renderMemberSortHead()) {
    $all("[data-member-sort]").forEach((button) => {
      button.addEventListener("click", () => sortMembersBy(button.dataset.memberSort));
    });
  }
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
    ["#audit-dialog", closeAuditDialog],
    ["#guide-image-dialog", closeGuideImageDialog],
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
    setText("#member-status", "已登入");
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
  await refreshOpenEvents("", { autoLoadSelection: true });
  await refreshHistoryEvents();
  await refreshPrizeProviderMembers();
  await prepareActiveAdminPanel();
}

function hydrateEventTitle() {
  const params = new URLSearchParams(window.location.search);
  state.eventSlugHint = params.get("slug") || params.get("event") || readLocalValue(STORAGE_KEYS.eventSlug) || "";
}

function resolveDrawAnimationChoice(seed) {
  return window.ROOC_DRAW_ANIMATION?.resolveChoice(seed) || {
    visualMode: "classic",
    revealMode: "roller"
  };
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
  const text = connected && state.environmentState && !state.environmentState.isDefault
    ? `${getActiveEnvironmentLabel()} 已連線`
    : connected ? "Supabase 已連線" : "尚未連線";

  window.ROOC_VUE_CONNECTION_PILL?.render?.({
    targetSelector: "#connection-pill",
    connected,
    isTestEnvironment: state.environmentState && !state.environmentState.isDefault,
    text
  });
}

async function loadOptionalLocalConfig() {
  await window.ROOC_CONFIG?.loadOptionalLocalConfig?.();
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
  setText("#member-status", "已登入");
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
  setText("#member-status", "未載入");
  $("#change-admin-pin").hidden = true;
  $("#logout-admin").hidden = true;
  $("#console-detail").hidden = true;
  $("#console-empty").hidden = false;
  setText("#console-status", "未載入");
  syncConsoleActionButtons();
  syncHistoryActionButtons();
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

function bindAutoLoadSelect(selector, handler) {
  const select = $(selector);
  if (!select) return;

  select.addEventListener("change", (event) => {
    if (isSelect2Active(select)) return;
    void handler();
  });

  if (window.jQuery?.fn?.select2) {
    window.jQuery(select).on("select2:select.roocAutoLoad", () => {
      void handler();
    });
  }
}

function isSelect2Active(select) {
  return Boolean(select && window.jQuery?.fn?.select2 && window.jQuery(select).data("select2"));
}

async function refreshOpenEvents(preferredSlug = "", options = {}) {
  const rows = await rpc("list_open_raffle_events", {
    p_app_admin_pin: state.appAdminPin
  });
  state.openEvents = (rows || []).filter((event) => event.status === "live");
  const loadedLiveSlug = state.event?.status === "live" ? state.event.slug : "";
  const selectionHint = preferredSlug || loadedLiveSlug || state.eventSlugHint;
  renderOpenEventOptions(selectionHint);

  const selectedSlug = resolveOpenEventSelection(selectionHint);
  if (options.autoLoadSelection && !state.event && selectedSlug) {
    await loadEvent(selectedSlug);
  }
}

function renderOpenEventOptions(preferredSlug = "") {
  const select = $("#event-title-select");
  if (!select) return;

  const current = preferredSlug || select.value;
  const hasOpenEvents = state.openEvents.length > 0;
  destroyEnhancedSelect(select);
  const options = state.openEvents.map((event) => ({
    value: event.slug,
    label: event.title
  }));
  const nextValue = resolveOpenEventSelection(current);

  if (nextValue) {
    state.eventSlugHint = nextValue;
  } else if (current && current === state.eventSlugHint) {
    state.eventSlugHint = "";
    writeLocalValue(STORAGE_KEYS.eventSlug, "");
  }

  window.ROOC_VUE_SELECT_OPTIONS?.render?.({
    targetSelector: "#event-title-select",
    placeholder: hasOpenEvents ? "選擇活動" : "目前沒有未完成活動",
    options,
    value: nextValue,
    disabled: !hasOpenEvents,
    onRendered: () => {
      enhanceSelect(select, {
        placeholder: hasOpenEvents ? "搜尋未完成活動" : "目前沒有未完成活動，請先建立活動",
        noResults: "沒有未完成活動"
      });
      syncEnhancedSelect(select);
    }
  });
}

function resolveOpenEventSelection(current = "") {
  const cleanCurrent = String(current || "").trim();
  if (cleanCurrent && state.openEvents.some((event) => event.slug === cleanCurrent)) {
    return cleanCurrent;
  }

  if (state.openEvents.length === 1) {
    return state.openEvents[0].slug;
  }

  return "";
}

async function refreshHistoryEvents(preferredSlug = "", options = {}) {
  const rows = await rpc("list_closed_raffle_events", {
    p_app_admin_pin: state.appAdminPin
  });
  state.historyEvents = rows || [];
  const selectionHint = preferredSlug || state.historyEvent?.slug || "";
  renderHistoryEventOptions(selectionHint);

  const selectedSlug = resolveHistoryEventSelection(selectionHint);
  if (options.autoLoadSelection && !state.historyEvent && selectedSlug) {
    await loadHistoryEvent(selectedSlug);
  }
}

function renderHistoryEventOptions(preferredSlug = "") {
  const select = $("#history-event-select");
  if (!select) return;

  const current = preferredSlug || select.value;
  const hasHistoryEvents = state.historyEvents.length > 0;
  destroyEnhancedSelect(select);
  const options = state.historyEvents.map((event) => ({
    value: event.slug,
    label: `${event.title} / ${formatDate(event.closed_at || event.created_at)}`
  }));
  const nextValue = resolveHistoryEventSelection(current);

  window.ROOC_VUE_SELECT_OPTIONS?.render?.({
    targetSelector: "#history-event-select",
    placeholder: hasHistoryEvents ? "選擇歷史活動" : "目前沒有已結束活動",
    options,
    value: nextValue,
    disabled: !hasHistoryEvents,
    onRendered: () => {
      enhanceSelect(select, {
        placeholder: hasHistoryEvents ? "搜尋已結束活動" : "目前沒有已結束活動",
        noResults: "沒有歷史活動"
      });
      syncEnhancedSelect(select);
    }
  });
}

function resolveHistoryEventSelection(current = "") {
  const cleanCurrent = String(current || "").trim();
  if (cleanCurrent && state.historyEvents.some((event) => event.slug === cleanCurrent)) {
    return cleanCurrent;
  }

  if (state.historyEvents.length === 1) {
    return state.historyEvents[0].slug;
  }

  return "";
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
  const options = state.providerMembers.map((member) => ({
    value: member.member_no,
    label: memberOptionLabel(member)
  }));
  const nextValue = current && state.providerMembers.some((member) => member.member_no === current) ? current : "";

  window.ROOC_VUE_SELECT_OPTIONS?.render?.({
    targetSelector: "#prize-provider-select",
    placeholder: "選擇提供者",
    options,
    value: nextValue,
    disabled: state.providerMembers.length === 0,
    onRendered: () => {
      enhanceSelect(select, {
        placeholder: "搜尋提供者",
        noResults: "找不到公會中成員"
      });
      syncEnhancedSelect(select);
    }
  });
}

function populateTransferMemberSelect(preferredMemberNo = "") {
  const selects = $all("[data-transfer-select]");
  if (selects.length === 0) return;

  selects.forEach((select) => {
    const current = preferredMemberNo || select.value;
    destroyEnhancedSelect(select);

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
  const { prize, eligibleRemaining, limit } = getSelectedDrawLimit();
  const countInput = $("#draw-count");
  const rawDrawCount = Number(countInput?.value || 1);

  if (!state.event || !prize || eligibleRemaining <= 0 || limit <= 0) {
    window.ROOC_VUE_DRAW_ODDS?.render?.({
      targetSelector: "#draw-odds-card",
      hidden: true
    });
    return;
  }

  const drawCount = Math.min(Math.max(Math.trunc(rawDrawCount || 1), 1), limit);
  const probability = drawCount / eligibleRemaining;
  const providerExcluded = prize.provider_excluded ? 1 : 0;
  const excludedCount = Number(state.event.excluded_count || 0);
  const activeCount = Number(state.event.total_active_members || 0);
  const probabilityText = `${drawCount}/${eligibleRemaining} = ${formatPercent(probability)}`;
  const formula = `可抽人數 = 公會中 ${activeCount} - 已排除 ${excludedCount} - 獎項提供者 ${providerExcluded} = ${eligibleRemaining}；每位本輪機率 = 抽出人數 / 可抽人數。`;

  window.ROOC_VUE_DRAW_ODDS?.render?.({
    targetSelector: "#draw-odds-card",
    hidden: false,
    probability: probabilityText,
    formula
  });
}

async function handleLoadEvent(event) {
  event.preventDefault();
  await loadSelectedEventFromSelect(event.currentTarget);
}

async function loadSelectedEventFromSelect(form = $("#load-event-form")) {
  const data = new FormData(form);
  const slug = String(data.get("slug") || "").trim();
  if (!slug) return;

  await withBusy(form, async () => {
    await loadEvent(slug);
  });
}

async function handleRefreshEvents() {
  await withBusy($("#load-event-form"), async () => {
    await ensureAppAdminPin();
    await refreshOpenEvents("", { autoLoadSelection: true });
    showToast("未完成活動已刷新。", "success");
  });
}

function openCreateEventDialog() {
  const dialog = $("#create-event-dialog");
  const form = $("#create-event-form");
  form.reset();
  fillCreateEventTitlePrefix(form);
  showModalDialog(dialog);
  refreshIcons();
  window.setTimeout(() => {
    form.elements.title.focus();
    form.elements.title.setSelectionRange(form.elements.title.value.length, form.elements.title.value.length);
  }, 0);
}

function closeCreateEventDialog() {
  const dialog = $("#create-event-dialog");
  $("#create-event-form").reset();
  closeModalDialog(dialog);
}

function fillCreateEventTitlePrefix(form) {
  const titleInput = form?.elements?.title;
  if (!titleInput) return;

  titleInput.value = `${formatEventTitleDate(new Date())} `;
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
  setText("#bonus-prize-mode", isExistingPrize ? "調整" : "新增");
  setText("#bonus-prize-title", isExistingPrize ? "調整獎項名額" : "新增獎項");
  setText("#bonus-prize-submit-label", isExistingPrize ? "儲存名額" : "新增獎項");
  setText("#bonus-quantity-label", isExistingPrize ? "總名額" : "名額");

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
    setText("#bonus-selected-prize-name", `${prize.name} / ${prize.provider} / 目前 ${currentQuantity} 名額，已抽或待處理 ${usedCount} 名`);
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
  setText("#bonus-selected-prize-name", "");
  setText("#bonus-prize-mode", "新增");
  setText("#bonus-prize-title", "新增獎項");
  setText("#bonus-prize-submit-label", "新增獎項");
  setText("#bonus-quantity-label", "名額");
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

async function prepareHistoryPanel() {
  await withBusy($("#panel-history"), async () => {
    await ensureAppAdminPin();
    await refreshHistoryEvents("", { autoLoadSelection: true });
  });
}

async function handleRefreshHistoryEvents() {
  await withBusy($("#history-event-form"), async () => {
    await ensureAppAdminPin();
    await refreshHistoryEvents("", { autoLoadSelection: true });
    showToast("歷史活動已刷新。", "success");
  });
}

async function handleLoadHistoryEvent(event) {
  event.preventDefault();
  await loadSelectedHistoryEventFromSelect(event.currentTarget);
}

async function loadSelectedHistoryEventFromSelect(form = $("#history-event-form")) {
  const data = new FormData(form);
  const slug = String(data.get("slug") || "").trim();
  if (!slug) return;

  await withBusy(form, async () => {
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
  setText("#history-status", eventStatusText[event.status] || event.status);
  const historyStatus = eventStatusText[event.status] || event.status;
  const historyMeta = event.closed_at ? `結束時間：${formatDate(event.closed_at)}` : `建立時間：${formatDate(event.created_at)}`;
  renderAdminEventHeader({
    targetSelector: "#admin-history-event-header",
    label: "活動",
    title: event.title,
    status: historyStatus,
    meta: historyMeta
  });
  renderAdminHistoryStats(event);
  syncHistoryRosterButtons();
  syncHistoryActionButtons(event);

  renderPrizeRows("#history-prize-table", event.prizes, "這場活動沒有獎項紀錄。");
  renderAwardRows("#history-award-table", event.awards, "這場活動沒有中獎紀錄。", {
    limit: AWARD_RENDER_LIMIT
  });
  renderDrawLogRows("#history-draw-log-table", event.recent_draws, "這場活動沒有抽獎紀錄。", event.slug, {
    limit: DRAW_LOG_RENDER_LIMIT
  });
  refreshIcons();
}

function renderAdminHistoryStats(event) {
  return Boolean(window.ROOC_VUE_ADMIN_STATS?.render?.({
    targetSelector: "#admin-history-stats-grid",
    stats: [
      { key: "history_prizes", label: "獎項數", value: event.prizes.length, historyRosterKey: "history_prizes" },
      { key: "history_awards", label: "中獎紀錄", value: event.awards.length, historyRosterKey: "history_awards" },
      { key: "history_draws", label: "抽獎紀錄", value: event.recent_draws.length, historyRosterKey: "history_draws" },
      { key: "history_excluded_members", label: "已排除", value: event.excluded_count ?? 0, historyRosterKey: "history_excluded_members" }
    ],
    onRendered: syncHistoryRosterButtons
  }));
}

function renderAdminEventHeader(payload = {}) {
  return Boolean(window.ROOC_VUE_ADMIN_EVENT_HEADER?.render?.(payload));
}

function clearHistoryDetail() {
  const detail = $("#history-detail");
  const empty = $("#history-empty");
  if (!detail || !empty) return;

  const select = $("#history-event-select");
  if (select) {
    select.value = "";
    syncEnhancedSelect(select);
  }
  detail.hidden = true;
  empty.hidden = false;
  setText("#history-status", "未載入");
  syncHistoryActionButtons(null);
  renderAdminEventHeader({
    targetSelector: "#admin-history-event-header",
    label: "活動",
    title: "尚未載入",
    status: "未載入",
    meta: ""
  });
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
  setText("#console-status", eventStatusText[event.status] || event.status);
  const eventStatus = eventStatusText[event.status] || event.status;
  renderAdminEventHeader({
    targetSelector: "#admin-console-event-header",
    label: "抽獎",
    title: event.title,
    status: eventStatus
  });
  renderAdminConsoleStats(event);
  syncRosterButtons();
  syncConsoleActionButtons(event);
  $("#draw-prize").disabled = event.status !== "live";
  $("#open-bonus-prize-dialog").disabled = event.status !== "live";

  renderPrizeOptions();
  renderPendingDraw();
  renderPrizeTable();
  renderAwards();
  renderDrawLog();
  refreshIcons();
}

function syncConsoleActionButtons(event = state.event) {
  const hasEvent = Boolean(event);
  const isLive = event?.status === "live";
  const targetStatus = isLive ? "closed" : "live";
  const statusButton = $("#toggle-event-status");
  const statusIcon = statusButton?.querySelector("[data-lucide]");
  const statusLabel = !hasEvent ? "活動狀態" : isLive ? "結束活動" : "重新開放";

  statusButton.disabled = !hasEvent;
  statusButton.dataset.targetStatus = targetStatus;
  if (statusIcon) {
    statusIcon.dataset.lucide = !hasEvent || isLive ? "lock" : "unlock";
  }
  setText("#toggle-event-status span", statusLabel);
  $("#delete-event").disabled = !hasEvent;
  refreshIcons();
}

function handleToggleEventStatus(event) {
  const targetStatus = event.currentTarget.dataset.targetStatus || (state.event?.status === "live" ? "closed" : "live");
  void setEventStatus(targetStatus);
}

function syncHistoryActionButtons(event = state.historyEvent) {
  const hasEvent = Boolean(event);
  $("#reopen-history-event").disabled = !hasEvent;
  $("#delete-history-event").disabled = !hasEvent;
  refreshIcons();
}

function renderAdminConsoleStats(event) {
  return Boolean(window.ROOC_VUE_ADMIN_STATS?.render?.({
    targetSelector: "#admin-console-stats-grid",
    stats: [
      { key: "active_members", label: "公會中成員", value: event.total_active_members ?? 0, rosterKey: "active_members" },
      { key: "eligible_members", label: "可抽名單", value: event.eligible_count ?? 0, rosterKey: "eligible_members" },
      { key: "excluded_members", label: "已排除", value: event.excluded_count ?? 0, rosterKey: "excluded_members" },
      { key: "awarded_members", label: "已發獎", value: event.award_count ?? 0, rosterKey: "awarded_members" }
    ],
    onRendered: syncRosterButtons
  }));
}

function renderPrizeOptions() {
  const select = $("#draw-prize-select");
  const previousValue = select.value;

  const prizes = state.event.prizes || [];
  const options = prizes.map((prize) => {
    const drawLimit = Math.min(
      Math.max(Number(prize.remaining_count || 0), 0),
      Math.max(Number(prize.eligible_count ?? state.event?.eligible_count ?? 0), 0)
    );
    return {
      value: prize.id,
      label: `${prize.name} / ${prize.provider} / 可抽 ${drawLimit}`
    };
  });
  const nextValue = previousValue && prizes.some((prize) => prize.id === previousValue) ? previousValue : "";

  window.ROOC_VUE_SELECT_OPTIONS?.render?.({
    targetSelector: "#draw-prize-select",
    placeholder: prizes.length === 0 ? "尚未新增獎項" : "選擇獎項",
    options,
    value: nextValue,
    disabled: prizes.length === 0,
    onRendered: updateDrawCountLimit
  });
  $("#draw-prize").disabled = prizes.length === 0 || state.event.status !== "live";
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
  const subtitle = (source === "history" ? state.historyEvent?.title : state.event?.title) || "目前活動";

  window.ROOC_VUE_ROSTER_SHELL?.render?.({
    targetSelector: "#roster-dialog .modal-shell",
    eyebrow: "名單",
    title: config.title,
    closeButtonId: "close-roster-dialog",
    closeLabel: "關閉名單",
    subtitle,
    count: list.length,
    emptyMessage: config.empty,
    items: buildRosterDialogItems(list, rosterKey),
    onClose: closeRosterDialog
  });
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

function buildRosterDialogItems(list, rosterKey = "") {
  if (rosterKey === "history_prizes") {
    return list.map((prize, index) => ({
      id: prize.id || `history-prize-${index}`,
      title: prize.name || "未命名獎項",
      meta: historyPrizeMeta(prize)
    }));
  }

  if (rosterKey === "history_awards") {
    return list.map((award, index) => ({
      id: award.id || `history-award-${index}`,
      title: memberPlainText(award.final_member_no, award.final_role_name),
      meta: historyAwardMeta(award)
    }));
  }

  if (rosterKey === "history_draws") {
    return list.map((draw, index) => ({
      id: draw.id || `history-draw-${index}`,
      title: memberPlainText(draw.drawn_member_no, draw.drawn_role_name),
      meta: historyDrawMeta(draw)
    }));
  }

  return list.map((member, index) => ({
    id: member.member_no || `${rosterKey}-${index}`,
    title: memberPlainText(member.member_no, member.role_name),
    meta: statMemberMeta(member) || "沒有額外資訊"
  }));
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
  const visibleCount = Math.min(state.pendingVisibleCount, pendingDraws.length);
  const visibleDraws = pendingDraws.slice(0, visibleCount);
  const hiddenCount = Math.max(pendingDraws.length - visibleCount, 0);

  renderPendingDrawCard({
    pendingDraws,
    visibleDraws,
    visibleCount,
    hiddenCount
  });
}

function renderPendingDrawCard({ pendingDraws, visibleDraws, visibleCount, hiddenCount }) {
  const transferPlaceholder = state.transferCandidatesLoading
    ? "載入可轉讓名單中"
    : state.transferCandidates.length === 0
      ? "沒有可轉讓成員"
      : "選擇轉讓對象";

  return Boolean(window.ROOC_VUE_PENDING_CARD?.render?.({
    targetSelector: "#pending-card",
    hidden: pendingDraws.length === 0,
    rows: buildPendingDrawRows(visibleDraws),
    totalCount: pendingDraws.length,
    visibleCount,
    hiddenCount,
    transferOptions: state.transferCandidates.map((member) => ({
      value: member.member_no,
      label: memberOptionLabel(member)
    })),
    transferPlaceholder,
    transferDisabled: state.transferCandidatesLoading || state.transferCandidates.length === 0,
    onShowMore: showMorePendingDraws,
    onTransferStateChange: refreshIcons,
    onRendered: () => {
      populateTransferMemberSelect();
      refreshIcons();
    }
  }));
}

function buildPendingDrawRows(draws) {
  return draws.map((pending) => ({
    id: pending.id,
    title: `${pending.role_name || ""}（${pending.member_no || ""}）`,
    description: [
      pending.prize_name,
      `提供者：${pending.provider || ""}`,
      `職業：${pending.occupation || "未填"}`,
      `DC：${pending.joined_dc ? "已加入" : "未加入"}`
    ].join(" / ")
  }));
}

function showMorePendingDraws() {
  state.pendingVisibleCount += PENDING_DRAW_PAGE_SIZE;
  renderPendingDraw();
}

function renderPrizeTable() {
  renderPrizeRows("#prize-table", state.event.prizes, "尚未新增獎項。", { actions: true });
}

function renderPrizeRows(selector, prizes, emptyMessage, options = {}) {
  const rows = asArray(prizes);
  const columnCount = options.actions ? 6 : 5;

  renderAdminTable({
    targetSelector: selector,
    kind: "prizes",
    rows: buildAdminPrizeTableRows(rows, options),
    emptyMessage,
    colspan: columnCount
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
  renderAwardRows("#award-table", state.event.awards, "尚未有中獎紀錄。", {
    limit: AWARD_RENDER_LIMIT
  });
}

function renderAwardRows(selector, awards, emptyMessage, options = {}) {
  const allRows = asArray(awards);
  const limit = Number(options.limit || 0);
  const visibleRows = limit > 0 ? allRows.slice(0, limit) : allRows;
  const hiddenCount = Math.max(allRows.length - visibleRows.length, 0);
  const footerMessage = hiddenCount > 0
    ? `僅顯示最近 ${visibleRows.length} 筆，另有 ${hiddenCount} 筆可用 Excel 匯出查看。`
    : "";

  renderAdminTable({
    targetSelector: selector,
    kind: "awards",
    rows: buildAdminAwardTableRows(visibleRows),
    emptyMessage,
    footerMessage,
    colspan: 6
  });
}

function renderDrawLog() {
  renderDrawLogRows("#draw-log-table", state.event.recent_draws, "尚未有抽獎紀錄。", state.event.slug, {
    limit: DRAW_LOG_RENDER_LIMIT
  });
}

function renderDrawLogRows(selector, draws, emptyMessage, eventSlug = "", options = {}) {
  const allDraws = sortDrawRows(draws);
  const limit = Number(options.limit || 0);
  const visibleDraws = limit > 0 ? allDraws.slice(0, limit) : allDraws;
  const hiddenCount = Math.max(allDraws.length - visibleDraws.length, 0);
  const footerMessage = hiddenCount > 0
    ? `僅顯示最近 ${visibleDraws.length} 筆，另有 ${hiddenCount} 筆可用 Excel 匯出查看。`
    : "";

  renderAdminTable({
    targetSelector: selector,
    kind: "draws",
    rows: buildAdminDrawTableRows(visibleDraws, eventSlug),
    emptyMessage,
    footerMessage,
    colspan: 6
  });
}

function renderAdminTable(payload = {}) {
  return Boolean(window.ROOC_VUE_ADMIN_TABLES?.render?.(payload));
}

function buildAdminPrizeTableRows(prizes, options = {}) {
  return prizes.map((prize, index) => {
    const drawCount = Number(prize.filled_count || 0) + Number(prize.pending_count || 0);
    const anyDrawCount = Number(prize.draw_count ?? drawCount);
    const showActions = Boolean(options.actions);

    return {
      id: prize.id || `admin-prize-row-${index}`,
      name: prize.name || "",
      provider: prize.provider || "",
      quantity: prize.quantity ?? "",
      filledCount: prize.filled_count ?? "",
      remainingCount: prize.remaining_count ?? "",
      showActions,
      canAdjust: showActions && state.event?.status === "live",
      canDelete: showActions && state.event?.status === "live" && anyDrawCount === 0
    };
  });
}

function buildAdminAwardTableRows(awards) {
  return awards.map((award, index) => ({
    id: award.id || `admin-award-row-${index}`,
    prizeName: award.prize_name || "",
    provider: award.provider || "",
    drawnMember: memberPlainText(award.drawn_member_no, award.drawn_role_name),
    finalMember: memberPlainText(award.final_member_no, award.final_role_name),
    status: drawStatusText[award.status] || award.status || "",
    resolvedAt: formatDate(award.resolved_at)
  }));
}

function buildAdminDrawTableRows(draws, eventSlug = "") {
  return draws.map((draw, index) => ({
    id: draw.id || `admin-draw-row-${index}`,
    drawId: draw.id || "",
    prizeName: draw.prize_name || "",
    provider: draw.provider || "",
    drawnMember: memberPlainText(draw.drawn_member_no, draw.drawn_role_name),
    result: drawLogResultText(draw),
    probability: formatPercent(draw.step_probability),
    canVerify: Boolean(draw.id && eventSlug)
  }));
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

function handleAdminDrawVerifyClick(event) {
  const button = event.target.closest("[data-verify-draw]");
  if (!button) return;

  event.preventDefault();
  const context = resolveAdminDrawVerifyContext(button);
  if (!context.draw || !context.event) {
    showToast("找不到這筆抽獎紀錄。", "error");
    return;
  }

  openAuditDialog(context.draw, context.event);
}

function resolveAdminDrawVerifyContext(button) {
  const tableBody = button.closest("tbody");
  const targetEvent = tableBody?.id === "history-draw-log-table"
    ? state.historyEvent
    : state.event;
  const drawId = button.dataset.verifyDraw || "";
  const draw = asArray(targetEvent?.recent_draws).find((item) => item.id === drawId);
  return { event: targetEvent, draw };
}

function openAuditDialog(draw, targetEvent) {
  const dialog = $("#audit-dialog");
  const fallbackDraw = normalizeAuditDraw(draw, targetEvent);
  const requestSeq = state.auditDialogSeq + 1;
  state.auditDialogSeq = requestSeq;

  renderAuditContent(fallbackDraw, { status: "checking" });
  showModalDialog(dialog);
  refreshIcons();

  void loadFullAuditDraw(draw, targetEvent)
    .then(async (fullDraw) => {
      const verification = await verifyDrawAudit(fullDraw);
      if (requestSeq !== state.auditDialogSeq || !dialog.open) return;
      renderAuditContent(fullDraw, verification);
    })
    .catch((error) => {
      if (requestSeq !== state.auditDialogSeq || !dialog.open) return;
      renderAuditContent(fallbackDraw, {
        status: "failed",
        message: friendlyError(error.message)
      });
    });
}

function closeAuditDialog() {
  state.auditDialogSeq += 1;
  closeModalDialog($("#audit-dialog"));
}

function renderAuditContent(draw, verification) {
  const audit = draw.audit;
  const title = `${draw.prize_name || "未命名獎項"} / ${memberPlainText(draw.drawn_member_no, draw.drawn_role_name)}`;
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

async function loadFullAuditDraw(draw, targetEvent) {
  const fallbackDraw = normalizeAuditDraw(draw, targetEvent);
  const slug = targetEvent?.slug || "";
  if (!slug || !draw?.id) return fallbackDraw;

  let publicEvent = await fetchPublicAuditEvent(slug);
  let publicDraw = publicEvent.draws.find((item) => item.id === draw.id);

  if (!publicDraw) {
    publicEvent = await fetchPublicAuditEvent(slug, { force: true });
    publicDraw = publicEvent.draws.find((item) => item.id === draw.id);
  }

  return publicDraw || fallbackDraw;
}

async function fetchPublicAuditEvent(slug, options = {}) {
  const cleanSlug = cleanRequired(slug, "請選擇活動。");
  const environmentId = state.environmentState?.current?.id || "default";
  const cacheKey = `${environmentId}:${cleanSlug}`;

  if (!options.force && state.publicAuditEvents.has(cacheKey)) {
    return state.publicAuditEvents.get(cacheKey);
  }

  const rows = await rpc("get_public_raffle_event", {
    p_slug: cleanSlug
  });

  if (!rows || rows.length === 0) {
    throw new Error("找不到活動。");
  }

  const publicEvent = normalizeAuditEvent(rows[0]);
  state.publicAuditEvents.set(cacheKey, publicEvent);
  return publicEvent;
}

function normalizeAuditEvent(event) {
  return {
    ...event,
    draws: asArray(event.draws).map((draw) => normalizeAuditDraw(draw, event))
  };
}

function normalizeAuditDraw(draw, targetEvent = {}) {
  const source = draw && typeof draw === "object" ? draw : {};
  const normalized = { ...source };
  if (!normalized.event_id && targetEvent?.id) {
    normalized.event_id = targetEvent.id;
  }

  if (source.audit && typeof source.audit === "object") {
    normalized.audit = normalizeAuditSnapshot(source.audit, source);
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
    normalized.audit = normalizeAuditSnapshot(source, source);
  }

  return normalized;
}

function normalizeAuditSnapshot(audit, draw = {}) {
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
    eventId: draw?.event_id || "",
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

    const animationChoice = resolveDrawAnimationChoice(liveDraw?.id || `${state.event.slug}:${prizeId}:${Date.now()}`);
    const animationContext = {
      prizeName: liveDraw?.prize_name || prize?.name || $("#draw-prize-select").selectedOptions[0]?.textContent || "抽獎",
      drawCount,
      revealMode: animationChoice.revealMode,
      visualMode: animationChoice.visualMode
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

function renderDrawReveal(payload = {}) {
  return Boolean(window.ROOC_VUE_DRAW_REVEAL?.render?.({
    targetSelector: "#draw-animation-reveal-content",
    resultListId: "draw-animation-results",
    flipListId: "draw-animation-flip-results",
    ...payload
  }));
}

function openDrawAnimation(context) {
  const dialog = $("#draw-animation-dialog");
  const roller = $("#draw-animation-roller");
  const mode = context.visualMode || "classic";
  const revealMode = context.revealMode || "roller";
  const isFlipReveal = revealMode === "flip";
  const isFireworksMode = mode === "fireworks";

  stopDrawRoller();
  clearDrawEffectCleanup();
  stopDrawFireworks();
  window.ROOC_DRAW_ANIMATION.clearVisualModeClasses(dialog);
  window.ROOC_DRAW_ANIMATION.clearRevealModeClasses(dialog);
  dialog.classList.remove("is-revealed", "has-multiple-results", "has-flip-results");
  dialog.classList.add(`mode-${mode}`);
  dialog.classList.add(`reveal-${revealMode}`);
  setText("#draw-animation-phase", window.ROOC_DRAW_ANIMATION.phaseText(mode, context.drawCount, revealMode));
  setText("#draw-animation-prize", context.prizeName);
  renderDrawReveal({
    labels: [],
    rows: [],
    placeholderCount: isFlipReveal ? context.drawCount : 0,
    prizeName: context.prizeName,
    revealMode
  });
  state.drawAnimationMode = mode;

  drawAnimationState.labels = buildDrawRollerLabels();
  drawAnimationState.index = 0;
  roller.textContent = isFlipReveal ? "" : (drawAnimationState.labels[0] || "ROOC");

  showModalDialog(dialog);

  if (isFireworksMode) {
    startDrawFireworks();
  }

  if (!isFlipReveal && !prefersReducedMotion()) {
    drawAnimationState.intervalId = window.setInterval(() => {
      drawAnimationState.index = (drawAnimationState.index + 1) % drawAnimationState.labels.length;
      roller.textContent = drawAnimationState.labels[drawAnimationState.index];
    }, 82);
  }
}

async function revealDrawAnimationResults(rows, context) {
  const dialog = $("#draw-animation-dialog");
  const roller = $("#draw-animation-roller");
  const labels = rows.map(drawResultLabel).filter(Boolean);
  const hasMultipleResults = labels.length > 1;
  const revealMode = context.revealMode || "roller";
  const isFlipReveal = revealMode === "flip";

  stopDrawRoller();
  dialog.classList.add("is-revealed");
  dialog.classList.toggle("has-multiple-results", hasMultipleResults);
  dialog.classList.toggle("has-flip-results", isFlipReveal);
  setText("#draw-animation-phase", isFlipReveal ? "翻牌揭曉" : (hasMultipleResults ? "中獎名單" : "中獎者"));
  roller.textContent = isFlipReveal || hasMultipleResults ? "" : (labels[0] || context.prizeName);
  renderDrawReveal({
    labels: !isFlipReveal && hasMultipleResults ? labels : [],
    rows: isFlipReveal ? rows : [],
    placeholderCount: 0,
    prizeName: context.prizeName,
    revealMode
  });

  launchDrawFireworks(labels.length || context.drawCount);
  launchDrawConfetti(labels.length || context.drawCount);
  scheduleDrawEffectCleanup();
  await waitForAnimation(prefersReducedMotion() ? 260 : window.ROOC_DRAW_ANIMATION.revealWaitTime(labels.length || context.drawCount, revealMode));
}

function closeDrawAnimation() {
  const dialog = $("#draw-animation-dialog");
  stopDrawRoller();
  clearDrawEffectCleanup();
  stopDrawFireworks();
  closeModalDialog(dialog);
  dialog.classList.remove("is-revealed", "has-multiple-results", "has-flip-results");
  window.ROOC_DRAW_ANIMATION.clearVisualModeClasses(dialog);
  window.ROOC_DRAW_ANIMATION.clearRevealModeClasses(dialog);
}

function handleDrawAnimationClick(event) {
  const dialog = $("#draw-animation-dialog");
  if (!dialog.classList.contains("is-revealed")) return;

  if (event.target === dialog) {
    closeDrawAnimation();
  }
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
  return window.ROOC_DRAW_ANIMATION.resultLabel(row);
}

function sortDrawRows(rows) {
  return asArray(rows)
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.row?.created_at || "") || 0;
      const rightTime = Date.parse(right.row?.created_at || "") || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;

      const leftSlot = Number(left.row?.slot_number ?? Number.MAX_SAFE_INTEGER);
      const rightSlot = Number(right.row?.slot_number ?? Number.MAX_SAFE_INTEGER);
      if (leftSlot !== rightSlot) return leftSlot - rightSlot;

      return left.index - right.index;
    })
    .map((item) => item.row);
}

function launchDrawConfetti(resultCount) {
  window.ROOC_DRAW_ANIMATION.launchConfetti(resultCount);
}

function startDrawFireworks() {
  if (prefersReducedMotion()) return;

  const container = $("#draw-fireworks-layer");
  if (!container) return;

  stopDrawFireworks();
  try {
    drawAnimationState.fireworks = window.ROOC_DRAW_ANIMATION.createFireworks(container);
    drawAnimationState.fireworks?.start();
  } catch {
    stopDrawFireworks();
  }
}

function launchDrawFireworks(resultCount) {
  if (state.drawAnimationMode !== "fireworks" || prefersReducedMotion()) return;

  const fireworks = drawAnimationState.fireworks;
  window.ROOC_DRAW_ANIMATION.launchFireworks(fireworks, resultCount);
}

function scheduleDrawEffectCleanup() {
  clearDrawEffectCleanup();
  if (state.drawAnimationMode !== "fireworks") return;

  drawAnimationState.effectCleanupId = window.setTimeout(() => {
    drawAnimationState.effectCleanupId = null;
    stopDrawFireworks();
  }, DRAW_EFFECT_CLEANUP_MS);
}

function clearDrawEffectCleanup() {
  if (!drawAnimationState.effectCleanupId) return;
  window.clearTimeout(drawAnimationState.effectCleanupId);
  drawAnimationState.effectCleanupId = null;
}

function stopDrawFireworks() {
  clearDrawEffectCleanup();
  const fireworks = drawAnimationState.fireworks;
  drawAnimationState.fireworks = null;

  const container = $("#draw-fireworks-layer");
  window.ROOC_DRAW_ANIMATION.stopFireworks(fireworks, container);
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
  let targetSlug = "";
  try {
    ensureEventLoaded();
    targetSlug = state.event.slug;
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

  await withBusy($("#console-action-bar"), async () => {
    await ensureAppAdminPin();
    await rpc("set_raffle_event_status", {
      p_slug: targetSlug,
      p_admin_pin: state.appAdminPin,
      p_status: status
    });

    if (status === "closed") {
      clearLoadedEvent();
      await refreshOpenEvents("", { autoLoadSelection: true });
      await refreshHistoryEvents(targetSlug);
      await loadHistoryEvent(targetSlug);
    } else {
      await refreshOpenEvents(targetSlug);
      await refreshHistoryEvents();
      await loadEvent(targetSlug);
    }

    showToast(`${label}完成。`, "success");
  });
  syncConsoleActionButtons();
  syncHistoryActionButtons();
}

async function reopenHistoryEvent() {
  const targetEvent = state.historyEvent;
  if (!targetEvent) {
    showToast("請先載入歷史活動。", "error");
    return;
  }

  const confirmed = await requestConfirmDialog({
    title: "重新開放活動",
    message: `確定重新開放「${targetEvent.title}」？重新開放後會回到抽獎控制台繼續使用。`,
    confirmLabel: "重新開放",
    confirmIcon: "unlock",
    confirmKind: "primary"
  });
  if (!confirmed) return;

  await withBusy($("#history-action-bar"), async () => {
    await ensureAppAdminPin();
    await rpc("set_raffle_event_status", {
      p_slug: targetEvent.slug,
      p_admin_pin: state.appAdminPin,
      p_status: "live"
    });

    state.historyEvent = null;
    clearHistoryDetail();
    await refreshHistoryEvents();
    await refreshOpenEvents(targetEvent.slug);
    await loadEvent(targetEvent.slug);
    switchTab("console");
    showToast("活動已重新開放。", "success");
  });
  syncHistoryActionButtons();
  syncConsoleActionButtons();
}

async function deleteLoadedEvent(source) {
  const targetEvent = source === "history" ? state.historyEvent : state.event;
  if (!targetEvent) {
    showToast("請先載入活動。", "error");
    return;
  }

  const busyTarget = source === "history" ? $("#history-action-bar") : $("#console-action-bar");
  const mutationKey = `delete:${source}:${targetEvent.slug || targetEvent.title || ""}`;
  if (state.eventMutationKey === mutationKey) return;

  state.eventMutationKey = mutationKey;
  setBusy(busyTarget, true);
  try {
    const confirmed = await requestConfirmDialog({
      title: "刪除活動",
      message: `確定刪除「${targetEvent.title}」？獎項、中獎名單與抽獎紀錄都會一併刪除。`,
      confirmLabel: "刪除活動",
      confirmIcon: "trash-2",
      confirmKind: "danger"
    });
    if (!confirmed) return;

    await ensureAppAdminPin();
    await deleteRaffleEventByKnownIdentifiers(targetEvent, source);

    if (state.historyEvent?.slug === targetEvent.slug) {
      state.historyEvent = null;
      clearHistoryDetail();
    }

    if (state.event?.slug === targetEvent.slug) {
      clearLoadedEvent();
    }

    await refreshOpenEvents("", { autoLoadSelection: source !== "history" });
    await refreshHistoryEvents("", { autoLoadSelection: source === "history" });
    showToast("活動已刪除。", "success");
  } catch (error) {
    rememberInvalidPins(error);
    showToast(friendlyError(error.message || "刪除活動失敗。"), "error");
  } finally {
    state.eventMutationKey = "";
    setBusy(busyTarget, false);
    if (source !== "history") {
      syncConsoleActionButtons();
    } else {
      syncHistoryActionButtons();
    }
  }
}

async function deleteRaffleEventByKnownIdentifiers(event, source) {
  const candidates = getEventIdentifierCandidates(event, source);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      await rpc("delete_raffle_event", {
        p_slug: candidate,
        p_admin_pin: state.appAdminPin
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isMissingEventError(error)) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("找不到活動。");
}

function getEventIdentifierCandidates(event, source) {
  const selectValue = source === "history"
    ? $("#history-event-select")?.value
    : $("#event-title-select")?.value;
  const titleSlug = slugifyEventTitle(event.title);
  return uniqueCleanValues([
    event.slug,
    selectValue,
    source === "history" ? state.historyEvent?.slug : state.eventSlugHint,
    readLocalValue(STORAGE_KEYS.eventSlug),
    titleSlug,
    event.title
  ]);
}

function slugifyEventTitle(title) {
  let slug = String(title || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!slug) {
    slug = "raffle";
  }
  slug = slug.slice(0, 72).replace(/^-|-$/g, "");
  if (slug.length > 0 && slug.length < 3) {
    slug = `raffle-${slug}`;
  }
  return slug;
}

function uniqueCleanValues(values) {
  const seen = new Set();
  return values.reduce((items, value) => {
    const clean = String(value || "").trim();
    if (!clean || seen.has(clean)) {
      return items;
    }

    seen.add(clean);
    items.push(clean);
    return items;
  }, []);
}

function isMissingEventError(error) {
  return String(error?.message || "").includes("找不到活動");
}

function clearLoadedEvent() {
  state.event = null;
  $("#console-detail").hidden = true;
  $("#console-empty").hidden = false;
  setText("#console-status", "未載入");
  syncConsoleActionButtons();
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

  setText("#admin-pin-title", isChange ? "修改管理密碼" : isLogin ? "後台登入" : "管理密碼");
  setText("#admin-pin-label", isLogin ? "輸入管理密碼" : "首次設定或驗證管理密碼");
  setText("#admin-pin-submit-label", isLogin ? "登入" : "確認");
  $("#cancel-admin-pin").hidden = isRequired && !canReturnPublic;
  $("#cancel-admin-pin").setAttribute("aria-label", canReturnPublic ? "返回成員入口" : "取消管理密碼驗證");
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
  window.ROOC_VUE_OCCUPATION_TABLE?.render?.({
    targetSelector: "#occupation-table",
    rows: state.occupations.map((occupation) => ({
      name: occupation.name,
      isActive: Boolean(occupation.is_active)
    })),
    emptyMessage: "尚未建立職業。",
    onEdit: editOccupation,
    onToggle: toggleOccupation
  });
}

function renderOccupationOptions() {
  $all("[data-occupation-select], #member-occupation, #edit-member-occupation").forEach((select) => {
    populateOccupationSelect(select, select.value);
  });
}

function populateOccupationSelect(select, current = "") {
  if (!select) return;
  const options = state.occupations
    .filter((occupation) => occupation.is_active)
    .map((occupation) => ({
      value: occupation.name,
      label: occupation.name
    }));
  const hasCurrentOccupation = current && state.occupations.some((occupation) => occupation.name === current);
  if (hasCurrentOccupation && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: `${current}（已停用）`
    });
  }

  if (!select.id) return;
  window.ROOC_VUE_SELECT_OPTIONS?.render?.({
    targetSelector: `#${select.id}`,
    placeholder: "未設定",
    options,
    value: current,
    disabled: false
  });
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
  setText("#occupation-form-mode", isEditing ? "編輯職業" : "新增職業");
  setText("#occupation-edit-label", isEditing ? `正在編輯：${name}` : "建立新的職業選項");
  setText("#occupation-edit-badge", isEditing ? "編輯中" : "新增");
  setText("#occupation-submit-label", isEditing ? "儲存修改" : "新增職業");
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
  setText("#member-status", `${state.members.length} 筆`);
  renderMemberSortButtons();
  const sortedMembers = getSortedMembers();

  window.ROOC_VUE_MEMBER_TABLE?.render?.({
    targetSelector: "#member-table",
    rows: sortedMembers.map((member) => ({
      memberNo: member.member_no,
      roleName: member.role_name || "",
      occupation: member.occupation || "",
      joinedDc: Boolean(member.joined_dc),
      isActive: Boolean(member.is_active)
    })),
    emptyMessage: "沒有符合條件的成員。",
    onEdit: editMember,
    onToggle: toggleMember
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
  renderMemberSortHead();
}

function renderMemberSortHead() {
  return Boolean(window.ROOC_VUE_MEMBER_SORT_HEAD?.render?.({
    targetSelector: "#member-table-head",
    sortKey: state.memberSort.key,
    direction: state.memberSort.direction,
    onSort: sortMembersBy,
    onRendered: refreshIcons
  }));
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
  renderMemberImportTable([]);
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

  window.ROOC_VUE_MEMBER_IMPORT_SUMMARY?.render?.({
    targetSelector: "#member-import-summary",
    hidden: rows.length === 0,
    totalCount: rows.length,
    validCount: validRows.length,
    errorCount: errorRows.length,
    newOccupationCount: newOccupations.length
  });
  preview.hidden = rows.length === 0;
  $("#confirm-member-import").disabled = validRows.length === 0;
}

function renderMemberImportTable(rows = state.memberImportRows) {
  window.ROOC_VUE_MEMBER_IMPORT_TABLE?.render?.({
    targetSelector: "#member-import-table",
    rows: buildMemberImportTableRows(rows),
    emptyMessage: "尚未選擇檔案。"
  });
}

function buildMemberImportTableRows(rows = state.memberImportRows) {
  return rows.map((row) => {
    const status = memberImportStatus(row);
    const note = row.importMessage || row.errors.join("、") || (row.newOccupation ? "將建立職業" : "");

    return {
      key: `${row.rowNumber}-${row.member_no || ""}`,
      memberNo: row.member_no,
      roleName: row.role_name,
      occupation: row.occupation || "",
      joinedDc: Boolean(row.joined_dc),
      isActive: Boolean(row.is_active),
      statusLabel: status.label,
      statusClass: status.className,
      note,
      hasError: row.errors.length > 0 || row.importStatus === "failed",
      isDone: row.importStatus === "done"
    };
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

async function prepareGuidePanel() {
  if (!state.appAdminPin || !state.client) return;
  await withBusy($("#panel-guides"), async () => {
    await ensureAppAdminPin();
    await loadGuidePosts();
    if (!state.guideCurrentId) {
      resetGuideForm();
      showGuideListView();
    }
  });
}

function showGuideListView() {
  $("#guide-list-view")?.removeAttribute("hidden");
  $("#guide-list-view")?.classList.add("is-active");
  $("#guide-editor-view")?.setAttribute("hidden", "");
  $("#guide-editor-view")?.classList.remove("is-active");
  refreshIcons();
}

function showGuideEditorView() {
  $("#guide-editor-view")?.removeAttribute("hidden");
  $("#guide-editor-view")?.classList.add("is-active");
  $("#guide-list-view")?.setAttribute("hidden", "");
  $("#guide-list-view")?.classList.remove("is-active");
  refreshIcons();
}

async function handleGuideSearch(event) {
  event.preventDefault();
  clearGuideSearchTimer();
  await withBusy($("#guide-search-form"), async () => {
    await ensureAppAdminPin();
    await loadGuidePosts();
  });
}

function scheduleGuideSearch(delay = 300) {
  clearGuideSearchTimer();
  guideSearchTimer = window.setTimeout(() => {
    if (!state.appAdminPin) return;

    void withBusy($("#guide-search-form"), async () => {
      await ensureAppAdminPin();
      await loadGuidePosts();
    });
  }, delay);
}

function clearGuideSearchTimer() {
  if (guideSearchTimer) {
    window.clearTimeout(guideSearchTimer);
    guideSearchTimer = null;
  }
}

async function handleRefreshGuides() {
  await withBusy($("#panel-guides"), async () => {
    await ensureAppAdminPin();
    await loadGuidePosts();
    showToast("攻略已刷新。", "success");
  });
}

async function cleanupUnusedGuideImages() {
  await ensureAppAdminPin();
  const rows = await rpc("list_unused_guide_images", {
    p_app_admin_pin: state.appAdminPin
  });
  return removeGuideImagesFromStorage(rows?.map((row) => row.object_path) || []);
}

async function loadGuidePosts() {
  const loadSeq = ++guideLoadSeq;
  const form = $("#guide-search-form");
  const data = new FormData(form);
  const rows = await rpc("list_guide_posts_admin", {
    p_app_admin_pin: state.appAdminPin,
    p_query: data.get("query"),
    p_status: data.get("status")
  });
  if (loadSeq !== guideLoadSeq) return;

  state.guidePosts = rows || [];
  state.guidesLoaded = true;
  if (state.guideCurrentId && !state.guidePosts.some((post) => post.id === state.guideCurrentId)) {
    state.guideCurrentId = "";
    resetGuideForm();
    showGuideListView();
  }
  renderGuideList();
  setText("#guide-status", `${state.guidePosts.length} 篇`);
}

function renderGuideList() {
  const list = $("#guide-post-list");
  if (!list) return;

  if (!state.guidesLoaded) {
    list.innerHTML = "";
    return;
  }

  if (state.guidePosts.length === 0) {
    list.innerHTML = `<div class="guide-list-empty">尚未建立攻略。</div>`;
    return;
  }

  list.innerHTML = state.guidePosts.map((post) => {
    const isActive = post.id === state.guideCurrentId;
    const statusText = post.status === "published" ? "已發布" : "草稿";
    const summary = post.summary || guidePlainText(post.content).slice(0, 86);
    return `
      <button class="guide-list-item${isActive ? " is-active" : ""}" type="button" data-guide-id="${escapeHtml(post.id)}">
        <span class="guide-list-meta">
          <span class="guide-category">${escapeHtml(post.category || "一般")}</span>
          <span class="guide-status ${post.status === "published" ? "is-published" : "is-draft"}">${statusText}</span>
          ${post.is_pinned ? '<span class="guide-pin">置頂</span>' : ""}
        </span>
        <strong>${escapeHtml(post.title)}</strong>
        <span>${escapeHtml(summary || "沒有摘要。")}</span>
        <small>${escapeHtml(formatGuideAdminListTime(post))}</small>
      </button>
    `;
  }).join("");
}

function formatGuideAdminListTime(post) {
  if (post?.updated_at) return `更新：${formatDate(post.updated_at)}`;
  if (post?.created_at) return `建立：${formatDate(post.created_at)}`;
  return "尚無時間";
}

function handleGuideListClick(event) {
  const button = event.target.closest("[data-guide-id]");
  if (!button) return;
  selectGuidePost(button.dataset.guideId);
}

function selectGuidePost(id) {
  const post = state.guidePosts.find((item) => item.id === id);
  if (!post) {
    showToast("找不到這篇攻略。", "error");
    return;
  }

  state.guideCurrentId = post.id;
  const form = $("#guide-post-form");
  form.elements.id.value = post.id || "";
  form.elements.title.value = post.title || "";
  form.elements.category.value = post.category || "一般";
  form.elements.status.value = post.status || "draft";
  form.elements.is_pinned.checked = Boolean(post.is_pinned);
  form.elements.summary.value = post.summary || "";
  form.elements.content.value = guideContentToMarkdown(post.content);
  $("#delete-guide-post").disabled = false;
  setText("#guide-editor-title", "編輯攻略");
  renderGuideList();
  renderGuidePreview();
  showGuideEditorView();
  refreshIcons();
}

function resetGuideForm(options = {}) {
  state.guideCurrentId = "";
  const form = $("#guide-post-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.category.value = "一般";
  form.elements.status.value = "draft";
  form.elements.content.value = "";
  $("#delete-guide-post").disabled = true;
  setText("#guide-editor-title", "新增攻略");
  renderGuideList();
  renderGuidePreview();

  if (options.showEditor) {
    showGuideEditorView();
  }

  if (options.focus) {
    form.elements.title.focus();
  }
}

function applyGuideCategoryPreset(category) {
  const input = $("#guide-post-form")?.elements?.category;
  if (!input) return;
  input.value = category || "一般";
  input.focus();
}

async function handleGuideSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const oldPost = data.get("id")
    ? state.guidePosts.find((item) => item.id === data.get("id"))
    : null;
  const nextContent = String(data.get("content") || "");

  await withBusy(form, async () => {
    await ensureAppAdminPin();
    const title = cleanRequired(data.get("title"), "請輸入攻略標題。");
    const rows = await rpc("upsert_guide_post", {
      p_app_admin_pin: state.appAdminPin,
      p_id: data.get("id") || null,
      p_title: title,
      p_slug: null,
      p_category: data.get("category"),
      p_summary: data.get("summary"),
      p_content: nextContent,
      p_status: data.get("status"),
      p_is_pinned: data.get("is_pinned") === "on"
    });
    const saved = rows?.[0];
    if (!saved) throw new Error("攻略儲存失敗。");

    state.guideCurrentId = saved.id;
    await loadGuidePosts();
    await cleanupGuideImagesAfterSave(oldPost?.content || "", nextContent)
      .catch((error) => showToast(`攻略已儲存，但圖片清理失敗：${friendlyError(error.message)}`, "warning"));
    showGuideListView();
    showToast(saved.status === "published" ? "攻略已發布。" : "攻略草稿已儲存。", "success");
  });
}

async function handleGuideDelete() {
  const id = $("#guide-post-form").elements.id.value;
  if (!id) {
    showToast("請先選擇攻略。", "error");
    return;
  }

  const post = state.guidePosts.find((item) => item.id === id);
  const confirmed = await requestConfirmDialog({
    title: "刪除攻略",
    message: `確定刪除「${post?.title || "這篇攻略"}」？`,
    confirmLabel: "刪除攻略",
    confirmIcon: "trash-2",
    confirmKind: "danger"
  });
  if (!confirmed) return;
  const imagePaths = extractGuideImagePaths(post?.content || "");

  await withBusy($("#guide-editor-card") || $("#panel-guides"), async () => {
    await ensureAppAdminPin();
    await rpc("delete_guide_post", {
      p_app_admin_pin: state.appAdminPin,
      p_id: id
    });
    await cleanupGuideImagesAfterDelete(imagePaths)
      .catch((error) => showToast(`攻略已刪除，但圖片清理失敗：${friendlyError(error.message)}`, "warning"));
    resetGuideForm();
    await loadGuidePosts();
    showGuideListView();
    showToast("攻略已刪除。", "success");
  });
}

function handleGuideMarkdownToolbarClick(event) {
  const button = event.target.closest("[data-guide-md-action]");
  if (!button) return;

  const textarea = $("#guide-content-editor");
  if (!textarea) return;

  const result = applyGuideTextFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, button.dataset.guideMdAction);
  textarea.value = result.value;
  textarea.focus();
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  renderGuidePreview();
}

async function handleGuideMarkdownImageUpload(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;

  await withBusy($("#guide-editor-card") || $("#panel-guides"), async () => {
    const image = await uploadGuideImageFile(file);
    insertGuideMarkdown(`![${image.alt}](${image.url})`);
  });
  input.value = "";
}

async function uploadGuideImageFile(file) {
  if (!GUIDE_IMAGE_TYPES.has(file.type)) {
    throw new Error("圖片格式只支援 JPG、PNG、WEBP 或 GIF。");
  }
  if (file.size > GUIDE_IMAGE_MAX_SIZE) {
    throw new Error("圖片大小不能超過 5MB。");
  }

  await ensureAppAdminPin();
  const rows = await rpc("create_guide_image_upload_path", {
    p_app_admin_pin: state.appAdminPin,
    p_file_name: file.name,
    p_content_type: file.type
  });
  const uploadInfo = rows?.[0];
  const bucketName = uploadInfo?.bucket_name || GUIDE_IMAGE_BUCKET;
  if (!bucketName || !uploadInfo?.object_path) {
    throw new Error("圖片上傳路徑建立失敗。");
  }

  const { error: uploadError } = await requireClient()
    .storage
    .from(bucketName)
    .upload(uploadInfo.object_path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = requireClient()
    .storage
    .from(bucketName)
    .getPublicUrl(uploadInfo.object_path);

  showToast("圖片已上傳並加入攻略。", "success");
  return {
    url: data?.publicUrl || "",
    alt: file.name.replace(/\.[^.]+$/, "")
  };
}

async function cleanupRemovedGuideImages(previousContent, nextContent) {
  const previous = new Set(extractGuideImagePaths(previousContent));
  const next = new Set(extractGuideImagePaths(nextContent));
  const removed = [...previous].filter((path) => !next.has(path));
  await deleteGuideImages(removed);
}

async function cleanupGuideImagesAfterSave(previousContent, nextContent) {
  await cleanupRemovedGuideImages(previousContent, nextContent);
  await cleanupUnusedGuideImages();
}

async function cleanupGuideImagesAfterDelete(paths) {
  await deleteGuideImages(paths);
  await cleanupUnusedGuideImages();
}

async function deleteGuideImages(paths) {
  const uniquePaths = [...new Set(paths || [])].filter(Boolean);
  if (uniquePaths.length === 0) return 0;

  await ensureAppAdminPin();
  const rows = await rpc("create_guide_image_delete_paths", {
    p_app_admin_pin: state.appAdminPin,
    p_object_paths: uniquePaths
  });
  return removeGuideImagesFromStorage(rows?.map((row) => row.object_path) || []);
}

async function removeGuideImagesFromStorage(paths) {
  const uniquePaths = [...new Set(paths || [])].filter(Boolean);
  if (uniquePaths.length === 0) return 0;

  const { error } = await requireClient()
    .storage
    .from(GUIDE_IMAGE_BUCKET)
    .remove(uniquePaths);
  if (error) throw new Error(error.message);
  await ensureAppAdminPin();
  await rpc("finalize_guide_image_deletes", {
    p_app_admin_pin: state.appAdminPin,
    p_object_paths: uniquePaths
  });
  return uniquePaths.length;
}

function extractGuideImagePaths(content) {
  const markdown = guideContentToMarkdown(content);
  const paths = [];
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)\)/g;
  let match = imagePattern.exec(markdown);
  while (match) {
    const path = guideImageUrlToObjectPath(match[1]);
    if (path) paths.push(path);
    match = imagePattern.exec(markdown);
  }
  return [...new Set(paths)];
}

function guideImageUrlToObjectPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const publicMarker = `/storage/v1/object/public/${GUIDE_IMAGE_BUCKET}/`;
  const encodedMarker = `/storage/v1/object/public/${encodeURIComponent(GUIDE_IMAGE_BUCKET)}/`;
  const markerIndex = raw.indexOf(publicMarker);
  const encodedMarkerIndex = raw.indexOf(encodedMarker);
  const objectPath = markerIndex >= 0
    ? raw.slice(markerIndex + publicMarker.length)
    : encodedMarkerIndex >= 0
      ? raw.slice(encodedMarkerIndex + encodedMarker.length)
      : raw.startsWith("guides/")
        ? raw
        : "";
  if (!objectPath || !objectPath.startsWith("guides/")) return "";

  try {
    return decodeURIComponent(objectPath.split(/[?#]/)[0]);
  } catch {
    return objectPath.split(/[?#]/)[0];
  }
}

function insertGuideMarkdown(markdown) {
  const textarea = $("#guide-content-editor");
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const spacerBefore = start > 0 && !textarea.value.slice(0, start).endsWith("\n") ? "\n\n" : "";
  const spacerAfter = end < textarea.value.length && !textarea.value.slice(end).startsWith("\n") ? "\n\n" : "";
  const insertion = `${spacerBefore}${markdown}${spacerAfter}`;
  textarea.value = `${textarea.value.slice(0, start)}${insertion}${textarea.value.slice(end)}`;
  const cursor = start + insertion.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  renderGuidePreview();
}

function applyGuideTextFormat(value, selectionStart, selectionEnd, format) {
  if (format === "h2") {
    return applyGuideLinePrefix(value, selectionStart, selectionEnd, "## ", "小標題");
  }
  if (format === "h3") {
    return applyGuideLinePrefix(value, selectionStart, selectionEnd, "### ", "段落標題");
  }
  if (format === "list") {
    return applyGuideLinePrefix(value, selectionStart, selectionEnd, "- ", "清單項目");
  }
  if (format === "quote") {
    return applyGuideLinePrefix(value, selectionStart, selectionEnd, "> ", "引用內容");
  }
  if (format === "code") {
    return applyGuideWrapFormat(value, selectionStart, selectionEnd, "`", "`", "指令");
  }
  if (format === "italic") {
    return applyGuideWrapFormat(value, selectionStart, selectionEnd, "*", "*", "斜體");
  }
  if (format === "link") {
    return applyGuideLinkFormat(value, selectionStart, selectionEnd);
  }
  if (format === "image-link") {
    return applyGuideImageLinkFormat(value, selectionStart, selectionEnd);
  }
  return applyGuideWrapFormat(value, selectionStart, selectionEnd, "**", "**", "重點");
}

function applyGuideWrapFormat(value, selectionStart, selectionEnd, prefix, suffix, fallback) {
  const selected = value.slice(selectionStart, selectionEnd) || fallback;
  const replacement = `${prefix}${selected}${suffix}`;
  return {
    value: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + prefix.length,
    selectionEnd: selectionStart + prefix.length + selected.length
  };
}

function applyGuideLinePrefix(value, selectionStart, selectionEnd, prefix, fallback) {
  if (selectionStart === selectionEnd) {
    const insertion = `${prefix}${fallback}`;
    return {
      value: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`,
      selectionStart: selectionStart + prefix.length,
      selectionEnd: selectionStart + insertion.length
    };
  }

  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);
  const replacement = selected
    .split("\n")
    .map((line) => line.startsWith(prefix) ? line : `${prefix}${line}`)
    .join("\n");
  return {
    value: `${before}${replacement}${after}`,
    selectionStart,
    selectionEnd: selectionStart + replacement.length
  };
}

function applyGuideLinkFormat(value, selectionStart, selectionEnd) {
  const selected = value.slice(selectionStart, selectionEnd) || "連結文字";
  const replacement = `[${selected}](https://)`;
  return {
    value: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + 1,
    selectionEnd: selectionStart + 1 + selected.length
  };
}

function applyGuideImageLinkFormat(value, selectionStart, selectionEnd) {
  const selected = value.slice(selectionStart, selectionEnd).trim();
  const isSelectedUrl = /^https?:\/\//i.test(selected);
  const alt = isSelectedUrl ? "圖片說明" : selected || "圖片說明";
  const url = isSelectedUrl ? selected : "https://";
  const replacement = `![${alt}](${url})`;
  const urlStart = selectionStart + replacement.indexOf("(") + 1;
  return {
    value: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length
  };
}

function renderGuidePreview() {
  const form = $("#guide-post-form");
  const title = form?.elements?.title?.value || "";
  const summary = form?.elements?.summary?.value || "";
  const content = form?.elements?.content?.value || "";
  const preview = $("#guide-preview");
  if (!preview) return;

  const contentHtml = renderGuideMarkdown(content);
  const fallback = title || summary || contentHtml
    ? ""
    : "<p class=\"guide-muted\">開始輸入內容後會顯示預覽。</p>";
  preview.innerHTML = [
    title ? `<h1>${escapeHtml(title)}</h1>` : "",
    summary ? `<p class="guide-summary-text">${escapeHtml(summary)}</p>` : "",
    contentHtml || fallback
  ].join("");
  syncGuidePreviewToEditor();
}

function bindGuideScrollSync() {
  const editor = $("#guide-content-editor");
  const preview = $("#guide-preview");
  if (!editor || !preview) return;

  editor.addEventListener("scroll", () => syncGuideScroll(editor, preview));
  preview.addEventListener("scroll", () => syncGuideScroll(preview, editor));
}

function syncGuidePreviewToEditor() {
  const editor = $("#guide-content-editor");
  const preview = $("#guide-preview");
  syncGuideScroll(editor, preview);
}

function syncGuideScroll(source, target) {
  if (guideScrollSyncLock || !source || !target) return;

  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;
  if (sourceMax <= 0 || targetMax <= 0) return;

  const nextTop = (source.scrollTop / sourceMax) * targetMax;
  guideScrollSyncLock = true;
  target.scrollTop = nextTop;
  window.requestAnimationFrame(() => {
    guideScrollSyncLock = false;
  });
}

function renderGuideContent(content) {
  return renderGuideMarkdown(guideContentToMarkdown(content)) || '<p class="guide-muted">這篇攻略目前沒有內容。</p>';
}

function renderGuideImageFigure(src, alt = "攻略圖片", caption = "") {
  const imageAlt = alt || caption || "攻略圖片";
  const dialogCaption = caption || imageAlt;
  return `
    <figure class="guide-figure">
      <button
        class="guide-image-button"
        type="button"
        data-guide-image-src="${escapeHtml(src)}"
        data-guide-image-caption="${escapeHtml(dialogCaption)}"
        aria-label="放大查看圖片：${escapeHtml(imageAlt)}"
      >
        <img src="${escapeHtml(src)}" alt="${escapeHtml(imageAlt)}">
        <span class="guide-image-zoom">點擊放大</span>
      </button>
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
    </figure>
  `;
}

function handleGuideImageClick(event) {
  const button = event.target.closest("[data-guide-image-src]");
  if (!button) return;
  event.preventDefault();
  openGuideImageDialog(button.dataset.guideImageSrc, button.dataset.guideImageCaption);
}

function openGuideImageDialog(src, caption = "") {
  const dialog = $("#guide-image-dialog");
  const image = $("#guide-image-dialog-img");
  const captionEl = $("#guide-image-dialog-caption");
  const safeSrc = safeGuideImageUrl(src);
  if (!dialog || !image || !safeSrc) return;

  const cleanCaption = String(caption || "").trim();
  image.src = safeSrc;
  image.alt = cleanCaption || "攻略圖片";
  if (captionEl) {
    captionEl.textContent = cleanCaption;
    captionEl.hidden = !cleanCaption;
  }
  setGuideImageZoom(100);
  showModalDialog(dialog);
  refreshIcons();
}

function closeGuideImageDialog() {
  const dialog = $("#guide-image-dialog");
  const image = $("#guide-image-dialog-img");
  closeModalDialog(dialog);
  if (image) {
    image.removeAttribute("src");
    image.removeAttribute("style");
  }
}

function bindGuideImagePan() {
  const viewport = $("#guide-image-viewport");
  if (!viewport) return;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (guideImageViewState.zoom <= 100) return;
    event.preventDefault();
    guideImageViewState.dragging = true;
    guideImageViewState.startX = event.clientX;
    guideImageViewState.startY = event.clientY;
    guideImageViewState.originX = guideImageViewState.x;
    guideImageViewState.originY = guideImageViewState.y;
    viewport.classList.add("is-dragging");
    try {
      viewport.setPointerCapture?.(event.pointerId);
    } catch {
      // Some browsers can reject capture when the pointer has already ended.
    }
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!guideImageViewState.dragging) return;
    event.preventDefault();
    guideImageViewState.x = guideImageViewState.originX + event.clientX - guideImageViewState.startX;
    guideImageViewState.y = guideImageViewState.originY + event.clientY - guideImageViewState.startY;
    applyGuideImageTransform();
  });

  const stopDragging = (event) => {
    guideImageViewState.dragging = false;
    viewport.classList.remove("is-dragging");
    try {
      viewport.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore stale pointer captures.
    }
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
}

function stepGuideImageZoom(delta) {
  const range = $("#guide-image-zoom-range");
  const current = Number(range?.value || 100);
  setGuideImageZoom(current + delta);
}

function setGuideImageZoom(value) {
  const range = $("#guide-image-zoom-range");
  const output = $("#guide-image-zoom-value");
  const zoom = Math.max(50, Math.min(300, Number(value) || 100));
  guideImageViewState.zoom = zoom;
  if (zoom <= 100) {
    guideImageViewState.x = 0;
    guideImageViewState.y = 0;
  }
  if (range) range.value = String(zoom);
  if (output) {
    output.value = `${zoom}%`;
    output.textContent = `${zoom}%`;
  }
  applyGuideImageTransform();
}

function applyGuideImageTransform() {
  const image = $("#guide-image-dialog-img");
  const viewport = $("#guide-image-viewport");
  if (!image) return;
  const scale = guideImageViewState.zoom / 100;
  image.style.transform = `translate(${guideImageViewState.x}px, ${guideImageViewState.y}px) scale(${scale})`;
  if (image) {
    image.style.cursor = guideImageViewState.zoom > 100 ? "grab" : "default";
  }
  if (viewport) {
    viewport.classList.toggle("is-zoomed", guideImageViewState.zoom > 100);
  }
}

function renderGuideMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listItems = [];
  let paragraph = [];
  let codeBlock = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${paragraph.map(renderGuideInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.map((item) => `<li>${renderGuideInline(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };
  const flushCodeBlock = () => {
    if (!codeBlock) return;
    html.push(renderGuideCodeBlock(codeBlock.lines, codeBlock.language));
    codeBlock = null;
  };

  lines.forEach((line) => {
    const text = line.trim();
    if (codeBlock) {
      if (/^```\s*$/.test(text)) {
        flushCodeBlock();
        return;
      }
      codeBlock.lines.push(line);
      return;
    }

    const codeFence = text.match(/^```\s*([A-Za-z0-9_+.#-]*!?)?\s*$/);
    if (codeFence) {
      flushParagraph();
      flushList();
      codeBlock = {
        language: String(codeFence[1] || "").replace(/!$/, ""),
        lines: []
      };
      return;
    }

    if (!text) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = text.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${renderGuideInline(heading[2])}</h${level}>`);
      return;
    }

    const quote = text.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderGuideInline(quote[1])}</blockquote>`);
      return;
    }

    const image = text.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      const safeUrl = safeGuideImageUrl(image[2]);
      if (safeUrl) {
        html.push(renderGuideImageFigure(safeUrl, image[1] || "攻略圖片"));
      }
      return;
    }

    const bullet = text.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      return;
    }

    flushList();
    paragraph.push(text);
  });

  flushCodeBlock();
  flushParagraph();
  flushList();
  return html.join("");
}

function renderGuideCodeBlock(lines, language = "") {
  const lang = String(language || "").replace(/[^A-Za-z0-9_+.#-]/g, "");
  const langAttr = lang ? ` data-language="${escapeHtml(lang)}"` : "";
  return `<pre class="guide-code-block"${langAttr}><code>${escapeHtml((lines || []).join("\n"))}</code></pre>`;
}

function renderGuideInline(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function guidePlainText(value) {
  return guideContentToMarkdown(value)
    .replace(/[#*_`>-]/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function guideContentToMarkdown(content) {
  const raw = String(content || "").trim();
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed) ? parsed : parsed?.blocks;
    if (Array.isArray(blocks)) {
      return blocks.map(guideBlockToMarkdown).filter(Boolean).join("\n\n");
    }
  } catch {
    // Current editor stores plain Markdown; invalid JSON is simply Markdown text.
  }

  return raw;
}

function guideBlockToMarkdown(block = {}) {
  if (block.type === "image" && block.url) {
    return `![${block.alt || block.caption || "攻略圖片"}](${block.url})`;
  }
  if (block.type === "callout") {
    return [block.title ? `> **${block.title}**` : "", block.text ? String(block.text).split("\n").map((line) => `> ${line}`).join("\n") : ""].filter(Boolean).join("\n");
  }
  return String(block.text || "").trim();
}

function safeGuideImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(https?:)?\/\//i.test(url)) return url;
  if (/^(?:\/|\.{1,2}\/|assets\/|images\/)[^\s<>"']+$/i.test(url)) return url;
  return "";
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
  const rows = sortDrawRows(event.recent_draws);
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
  if (text.includes("guide_posts") || text.includes("guide_image_upload_paths") || text.includes("guide_image_delete_paths") || text.includes("list_guide_posts_admin") || text.includes("upsert_guide_post") || text.includes("delete_guide_post") || text.includes("create_guide_image_upload_path") || text.includes("create_guide_image_delete_paths") || text.includes("list_unused_guide_images") || text.includes("finalize_guide_image_deletes")) return "攻略資料庫尚未更新，請先套用最新 schema。";
  if (text.includes("Bucket not found") || text.includes("bucket not found") || text.includes("rooc-guide-images")) return "攻略圖片儲存空間尚未建立，請先套用最新 schema。";
  if (text.includes("violates row-level security policy") && text.includes("storage.objects")) return "攻略圖片儲存權限尚未開通，請先套用最新 schema。";
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

  window.ROOC_VUE_CONFIRM_DIALOG?.render?.({
    targetSelector: "#confirm-dialog-content",
    title: options.title || "確認操作",
    message: options.message || "確定要繼續嗎？",
    confirmLabel: options.confirmLabel || "確認",
    confirmKind: options.confirmKind || "danger",
    confirmIcon: options.confirmIcon || "check",
    onAccept: () => closeConfirmDialog(true),
    onCancel: () => closeConfirmDialog(false),
    onRendered: () => window.setTimeout(() => document.querySelector("#confirm-dialog-content [data-confirm-cancel]")?.focus(), 0)
  });
  showModalDialog($("#confirm-dialog"));
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
  return window.ROOC_VUE_TOASTS?.show?.(message, type, options) || null;
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

function dismissToast(toast) {
  window.ROOC_VUE_TOASTS?.dismiss?.(toast);
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

function formatEventTitleDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
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
