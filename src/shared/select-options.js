import { createApp, h, nextTick, reactive } from "vue";
import SelectOptions from "../components/shared/SelectOptions.vue";

const mountedSelects = new Map();

function resolveTarget(targetSelector) {
  return document.querySelector(targetSelector);
}

function syncSelect(target, payload) {
  target.disabled = Boolean(payload.disabled);
  nextTick(() => {
    if (payload.value && Array.from(target.options).some((option) => option.value === payload.value)) {
      target.value = payload.value;
    } else {
      target.value = "";
    }
    payload.onRendered?.(target);
  });
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  const existing = mountedSelects.get(target);
  if (existing) {
    existing.store.payload = payload;
    syncSelect(target, payload);
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(SelectOptions, {
        placeholder: store.payload.placeholder,
        options: store.payload.options
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue select options failed:", error);
  };
  app.mount(target);
  mountedSelects.set(target, { app, store });
  syncSelect(target, payload);
  return true;
}

window.ROOC_VUE_SELECT_OPTIONS = {
  render
};
