<script setup>
import { onMounted } from "vue";

const props = defineProps({
  page: {
    type: String,
    required: true
  }
});

onMounted(() => {
  window.dispatchEvent(new CustomEvent("rooc:vue-ready", {
    detail: {
      page: props.page
    }
  }));
});
</script>

<template>
  <span class="vue-bridge" aria-hidden="true" />
</template>
