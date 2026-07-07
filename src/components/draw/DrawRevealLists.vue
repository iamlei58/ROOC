<script setup>
import { computed } from "vue";

const props = defineProps({
  resultListId: {
    type: String,
    required: true
  },
  flipListId: {
    type: String,
    required: true
  },
  labels: {
    type: Array,
    default: () => []
  },
  rows: {
    type: Array,
    default: () => []
  },
  placeholderCount: {
    type: Number,
    default: 0
  },
  prizeName: {
    type: String,
    default: "抽獎"
  },
  revealMode: {
    type: String,
    default: "roller"
  }
});

const flipCards = computed(() => {
  if (props.revealMode !== "flip") return [];

  if (props.rows.length > 0) {
    return props.rows.map((row, index) => {
      const item = normalizeResultItem(row);
      return {
        key: row.draw_id || row.id || `${item.roleName}-${index}`,
        waiting: false,
        roleName: item.roleName,
        memberNo: item.memberNo && item.memberNo !== item.roleName ? item.memberNo : "",
        delay: flipDelay(index, props.rows.length)
      };
    });
  }

  const count = Math.max(1, Math.trunc(Number(props.placeholderCount) || 1));
  return Array.from({ length: count }, (_, index) => ({
    key: `waiting-${index}`,
    waiting: true,
    roleName: "待揭曉",
    memberNo: "",
    delay: flipDelay(index, count)
  }));
});

const denseFlip = computed(() => flipCards.value.length > 24);

function normalizeResultItem(row = {}) {
  const roleName = cleanString(
    row.role_name
    || row.drawn_role_name
    || row.final_role_name
    || row.member_name
    || row.name
    || row.member_no
    || row.drawn_member_no
    || row.final_member_no
    || props.prizeName
    || "幸運得主"
  );
  const memberNo = cleanString(row.member_no || row.drawn_member_no || row.final_member_no);

  return { roleName, memberNo };
}

function cleanString(value) {
  return String(value || "").trim();
}

function flipDelay(index, total) {
  if (total <= 10) return Number((index * 0.12).toFixed(2));
  if (total <= 30) return Number((index * 0.06).toFixed(2));
  return Number((index * 0.025).toFixed(3));
}
</script>

<template>
  <div
    :id="resultListId"
    class="draw-result-list"
  >
    <div
      v-for="(label, index) in labels"
      :key="`${label}-${index}`"
      class="draw-result-item"
      :style="{ animationDelay: `${index * 0.06}s` }"
    >
      {{ label }}
    </div>
  </div>

  <div
    :id="flipListId"
    class="draw-flip-list"
    :class="{ 'is-dense': denseFlip }"
  >
    <div
      v-for="card in flipCards"
      :key="card.key"
      class="draw-flip-card"
      :class="{ 'is-waiting': card.waiting }"
      :style="{ '--flip-delay': `${card.delay}s` }"
    >
      <div class="draw-flip-card-inner">
        <div class="draw-flip-card-face draw-flip-card-front">
          <template v-if="card.waiting">
            <span>WAIT</span>
            <strong>{{ card.roleName }}</strong>
          </template>
          <template v-else>
            <strong>{{ card.roleName }}</strong>
            <small v-if="card.memberNo">{{ card.memberNo }}</small>
          </template>
        </div>
        <div class="draw-flip-card-face draw-flip-card-back">
          <span>ROOC</span>
          <strong>?</strong>
        </div>
      </div>
    </div>
  </div>
</template>
