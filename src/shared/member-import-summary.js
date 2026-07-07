import { createApp, h, reactive } from "vue";
import MemberImportSummary from "../components/admin/MemberImportSummary.vue";

let mountedSummary = null;

function resolveTarget(targetSelector = "#member-import-summary") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  target.hidden = Boolean(payload.hidden);

  if (mountedSummary) {
    mountedSummary.store.payload = payload;
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(MemberImportSummary, {
        totalCount: store.payload.totalCount,
        validCount: store.payload.validCount,
        errorCount: store.payload.errorCount,
        newOccupationCount: store.payload.newOccupationCount
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue member import summary failed:", error);
  };
  app.mount(target);
  mountedSummary = { app, store };
  return true;
}

window.ROOC_VUE_MEMBER_IMPORT_SUMMARY = {
  render
};
