<script setup>
import RosterDialogContent from "./RosterDialogContent.vue";

defineProps({
  eyebrow: {
    type: String,
    default: "名單"
  },
  title: {
    type: String,
    default: "查看名單"
  },
  closeButtonId: {
    type: String,
    required: true
  },
  closeLabel: {
    type: String,
    default: "關閉名單"
  },
  subtitle: {
    type: String,
    default: ""
  },
  count: {
    type: Number,
    default: 0
  },
  emptyMessage: {
    type: String,
    default: "目前沒有名單資料。"
  },
  items: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["close"]);
</script>

<template>
  <div class="modal-head">
    <div>
      <p class="section-label">{{ eyebrow }}</p>
      <h3>{{ title }}</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      :id="closeButtonId"
      :aria-label="closeLabel"
      @click="emit('close')"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <div class="roster-dialog-content">
    <RosterDialogContent
      :subtitle="subtitle"
      :count="count"
      :empty-message="emptyMessage"
      :items="items"
    />
  </div>
</template>
