<script setup>
defineProps({
  subtitle: {
    type: String,
    default: ""
  },
  count: {
    type: Number,
    default: 0
  },
  emptyMessage: {
    type: String,
    default: "目前沒有名單資料。"
  },
  items: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <div class="roster-dialog-summary">
    <span class="status-badge">{{ count }} 筆</span>
    <span v-if="subtitle">{{ subtitle }}</span>
  </div>

  <div class="roster-dialog-list">
    <div
      v-if="items.length === 0"
      class="empty-state compact-empty"
    >
      <p>{{ emptyMessage }}</p>
    </div>

    <template v-else>
      <article
        v-for="(item, index) in items"
        :key="item.id ?? index"
        class="roster-member"
      >
        <div>
          <strong>{{ item.title }}</strong>
          <p>{{ item.meta || "沒有額外資訊" }}</p>
        </div>
      </article>
    </template>
  </div>
</template>
