import { createApp, h, reactive } from "vue";
import PublicEventHeader from "../components/public/PublicEventHeader.vue";

let mountedHeader = null;

function resolveTarget(targetSelector = "#public-event-header") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  if (mountedHeader) {
    mountedHeader.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(PublicEventHeader, {
        title: store.payload.title,
        status: store.payload.status,
        meta: store.payload.meta
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue public event header failed:", error);
  };
  app.mount(target);
  mountedHeader = { app, store };
  return true;
}

window.ROOC_VUE_PUBLIC_EVENT_HEADER = {
  render
};
