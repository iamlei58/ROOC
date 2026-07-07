import { createApp, h, nextTick, reactive } from "vue";
import PublicStatsGrid from "../components/public/PublicStatsGrid.vue";

let mountedStats = null;

function resolveTarget(targetSelector = "#public-stats-grid") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  if (mountedStats) {
    mountedStats.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(PublicStatsGrid, {
        stats: store.payload.stats
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue public stats failed:", error);
  };
  app.mount(target);
  mountedStats = { app, store };
  nextTick(() => payload.onRendered?.());
  return true;
}

window.ROOC_VUE_PUBLIC_STATS = {
  render
};
