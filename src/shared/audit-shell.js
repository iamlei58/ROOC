import { createApp, h, reactive } from "vue";
import AuditDialogShell from "../components/public/AuditDialogShell.vue";

let mountedShell = null;

function resolveTarget(targetSelector = "#audit-dialog .modal-shell") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  if (mountedShell) {
    mountedShell.store.payload = payload;
    mountedShell.store.version += 1;
    return true;
  }

  const store = reactive({ payload, version: 0 });
  const app = createApp({
    render() {
      return h(AuditDialogShell, {
        key: store.version,
        title: store.payload.title,
        draw: store.payload.draw,
        verification: store.payload.verification,
        hasFullSnapshot: store.payload.hasFullSnapshot,
        helpers: store.payload.helpers,
        onClose: () => store.payload.onClose?.()
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue audit shell failed:", error);
  };
  app.mount(target);
  mountedShell = { app, store };
  return true;
}

window.ROOC_VUE_AUDIT_SHELL = {
  render
};
