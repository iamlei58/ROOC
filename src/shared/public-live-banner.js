import { createApp, h, reactive } from "vue";
import PublicLiveBanner from "../components/public/PublicLiveBanner.vue";

let mountedBanner = null;

function resolveTarget(targetSelector = "#public-live-banner") {
  return document.querySelector(targetSelector);
}

function syncTarget(target, live) {
  target.hidden = !live;
  if (live?.status) {
    target.dataset.status = live.status;
  } else {
    delete target.dataset.status;
  }
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  syncTarget(target, payload.live);

  if (mountedBanner) {
    mountedBanner.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(PublicLiveBanner, {
        live: store.payload.live
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue live banner failed:", error);
  };
  app.mount(target);
  mountedBanner = { app, store };
  return true;
}

window.ROOC_VUE_PUBLIC_LIVE_BANNER = {
  render
};
