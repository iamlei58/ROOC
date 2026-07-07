import { createApp, h, reactive } from "vue";
import PublicTableRows from "../components/public/PublicTableRows.vue";

const mountedTables = new Map();

function resolveTarget(targetSelector) {
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
      return h(PublicTableRows, {
        kind: store.payload.kind,
        rows: store.payload.rows,
        emptyMessage: store.payload.emptyMessage,
        footerMessage: store.payload.footerMessage,
        colspan: store.payload.colspan
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue public table failed:", error);
  };
  app.mount(target);
  mountedTables.set(target, { app, store });
  return true;
}

window.ROOC_VUE_PUBLIC_TABLES = {
  render
};
