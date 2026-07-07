import { createApp, h, reactive } from "vue";
import ToastStack from "../components/shared/ToastStack.vue";

const toastState = reactive({
  items: []
});

let nextToastId = 1;
let mounted = false;

function resolveTarget() {
  return document.querySelector("#toast-stack");
}

function mount() {
  if (mounted) return true;

  const target = resolveTarget();
  if (!target) return false;

  const app = createApp({
    render() {
      return h(ToastStack, {
        toasts: toastState.items,
        onDismiss: dismiss
      });
    }
  });
  app.config.errorHandler = (error) => {
    console.error("ROOC Vue toast stack failed:", error);
  };
  app.mount(target);
  mounted = true;
  return true;
}

function show(message, type = "info", options = {}) {
  if (!mount()) return null;

  const toast = {
    __roocVueToast: true,
    id: nextToastId,
    message: String(message ?? ""),
    type,
    actions: options.actions || [],
    onDismiss: options.onDismiss,
    dismissed: false
  };
  nextToastId += 1;
  toastState.items.push(toast);

  if (!options.persist) {
    window.setTimeout(() => dismiss(toast), options.duration || 4600);
  }

  return toast;
}

function dismiss(toast) {
  const target = typeof toast === "number"
    ? toastState.items.find((item) => item.id === toast)
    : toast;

  if (!target || target.dismissed) return;

  target.dismissed = true;
  window.setTimeout(() => finishDismiss(target), 240);
}

function finishDismiss(toast) {
  const index = toastState.items.findIndex((item) => item.id === toast.id);
  if (index < 0) return;

  toastState.items.splice(index, 1);
  toast.onDismiss?.();
}

window.ROOC_VUE_TOASTS = {
  mount,
  show,
  dismiss
};

window.addEventListener("rooc:vue-ready", mount);
mount();
