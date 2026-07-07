import { createApp, h, reactive } from "vue";
import AdminEventHeader from "../components/admin/AdminEventHeader.vue";

const mountedHeaders = new Map();

function resolveTarget(targetSelector) {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedHeaders.get(target);
  if (existing) {
    existing.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(AdminEventHeader, {
        label: store.payload.label,
        title: store.payload.title,
        status: store.payload.status,
        meta: store.payload.meta
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue admin event header failed:", error);
  };
  app.mount(target);
  mountedHeaders.set(target, { app, store });
  return true;
}

window.ROOC_VUE_ADMIN_EVENT_HEADER = {
  render
};
