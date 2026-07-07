<script setup>
defineProps({
  closeButtonId: {
    type: String,
    required: true
  },
  closeLabel: {
    type: String,
    default: "關閉抽獎結果"
  },
  stageClass: {
    type: String,
    default: ""
  },
  fireworksLayerId: {
    type: String,
    required: true
  },
  phaseId: {
    type: String,
    required: true
  },
  phaseText: {
    type: String,
    default: "抽選中"
  },
  prizeId: {
    type: String,
    required: true
  },
  prizeText: {
    type: String,
    default: "準備抽獎"
  },
  rollerId: {
    type: String,
    required: true
  },
  revealContentId: {
    type: String,
    required: true
  },
  resultListId: {
    type: String,
    required: true
  },
  flipListId: {
    type: String,
    required: true
  }
});
</script>

<template>
  <button
    class="btn icon-button draw-animation-close"
    type="button"
    :id="closeButtonId"
    :aria-label="closeLabel"
  >
    <i data-lucide="x"></i>
  </button>
  <div class="draw-animation-stage" :class="stageClass" aria-live="polite">
    <div class="fireworks-layer" :id="fireworksLayerId" aria-hidden="true"></div>
    <div class="draw-portal" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="draw-lightbar" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
    <p class="section-label" :id="phaseId">{{ phaseText }}</p>
    <h3 :id="prizeId">{{ prizeText }}</h3>
    <div class="draw-roller" :id="rollerId">ROOC</div>
    <div
      :id="revealContentId"
      class="draw-reveal-content"
    >
      <div class="draw-result-list" :id="resultListId"></div>
      <div class="draw-flip-list" :id="flipListId"></div>
    </div>
    <div class="draw-progress" aria-hidden="true">
      <span></span>
    </div>
  </div>
</template>
