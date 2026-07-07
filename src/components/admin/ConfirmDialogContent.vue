<script setup>
defineProps({
  title: {
    type: String,
    default: "確認操作"
  },
  message: {
    type: String,
    default: "確定要繼續嗎？"
  },
  confirmLabel: {
    type: String,
    default: "確認"
  },
  confirmKind: {
    type: String,
    default: "danger"
  },
  confirmIcon: {
    type: String,
    default: "check"
  },
  onAccept: {
    type: Function,
    default: null
  },
  onCancel: {
    type: Function,
    default: null
  }
});
</script>

<template>
  <div class="modal-head">
    <div>
      <p class="section-label">確認</p>
      <h3>{{ title }}</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      aria-label="關閉確認視窗"
      @click="onCancel?.()"
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
  </div>

  <div class="confirm-body">
    <div
      class="confirm-icon"
      aria-hidden="true"
    >
      <svg
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
    </div>
    <p>{{ message }}</p>
  </div>

  <div class="button-row confirm-actions">
    <button
      class="btn secondary"
      type="button"
      data-confirm-cancel
      @click="onCancel?.()"
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
      <span>取消</span>
    </button>
    <button
      class="btn"
      :class="confirmKind"
      type="button"
      @click="onAccept?.()"
    >
      <svg
        v-if="confirmIcon === 'trash-2'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6 18.2 19.2A2 2 0 0 1 16.21 21H7.79A2 2 0 0 1 5.8 19.2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span>{{ confirmLabel }}</span>
    </button>
  </div>
</template>
