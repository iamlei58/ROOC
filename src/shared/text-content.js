import { createApp, h, reactive } from "vue";
import TextContent from "../components/shared/TextContent.vue";

const mountedTexts = new Map();

function resolveTarget(targetSelector) {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedTexts.get(target);
  if (existing) {
    existing.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(TextContent, {
        text: store.payload.text ?? ""
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue text content failed:", error);
  };
  app.mount(target);
  mountedTexts.set(target, { app, store });
  return true;
}

window.ROOC_VUE_TEXT_CONTENT = {
  render
};
