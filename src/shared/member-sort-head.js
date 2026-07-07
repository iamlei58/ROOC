import { createApp, h, nextTick, reactive } from "vue";
import MemberTableHead from "../components/admin/MemberTableHead.vue";

let mountedHead = null;

function resolveTarget(targetSelector = "#member-table-head") {
  return document.querySelector(targetSelector);
}

function render(payload = {}) {
  const target = resolveTarget(payload.targetSelector);
  if (!target) return false;

  if (mountedHead) {
    mountedHead.store.payload = payload;
    nextTick(() => payload.onRendered?.());
    return true;
  }

  const store = reactive({ payload });
  const app = createApp({
    render() {
      return h(MemberTableHead, {
        sortKey: store.payload.sortKey,
        direction: store.payload.direction,
        onSort: (key) => store.payload.onSort?.(key)
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue member sort head failed:", error);
  };
  app.mount(target);
  mountedHead = { app, store };
  nextTick(() => payload.onRendered?.());
  return true;
}

window.ROOC_VUE_MEMBER_SORT_HEAD = {
  render
};
