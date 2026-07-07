<script setup>
defineProps({
  stats: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <div
    v-for="stat in stats"
    :key="stat.rosterKey"
  >
    <dt>
      <span>{{ stat.label }}</span>
      <button
        class="chip-button"
        type="button"
        :data-public-roster="stat.rosterKey"
      >
        查看名單
      </button>
    </dt>
    <dd>{{ stat.value }}</dd>
  </div>
</template>
