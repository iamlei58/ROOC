<script setup>
defineProps({
  probability: {
    type: String,
    default: "-"
  },
  formula: {
    type: String,
    default: ""
  }
});
</script>

<template>
  <div>
    <span>本輪機率</span>
    <strong>{{ probability }}</strong>
  </div>
  <p>{{ formula }}</p>
</template>
