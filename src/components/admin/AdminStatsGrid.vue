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
    :key="stat.key"
    class="stat-card"
  >
    <dt>
      <span>{{ stat.label }}</span>
      <button
        v-if="stat.rosterKey"
        class="chip-button"
        type="button"
        :data-roster="stat.rosterKey"
      >
        查看名單
      </button>
      <button
        v-if="stat.historyRosterKey"
        class="chip-button"
        type="button"
        :data-history-roster="stat.historyRosterKey"
      >
        查看名單
      </button>
    </dt>
    <dd>{{ stat.value }}</dd>
  </div>
</template>
