<script setup>
defineProps({
  kind: {
    type: String,
    required: true
  },
  rows: {
    type: Array,
    default: () => []
  },
  emptyMessage: {
    type: String,
    default: "目前沒有資料。"
  },
  footerMessage: {
    type: String,
    default: ""
  },
  colspan: {
    type: Number,
    default: 1
  }
});
</script>

<template>
  <tr v-if="rows.length === 0">
    <td
      :colspan="colspan"
      class="empty-cell"
    >
      {{ emptyMessage }}
    </td>
  </tr>

  <template v-else-if="kind === 'prizes'">
    <tr
      v-for="row in rows"
      :key="row.id"
    >
      <td>{{ row.name }}</td>
      <td>{{ row.provider }}</td>
      <td>{{ row.quantity }}</td>
      <td>{{ row.filledCount }}</td>
      <td>{{ row.remainingCount }}</td>
    </tr>
  </template>

  <template v-else-if="kind === 'awards'">
    <tr
      v-for="row in rows"
      :key="row.id"
    >
      <td>{{ row.prizeName }}</td>
      <td>{{ row.provider }}</td>
      <td>{{ row.drawnMember }}</td>
      <td>{{ row.finalMember }}</td>
      <td>{{ row.status }}</td>
      <td>{{ row.resolvedAt }}</td>
    </tr>
  </template>

  <template v-else-if="kind === 'draws'">
    <tr
      v-for="row in rows"
      :key="row.id"
    >
      <td>{{ row.prizeName }}</td>
      <td>{{ row.provider }}</td>
      <td>{{ row.drawnMember }}</td>
      <td>{{ row.status }}</td>
      <td>{{ row.probability }}</td>
      <td>
        <button
          class="btn table-action"
          type="button"
          :data-verify-draw="row.id"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span>驗證</span>
        </button>
      </td>
    </tr>
  </template>

  <tr v-if="footerMessage && rows.length > 0">
    <td
      :colspan="colspan"
      class="empty-cell"
    >
      {{ footerMessage }}
    </td>
  </tr>
</template>
