import { createApp, h, nextTick, reactive } from "vue";
import RosterDialogShell from "../components/shared/RosterDialogShell.vue";

const mountedShells = new Map();

function resolveTarget(targetSelector) {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedShells.get(target);
  if (existing) {
    existing.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(RosterDialogShell, {
        eyebrow: store.payload.eyebrow,
        title: store.payload.title,
        closeButtonId: store.payload.closeButtonId,
        closeLabel: store.payload.closeLabel,
        subtitle: store.payload.subtitle,
        count: store.payload.count,
        emptyMessage: store.payload.emptyMessage,
        items: store.payload.items,
        onClose: () => store.payload.onClose?.()
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue roster shell failed:", error);
  };
  app.mount(target);
  mountedShells.set(target, { app, store });
  nextTick(() => payload.onRendered?.());
  return true;
}

window.ROOC_VUE_ROSTER_SHELL = {
  render
};
