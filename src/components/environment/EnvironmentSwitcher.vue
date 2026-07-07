<script setup>
import { computed, onMounted, onUpdated } from "vue";

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  rootSelector: {
    type: String,
    default: "#environment-switcher"
  }
});

const emit = defineEmits(["change"]);

const environments = computed(() => props.state?.environments || []);
const currentId = computed(() => props.state?.current?.id || props.state?.defaultEnvironment || "production");
const currentLabel = computed(() => props.state?.current?.label || "正式資料庫");
const shouldShow = computed(() => {
  const state = props.state || {};
  return environments.value.length > 1
    && (state.isLocalSurface || state.hasExplicitEnvironment || !state.isDefault);
});

function syncRootState() {
  const root = document.querySelector(props.rootSelector);
  if (!root) return;

  root.hidden = !shouldShow.value;
  root.classList.toggle("is-test-environment", !props.state?.isDefault);
}

function handleChange(event) {
  emit("change", event.target.value);
}

onMounted(syncRootState);
onUpdated(syncRootState);
</script>

<template>
  <label for="environment-select">資料庫</label>
  <select
    id="environment-select"
    :value="currentId"
    aria-label="切換資料庫環境"
    @change="handleChange"
  >
    <option
      v-for="environment in environments"
      :key="environment.id"
      :value="environment.id"
    >
      {{ environment.label }}
    </option>
  </select>
  <span data-environment-active-label hidden>{{ currentLabel }}</span>
</template>
