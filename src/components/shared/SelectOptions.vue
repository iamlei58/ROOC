<script setup>
defineProps({
  placeholder: {
    type: String,
    default: "請選擇"
  },
  options: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <option value="">{{ placeholder }}</option>
  <option
    v-for="option in options"
    :key="option.value"
    :value="option.value"
  >
    {{ option.label }}
  </option>
</template>
