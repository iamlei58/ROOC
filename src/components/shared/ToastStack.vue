<script setup>
const props = defineProps({
  toasts: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["dismiss"]);

function toastIcon(type) {
  if (type === "success") return "circle-check";
  if (type === "error") return "circle-alert";
  if (type === "warning") return "triangle-alert";
  return "info";
}

function runAction(toast, action) {
  action.onClick?.(toast);
}
</script>

<template>
  <article
    v-for="toast in props.toasts"
    :key="toast.id"
    class="toast"
    :class="{ 'is-dismissing': toast.dismissed }"
    :data-type="toast.type"
    :role="toast.type === 'error' ? 'alert' : 'status'"
  >
    <span
      class="toast-icon"
      aria-hidden="true"
    >
      <svg
        v-if="toastIcon(toast.type) === 'circle-check'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
        />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <svg
        v-else-if="toastIcon(toast.type) === 'circle-alert'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
        />
        <line
          x1="12"
          x2="12"
          y1="8"
          y2="12"
        />
        <line
          x1="12"
          x2="12.01"
          y1="16"
          y2="16"
        />
      </svg>
      <svg
        v-else-if="toastIcon(toast.type) === 'triangle-alert'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
        />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    </span>
    <div class="toast-content">{{ toast.message }}</div>
    <div
      v-if="toast.actions?.length"
      class="toast-actions"
    >
      <button
        v-for="action in toast.actions"
        :key="action.label"
        class="toast-action"
        :class="action.kind || 'secondary'"
        type="button"
        @click="runAction(toast, action)"
      >
        {{ action.label }}
      </button>
    </div>
    <button
      class="toast-dismiss"
      type="button"
      aria-label="關閉提示"
      @click="emit('dismiss', toast)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  </article>
</template>
