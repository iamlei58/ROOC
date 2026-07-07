import { createApp, h, reactive } from "vue";
import ConnectionPill from "../components/shared/ConnectionPill.vue";

let mountedPill = null;

function resolveTarget(targetSelector = "#connection-pill") {
  return document.querySelector(targetSelector);
}

function syncClasses(target, payload = {}) {
  target.classList.toggle("is-connected", Boolean(payload.connected));
  target.classList.toggle("is-test-environment", Boolean(payload.connected && payload.isTestEnvironment));
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  syncClasses(target, payload);

  if (mountedPill) {
    mountedPill.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(ConnectionPill, {
        text: store.payload.text || "尚未連線"
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue connection pill failed:", error);
  };
  app.mount(target);
  mountedPill = { app, store };
  return true;
}

window.ROOC_VUE_CONNECTION_PILL = {
  render
};
