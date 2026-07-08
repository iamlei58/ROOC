import { createApp, h, nextTick, reactive } from "vue";
import AdminTabs from "../components/admin/AdminTabs.vue";

let mountedTabs = null;

function resolveTarget(targetSelector = "#admin-tabs") {
  return document.querySelector(targetSelector);
}

function defaultTabs() {
  return [
    { key: "console", label: "抽獎控制台", icon: "sparkles" },
    { key: "history", label: "歷史紀錄", icon: "history" },
    { key: "guides", label: "攻略", icon: "book-open" },
    { key: "members", label: "公會成員", icon: "users" }
  ];
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  if (mountedTabs) {
    mountedTabs.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(AdminTabs, {
        tabs: store.payload.tabs || defaultTabs(),
        activeTab: store.payload.activeTab || "console",
        onSelect: (tabName) => store.payload.onSelect?.(tabName)
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue admin tabs failed:", error);
  };
  app.mount(target);
  mountedTabs = { app, store };
  nextTick(() => payload.onRendered?.());
  return true;
}

function setActive(activeTab) {
  if (!mountedTabs) return false;
  mountedTabs.store.payload = {
    ...mountedTabs.store.payload,
    activeTab
  };
  nextTick(() => mountedTabs.store.payload.onRendered?.());
  return true;
}

window.ROOC_VUE_ADMIN_TABS = {
  render,
  setActive
};
