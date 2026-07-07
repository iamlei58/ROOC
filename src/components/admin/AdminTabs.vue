<script setup>
defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["select"]);
</script>

<template>
  <button
    v-for="tab in tabs"
    :key="tab.key"
    class="tab"
    :class="{ 'is-active': activeTab === tab.key }"
    type="button"
    :data-tab="tab.key"
    :aria-current="activeTab === tab.key ? 'page' : undefined"
    @click="emit('select', tab.key)"
  >
    <i :data-lucide="tab.icon"></i>
    <span>{{ tab.label }}</span>
  </button>
</template>
