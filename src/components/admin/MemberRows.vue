<script setup>
defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  emptyMessage: {
    type: String,
    default: "沒有符合條件的成員。"
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
      colspan="6"
      class="empty-cell"
    >
      {{ emptyMessage }}
    </td>
  </tr>

  <tr
    v-for="row in rows"
    v-else
    :key="row.memberNo"
  >
    <td>{{ row.memberNo }}</td>
    <td>{{ row.roleName }}</td>
    <td>{{ row.occupation }}</td>
    <td>{{ row.joinedDc ? "是" : "否" }}</td>
    <td>
      <span
        class="table-badge"
        :class="row.isActive ? 'is-on' : 'is-off'"
      >
        {{ row.isActive ? "公會中" : "已退會" }}
      </span>
    </td>
    <td>
      <button
        class="btn table-action"
        type="button"
        @click="onEdit?.(row.memberNo)"
      >
        編輯
      </button>
      <button
        class="btn table-action"
        type="button"
        @click="onToggle?.(row.memberNo, !row.isActive)"
      >
        {{ row.isActive ? "標記退會" : "恢復公會中" }}
      </button>
    </td>
  </tr>
</template>
