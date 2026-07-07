import { createApp, h, reactive } from "vue";
import EnvironmentSwitcher from "../components/environment/EnvironmentSwitcher.vue";

const mountedSwitchers = new Map();

function resolveRoot(options = {}) {
  return document.querySelector(options.rootSelector || "#environment-switcher");
}

function mount(environmentState, options = {}) {
  const root = resolveRoot(options);
  if (!root) return false;

  const rootSelector = options.rootSelector || "#environment-switcher";
  const existing = mountedSwitchers.get(root);

  if (existing) {
    existing.store.state = environmentState;
    existing.store.rootSelector = rootSelector;
    return true;
  }

  const store = reactive({
    state: environmentState,
    rootSelector
  });

  const app = createApp({
    render() {
      return h(EnvironmentSwitcher, {
        state: store.state,
        rootSelector: store.rootSelector,
        onChange: handleEnvironmentChange
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue environment switcher failed:", error);
  };
  app.mount(root);
  mountedSwitchers.set(root, { app, store });
  return true;
}

function handleEnvironmentChange(environmentId) {
  window.ROOC_CONFIG?.navigateToEnvironment?.(environmentId);
}

window.ROOC_VUE_ENVIRONMENT_SWITCHER = {
  mount
};

window.addEventListener("rooc:environment-switcher", (event) => {
  mount(event.detail?.environmentState, event.detail?.options);
});

window.addEventListener("rooc:vue-ready", () => {
  const pending = window.ROOC_ENVIRONMENT_SWITCHER_STATE;
  if (pending?.environmentState) {
    mount(pending.environmentState, pending.options);
  }
});
