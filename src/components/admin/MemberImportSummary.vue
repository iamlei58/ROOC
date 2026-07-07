<script setup>
defineProps({
  totalCount: {
    type: Number,
    default: 0
  },
  validCount: {
    type: Number,
    default: 0
  },
  errorCount: {
    type: Number,
    default: 0
  },
  newOccupationCount: {
    type: Number,
    default: 0
  }
});
</script>

<template>
  <span class="status-badge" id="member-import-total">{{ totalCount }} 筆</span>
  <span class="status-badge" id="member-import-valid">{{ validCount }} 筆可匯入</span>
  <span class="status-badge" id="member-import-error">{{ errorCount }} 筆錯誤</span>
  <span class="status-badge" id="member-import-occupation">{{ newOccupationCount }} 個新職業</span>
</template>
