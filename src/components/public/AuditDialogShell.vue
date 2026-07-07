<script setup>
import AuditDialogContent from "./AuditDialogContent.vue";

defineProps({
  title: {
    type: String,
    default: "抽獎驗證"
  },
  draw: {
    type: Object,
    default: () => ({})
  },
  verification: {
    type: Object,
    default: () => ({ status: "checking" })
  },
  hasFullSnapshot: {
    type: Boolean,
    default: false
  },
  helpers: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(["close"]);
</script>

<template>
  <div class="modal-head">
    <div>
      <p class="section-label">Verify</p>
      <h3 id="audit-title">{{ title }}</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-audit-dialog"
      aria-label="關閉驗證視窗"
      @click="emit('close')"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <div class="audit-content" id="audit-content">
    <AuditDialogContent
      :draw="draw"
      :verification="verification"
      :has-full-snapshot="hasFullSnapshot"
      :helpers="helpers"
    />
  </div>
</template>
