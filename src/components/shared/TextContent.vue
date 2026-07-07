<script setup>
defineProps({
  text: {
    type: [String, Number],
    default: ""
  }
});
</script>

<template>
  {{ text }}
</template>
