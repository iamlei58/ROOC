<script setup>
defineProps({
  text: {
    type: String,
    default: "尚未連線"
  }
});
</script>

<template>
  <span class="dot"></span>
  <span id="connection-text">{{ text }}</span>
</template>
