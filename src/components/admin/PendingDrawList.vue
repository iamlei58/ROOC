<script setup>
import { nextTick, reactive } from "vue";

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
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

const emit = defineEmits(["transferStateChange"]);
const transferSelections = reactive({});

function transferValue(row) {
  return transferSelections[row.id] || "";
}

function hasTransferTarget(row) {
  return Boolean(transferValue(row));
}

function transferLabel(row) {
  const value = transferValue(row);
  return props.transferOptions.find((option) => option.value === value)?.label || "";
}

function refreshTransferUi() {
  nextTick(() => emit("transferStateChange"));
}

function handleTransferChange(row, event) {
  transferSelections[row.id] = event.target.value;
  refreshTransferUi();
}

function clearTransfer(row) {
  transferSelections[row.id] = "";
  refreshTransferUi();
}
</script>

<template>
  <section
    v-for="row in rows"
    :key="row.id"
    class="pending-item"
    :data-draw-id="row.id"
  >
    <div class="pending-summary">
      <div>
        <h4>{{ row.title }}</h4>
        <p class="description">{{ row.description }}</p>
      </div>
    </div>
    <div class="button-row">
      <button
        class="btn pending-primary-action"
        :class="hasTransferTarget(row) ? 'accent' : 'primary'"
        type="button"
        data-pending-action="accept"
        :data-draw-id="row.id"
      >
        <i :data-lucide="hasTransferTarget(row) ? 'move-right' : 'check'"></i>
        <span>{{ hasTransferTarget(row) ? "指定轉讓" : "確認得獎" }}</span>
      </button>
      <button
        class="btn secondary"
        type="button"
        data-pending-action="decline"
        :data-draw-id="row.id"
      >
        <i data-lucide="rotate-ccw"></i>
        <span>放棄並重抽</span>
      </button>
    </div>
    <form
      class="transfer-form"
      data-transfer-form
      :data-draw-id="row.id"
    >
      <label>
        <span>指定轉讓給成員</span>
        <select
          name="member_no"
          data-transfer-select
          :value="transferValue(row)"
          :disabled="transferDisabled"
          @change="handleTransferChange(row, $event)"
        >
          <option value="">{{ transferPlaceholder }}</option>
          <option
            v-for="option in transferOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        <span>備註</span>
        <input
          name="note"
          autocomplete="off"
          placeholder=""
        >
      </label>
    </form>
    <div
      class="pending-transfer-notice"
      data-transfer-notice
      :hidden="!hasTransferTarget(row)"
    >
      <span data-transfer-notice-text>
        將指定轉讓給 {{ transferLabel(row) }}，請按「指定轉讓」完成處理。
      </span>
      <button
        class="btn secondary pending-clear-transfer"
        type="button"
        data-clear-transfer
        @click="clearTransfer(row)"
      >
        <i data-lucide="x"></i>
        <span>取消轉讓</span>
      </button>
    </div>
  </section>
</template>
