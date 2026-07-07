import { createApp, h, reactive } from "vue";
import MemberRows from "../components/admin/MemberRows.vue";

const mountedTables = new Map();

function resolveTarget(targetSelector = "#member-table") {
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
      return h(MemberRows, {
        rows: store.payload.rows,
        emptyMessage: store.payload.emptyMessage,
        onEdit: store.payload.onEdit,
        onToggle: store.payload.onToggle
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue member table failed:", error);
  };
  app.mount(target);
  mountedTables.set(target, { app, store });
  return true;
}

window.ROOC_VUE_MEMBER_TABLE = {
  render
};
