import { createApp, h, reactive } from "vue";
import DrawRevealLists from "../components/draw/DrawRevealLists.vue";

const mountedContents = new Map();

function resolveTarget(targetSelector) {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedContents.get(target);
  if (existing) {
    existing.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(DrawRevealLists, {
        resultListId: store.payload.resultListId,
        flipListId: store.payload.flipListId,
        labels: store.payload.labels,
        rows: store.payload.rows,
        placeholderCount: store.payload.placeholderCount,
        prizeName: store.payload.prizeName,
        revealMode: store.payload.revealMode
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue draw reveal failed:", error);
  };
  app.mount(target);
  mountedContents.set(target, { app, store });
  return true;
}

window.ROOC_VUE_DRAW_REVEAL = {
  render
};
