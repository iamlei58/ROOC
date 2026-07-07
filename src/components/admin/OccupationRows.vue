<script setup>
defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  emptyMessage: {
    type: String,
    default: "尚未建立職業。"
  },
  onEdit: {
    type: Function,
    default: null
  },
  onToggle: {
    type: Function,
    default: null
  }
});
</script>

<template>
  <tr v-if="rows.length === 0">
    <td
      colspan="3"
      class="empty-cell"
    >
      {{ emptyMessage }}
    </td>
  </tr>

  <tr
    v-for="row in rows"
    v-else
    :key="row.name"
  >
    <td>{{ row.name }}</td>
    <td>
      <span
        class="table-badge"
        :class="row.isActive ? 'is-on' : 'is-off'"
      >
        {{ row.isActive ? "啟用中" : "已停用" }}
      </span>
    </td>
    <td>
      <button
        class="btn table-action"
        type="button"
        @click="onEdit?.(row.name, row.isActive)"
      >
        編輯
      </button>
      <button
        class="btn table-action"
        type="button"
        @click="onToggle?.(row.name, !row.isActive)"
      >
        {{ row.isActive ? "停用" : "啟用" }}
      </button>
    </td>
  </tr>
</template>
