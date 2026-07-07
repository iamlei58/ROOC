import { createApp, h, nextTick, reactive } from "vue";
import AdminStatsGrid from "../components/admin/AdminStatsGrid.vue";

const mountedStats = new Map();

function resolveTarget(targetSelector) {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedStats.get(target);
  if (existing) {
    existing.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(AdminStatsGrid, {
        stats: store.payload.stats
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue admin stats failed:", error);
  };
  app.mount(target);
  mountedStats.set(target, { app, store });
  nextTick(() => payload.onRendered?.());
  return true;
}

window.ROOC_VUE_ADMIN_STATS = {
  render
};
