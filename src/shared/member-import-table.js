import { createApp, h, reactive } from "vue";
import MemberImportRows from "../components/admin/MemberImportRows.vue";

const mountedTables = new Map();

function resolveTarget(targetSelector = "#member-import-table") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedTables.get(target);
  if (existing) {
    existing.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(MemberImportRows, {
        rows: store.payload.rows,
        emptyMessage: store.payload.emptyMessage
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue member import table failed:", error);
  };
  app.mount(target);
  mountedTables.set(target, { app, store });
  return true;
}

window.ROOC_VUE_MEMBER_IMPORT_TABLE = {
  render
};
