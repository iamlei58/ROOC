<script setup>
import { computed } from "vue";

const props = defineProps({
  draw: {
    type: Object,
    default: () => ({})
  },
  verification: {
    type: Object,
    default: () => ({ status: "checking" })
  },
  hasFullSnapshot: {
    type: Boolean,
    default: false
  },
  helpers: {
    type: Object,
    default: () => ({})
  }
});

const audit = computed(() => props.draw?.audit || null);
const eligibleMembers = computed(() => Array.isArray(audit.value?.eligible_members) ? audit.value.eligible_members : []);
const providerExcluded = computed(() => audit.value?.provider_excluded ? 1 : 0);
const selectedMember = computed(() => (
  eligibleMembers.value.find((member) => Number(member.position) === Number(audit.value?.selected_index))
));
const verificationStatus = computed(() => props.verification?.status || "checking");
const verificationClass = computed(() => ({
  passed: "is-passed",
  failed: "is-failed",
  warning: "is-warning"
}[verificationStatus.value] || ""));
const verificationIcon = computed(() => ({
  passed: "circle-check",
  failed: "circle-alert",
  warning: "triangle-alert"
}[verificationStatus.value] || "loader"));
const verificationTitle = computed(() => ({
  passed: "瀏覽器重算通過",
  failed: "瀏覽器重算失敗",
  warning: "驗證資料不足"
}[verificationStatus.value] || "正在重算驗證"));
const verificationMessage = computed(() => (
  props.verification?.message || "正在用公開 seed、名單 Hash 與 SHA-256 重新計算中獎位置。"
));
const canShowEligibleFormula = computed(() => (
  audit.value?.active_member_count !== "" && audit.value?.excluded_count_before !== ""
));

function displayAuditValue(value) {
  return props.helpers.displayAuditValue?.(value) ?? (value === "" || value == null ? "-" : value);
}

function formatPercent(value) {
  return props.helpers.formatPercent?.(value) ?? "-";
}

function memberPlainText(memberNo, displayName) {
  return props.helpers.memberPlainText?.(memberNo, displayName) || displayName || memberNo || "-";
}

</script>

<template>
  <div
    v-if="!audit"
    class="verification-result is-warning"
  >
    <i data-lucide="triangle-alert"></i>
    <div>
      <strong>這筆紀錄沒有公平快照</strong>
      <p>它可能是在公開驗證功能上線前建立，只能查看基本抽獎紀錄，不能做完整 Hash 驗證。</p>
    </div>
  </div>

  <template v-else>
    <div :class="['verification-result', verificationClass]">
      <span
        class="verification-icon"
        :class="`is-${verificationIcon}`"
        aria-hidden="true"
      >
        <svg
          v-if="verificationIcon === 'circle-check'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <svg
          v-else-if="verificationIcon === 'circle-alert'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <line
            x1="12"
            x2="12"
            y1="8"
            y2="12"
          />
          <line
            x1="12"
            x2="12.01"
            y1="16"
            y2="16"
          />
        </svg>
        <svg
          v-else-if="verificationIcon === 'triangle-alert'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <svg
          v-else
          class="verification-spinner"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            opacity="0.2"
          />
          <path d="M21 12a9 9 0 0 0-9-9" />
        </svg>
      </span>
      <div>
        <strong>{{ verificationTitle }}</strong>
        <p>{{ verificationMessage }}</p>
      </div>
    </div>

    <section class="audit-section">
      <h4>機率公式</h4>
      <div class="audit-grid">
        <div><span>公會中成員</span><strong>{{ displayAuditValue(audit.active_member_count) }}</strong></div>
        <div><span>已排除</span><strong>{{ displayAuditValue(audit.excluded_count_before) }}</strong></div>
        <div><span>提供者排除</span><strong>{{ providerExcluded }}</strong></div>
        <div><span>可抽人數</span><strong>{{ displayAuditValue(audit.eligible_count) }}</strong></div>
      </div>
      <p
        v-if="canShowEligibleFormula"
        class="description"
      >
        可抽人數 = 公會中 {{ audit.active_member_count }} - 已排除 {{ audit.excluded_count_before }} - 提供者排除 {{ providerExcluded }} = {{ displayAuditValue(audit.eligible_count) }}
      </p>
      <p class="description">
        本次第 {{ displayAuditValue(audit.round_index) }} 抽的單步機率 = 1 / {{ displayAuditValue(audit.eligible_count) }} = {{ formatPercent(audit.step_probability) }}；本輪一次抽出 {{ displayAuditValue(audit.round_draw_count) }} 位，開抽時每人本輪機率約 {{ formatPercent(audit.round_probability) }}。
      </p>
    </section>

    <template v-if="hasFullSnapshot">
      <section class="audit-section">
        <h4>Hash 驗證</h4>
        <div class="hash-list">
          <div><span>演算法</span><code>{{ audit.algorithm }}</code></div>
          <div><span>Random Seed</span><code>{{ audit.random_seed }}</code></div>
          <div><span>名單 Hash</span><code>{{ audit.eligible_manifest_hash }}</code></div>
          <div><span>結果 Hash</span><code>{{ audit.selector_hash }}</code></div>
          <div><span>抽中位置</span><code>#{{ audit.selected_index }} / {{ audit.eligible_count }}</code></div>
          <div><span>位置對應</span><code>{{ memberPlainText(selectedMember?.member_no, selectedMember?.role_name) }}</code></div>
        </div>
      </section>

      <section class="audit-section">
        <h4>當下可抽名單快照</h4>
        <div class="eligible-list">
          <div
            v-for="member in eligibleMembers"
            :key="`${member.position}-${member.member_no}`"
            :class="{ 'is-selected': Number(member.position) === Number(audit.selected_index) }"
          >
            <span>#{{ member.position }}</span>
            <strong>{{ memberPlainText(member.member_no, member.role_name) }}</strong>
            <small>{{ member.occupation || "未填職業" }}</small>
          </div>
        </div>
      </section>
    </template>

    <section
      v-else
      class="audit-section"
    >
      <h4>基礎驗證資料</h4>
      <div class="hash-list">
        <div><span>Random Token</span><code>{{ audit.random_seed || "-" }}</code></div>
        <div><span>名單 Hash</span><code>{{ audit.eligible_manifest_hash || "-" }}</code></div>
        <div><span>抽中位置</span><code>#{{ displayAuditValue(audit.selected_index) }} / {{ displayAuditValue(audit.eligible_count) }}</code></div>
      </div>
      <p class="description">這筆資料缺少完整可抽名單或結果 Hash，因此目前只能顯示機率與基礎公開紀錄，不能在瀏覽器完整重算 Hash。</p>
    </section>
  </template>
</template>
