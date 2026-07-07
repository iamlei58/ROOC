import { createApp, h, nextTick, reactive } from "vue";
import PendingDrawCard from "../components/admin/PendingDrawCard.vue";

let mountedCard = null;

function resolveTarget(targetSelector = "#pending-card") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  target.hidden = Boolean(payload.hidden);

  if (mountedCard) {
    mountedCard.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(PendingDrawCard, {
        rows: store.payload.rows,
        totalCount: store.payload.totalCount,
        visibleCount: store.payload.visibleCount,
        hiddenCount: store.payload.hiddenCount,
        transferOptions: store.payload.transferOptions,
        transferPlaceholder: store.payload.transferPlaceholder,
        transferDisabled: store.payload.transferDisabled,
        onTransferStateChange: () => store.payload.onTransferStateChange?.(),
        onShowMore: () => store.payload.onShowMore?.()
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue pending card failed:", error);
  };
  app.mount(target);
  mountedCard = { app, store };
  nextTick(() => payload.onRendered?.());
  return true;
}

window.ROOC_VUE_PENDING_CARD = {
  render
};
