<script setup>
defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  emptyMessage: {
    type: String,
    default: "尚未選擇檔案。"
  }
});
</script>

<template>
  <tr v-if="rows.length === 0">
    <td
      colspan="7"
      class="empty-cell"
    >
      {{ emptyMessage }}
    </td>
  </tr>

  <tr
    v-for="row in rows"
    v-else
    :key="row.key"
    :class="{
      'import-row-error': row.hasError,
      'import-row-done': row.isDone
    }"
  >
    <td>
      <span
        class="table-badge"
        :class="row.statusClass"
      >
        {{ row.statusLabel }}
      </span>
    </td>
    <td>{{ row.memberNo }}</td>
    <td>{{ row.roleName }}</td>
    <td>{{ row.occupation }}</td>
    <td>{{ row.joinedDc ? "是" : "否" }}</td>
    <td>{{ row.isActive ? "公會中" : "已退會" }}</td>
    <td>{{ row.note }}</td>
  </tr>
</template>
