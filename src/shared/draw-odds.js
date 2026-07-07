import { createApp, h, reactive } from "vue";
import DrawOddsCard from "../components/admin/DrawOddsCard.vue";

let mountedCard = null;

function resolveTarget(targetSelector = "#draw-odds-card") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  target.hidden = Boolean(payload.hidden);

  if (mountedCard) {
    mountedCard.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(DrawOddsCard, {
        probability: store.payload.probability,
        formula: store.payload.formula
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue draw odds failed:", error);
  };
  app.mount(target);
  mountedCard = { app, store };
  return true;
}

window.ROOC_VUE_DRAW_ODDS = {
  render
};
