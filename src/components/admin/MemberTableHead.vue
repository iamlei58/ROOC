<script setup>
defineProps({
  sortKey: {
    type: String,
    default: "member_no"
  },
  direction: {
    type: String,
    default: "asc"
  }
});

const emit = defineEmits(["sort"]);

const columns = [
  { key: "member_no", label: "編號" },
  { key: "role_name", label: "角色名稱" },
  { key: "occupation", label: "職業" },
  { key: "joined_dc", label: "DC" },
  { key: "is_active", label: "公會狀態" }
];

function iconFor(columnKey, sortKey, direction) {
  if (columnKey !== sortKey) return "arrow-up-down";
  return direction === "asc" ? "arrow-up" : "arrow-down";
}
</script>

<template>
  <tr>
    <th
      v-for="column in columns"
      :key="column.key"
    >
      <button
        class="sort-button"
        :class="{ 'is-active': column.key === sortKey }"
        type="button"
        :data-member-sort="column.key"
        :aria-pressed="String(column.key === sortKey)"
        @click="emit('sort', column.key)"
      >
        <span>{{ column.label }}</span>
        <span class="sort-icon" data-member-sort-icon>
          <i :data-lucide="iconFor(column.key, sortKey, direction)"></i>
        </span>
      </button>
    </th>
    <th>操作</th>
  </tr>
</template>
