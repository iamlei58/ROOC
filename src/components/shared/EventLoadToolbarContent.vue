<script setup>
defineProps({
  fieldLabel: {
    type: String,
    default: "活動"
  },
  selectId: {
    type: String,
    required: true
  },
  defaultOption: {
    type: String,
    default: "選擇活動"
  },
  submitIcon: {
    type: String,
    default: "log-in"
  },
  submitText: {
    type: String,
    default: "載入"
  },
  refreshButtonId: {
    type: String,
    required: true
  },
  refreshIcon: {
    type: String,
    default: "refresh-cw"
  },
  refreshText: {
    type: String,
    default: "刷新"
  },
  createButtonId: {
    type: String,
    default: ""
  },
  createText: {
    type: String,
    default: "建立活動"
  }
});
</script>

<template>
  <label>
    <span>{{ fieldLabel }}</span>
    <select name="slug" :id="selectId">
      <option value="">{{ defaultOption }}</option>
    </select>
  </label>
  <button class="btn primary" type="submit">
    <i :data-lucide="submitIcon"></i>
    <span>{{ submitText }}</span>
  </button>
  <button class="btn secondary" type="button" :id="refreshButtonId">
    <i :data-lucide="refreshIcon"></i>
    <span>{{ refreshText }}</span>
  </button>
  <button
    v-if="createButtonId"
    class="btn secondary"
    type="button"
    :id="createButtonId"
  >
    <i data-lucide="plus"></i>
    <span>{{ createText }}</span>
  </button>
</template>
