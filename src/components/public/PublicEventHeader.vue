<script setup>
defineProps({
  title: {
    type: String,
    default: "尚未載入"
  },
  status: {
    type: String,
    default: "未載入"
  },
  meta: {
    type: String,
    default: ""
  }
});
</script>

<template>
  <div class="block-head">
    <div>
      <p class="section-label">活動</p>
      <h3>{{ title }}</h3>
    </div>
    <span class="status-badge">{{ status }}</span>
  </div>
  <p class="description">{{ meta }}</p>
</template>
