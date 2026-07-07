<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  actions: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <h3>{{ title }}</h3>
  <div
    v-if="actions.length > 0"
    class="button-row table-head-actions"
  >
    <button
      v-for="action in actions"
      :id="action.id"
      :key="action.id"
      :class="action.className || 'btn secondary table-export'"
      type="button"
    >
      <i :data-lucide="action.icon"></i>
      <span>{{ action.label }}</span>
    </button>
  </div>
</template>
