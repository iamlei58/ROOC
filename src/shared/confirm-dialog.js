import { createApp, h, nextTick, reactive } from "vue";
import ConfirmDialogContent from "../components/admin/ConfirmDialogContent.vue";

let mountedContent = null;

function resolveTarget(targetSelector = "#confirm-dialog-content") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  if (mountedContent) {
    mountedContent.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(ConfirmDialogContent, {
        title: store.payload.title,
        message: store.payload.message,
        confirmLabel: store.payload.confirmLabel,
        confirmKind: store.payload.confirmKind,
        confirmIcon: store.payload.confirmIcon,
        onAccept: store.payload.onAccept,
        onCancel: store.payload.onCancel
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue confirm dialog failed:", error);
  };
  app.mount(target);
  mountedContent = { app, store };
  nextTick(() => payload.onRendered?.());
  return true;
}

window.ROOC_VUE_CONFIRM_DIALOG = {
  render
};
