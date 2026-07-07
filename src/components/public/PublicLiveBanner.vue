<script setup>
import { computed } from "vue";

const props = defineProps({
  live: {
    type: Object,
    default: null
  }
});

const title = computed(() => {
  if (props.live?.status === "drawing") return "抽獎同步中";
  if (props.live?.status === "completed") return "剛剛開獎完成";
  return "剛剛抽獎未完成";
});

const message = computed(() => {
  const live = props.live || {};
  if (live.status === "drawing") {
    return `正在抽「${live.prize_name || "抽獎"}」，本次 ${live.draw_count || 1} 位。`;
  }
  if (live.status === "completed") {
    return `「${live.prize_name || "抽獎"}」已抽出 ${live.draw_count || 1} 位，紀錄正在同步。`;
  }
  return live.error_message || "後台抽獎流程中斷，請等待管理員重新操作。";
});
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2a6 6 0 0 1 0-8.5" />
    <circle
      cx="12"
      cy="12"
      r="2"
    />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.5" />
    <path d="M19.1 4.9c3.9 3.9 3.9 10.2 0 14.1" />
  </svg>
  <div>
    <strong>{{ title }}</strong>
    <p>{{ message }}</p>
  </div>
</template>
