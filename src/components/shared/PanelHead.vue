<script setup>
defineProps({
  label: {
    type: String,
    default: ""
  },
  title: {
    type: String,
    required: true
  },
  statusId: {
    type: String,
    default: ""
  },
  statusText: {
    type: String,
    default: "未載入"
  },
  statusInActions: {
    type: Boolean,
    default: false
  }
});
</script>

<template>
  <div>
    <p class="section-label">{{ label }}</p>
    <h2>{{ title }}</h2>
  </div>
  <div v-if="statusInActions" class="panel-actions">
    <span class="status-badge" :id="statusId">{{ statusText }}</span>
  </div>
  <span v-else class="status-badge" :id="statusId">{{ statusText }}</span>
</template>
