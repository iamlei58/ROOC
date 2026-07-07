<script setup>
defineProps({
  groups: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["select"]);
</script>

<template>
  <div class="flip-choice-board" role="list">
    <button
      v-for="group in groups"
      :key="group.id"
      class="flip-choice-card"
      type="button"
      :disabled="disabled || group.disabled"
      role="listitem"
      @click="emit('select', group)"
    >
      <span class="flip-choice-card__label">{{ group.label }}</span>
      <strong class="flip-choice-card__title">{{ group.title || "翻牌" }}</strong>
      <small class="flip-choice-card__meta">{{ group.meta || "等待揭曉" }}</small>
    </button>
  </div>
</template>

<style scoped>
.flip-choice-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.flip-choice-card {
  display: grid;
  min-height: 168px;
  padding: 18px;
  border: 1px solid rgba(47, 84, 131, 0.2);
  border-radius: 8px;
  color: #102033;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(232, 241, 248, 0.96)),
    radial-gradient(circle at 20% 12%, rgba(245, 191, 82, 0.28), transparent 32%);
  box-shadow: 0 12px 28px rgba(16, 32, 51, 0.12);
  text-align: left;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.flip-choice-card:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(20, 116, 138, 0.4);
  box-shadow: 0 16px 34px rgba(16, 32, 51, 0.16);
}

.flip-choice-card:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.flip-choice-card__label {
  align-self: start;
  color: #5f7088;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.flip-choice-card__title {
  align-self: center;
  font-size: clamp(1.6rem, 2.6vw, 2.4rem);
  letter-spacing: 0;
}

.flip-choice-card__meta {
  align-self: end;
  color: #5f7088;
  font-weight: 700;
}
</style>
