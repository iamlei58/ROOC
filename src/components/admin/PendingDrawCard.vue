<script setup>
import { computed } from "vue";
import PendingDrawList from "./PendingDrawList.vue";

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  totalCount: {
    type: Number,
    default: 0
  },
  visibleCount: {
    type: Number,
    default: 0
  },
  hiddenCount: {
    type: Number,
    default: 0
  },
  transferOptions: {
    type: Array,
    default: () => []
  },
  transferPlaceholder: {
    type: String,
    default: "選擇轉讓對象"
  },
  transferDisabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["showMore", "transferStateChange"]);

const countText = computed(() => (
  props.hiddenCount > 0
    ? `${props.totalCount} 筆，顯示 ${props.visibleCount}`
    : `${props.totalCount} 筆`
));

const moreText = computed(() => (
  props.hiddenCount > 0 ? `顯示更多（剩 ${props.hiddenCount} 筆）` : "顯示更多"
));
</script>

<template>
  <div class="block-head compact">
    <div>
      <p class="section-label">待處理</p>
      <h3>待處理抽獎</h3>
    </div>
    <span class="status-badge" id="pending-count">{{ countText }}</span>
  </div>
  <div class="pending-list" id="pending-list">
    <PendingDrawList
      :rows="rows"
      :transfer-options="transferOptions"
      :transfer-placeholder="transferPlaceholder"
      :transfer-disabled="transferDisabled"
      @transfer-state-change="emit('transferStateChange')"
    />
  </div>
  <button
    v-if="hiddenCount > 0"
    class="btn secondary pending-more"
    type="button"
    id="pending-show-more"
    @click="emit('showMore')"
  >
    <i data-lucide="chevrons-down"></i>
    <span id="pending-show-more-label">{{ moreText }}</span>
  </button>
</template>
