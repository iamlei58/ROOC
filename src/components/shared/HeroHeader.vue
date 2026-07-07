<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  actionHref: {
    type: String,
    required: true
  },
  actionIcon: {
    type: String,
    required: true
  },
  actionText: {
    type: String,
    required: true
  },
  showAdminActions: {
    type: Boolean,
    default: false
  }
});

const logoUrl = "https://file.joymaker.com/game/rooc/web/assets/zh-TW_logo-CNKqky8L.png";
</script>

<template>
  <div class="brand">
    <img class="brand-mark" :src="logoUrl" alt="">
    <div>
      <p class="eyebrow">Ragnarok Origin Classic</p>
      <h1>{{ title }}</h1>
    </div>
  </div>
  <div class="hero-actions">
    <div class="hero-status-group">
      <div class="environment-switcher" id="environment-switcher" hidden>
        <label for="environment-select">資料庫</label>
        <select id="environment-select" aria-label="切換資料庫環境"></select>
        <span data-environment-active-label hidden></span>
      </div>
      <div class="connection-pill" id="connection-pill">
        <span class="dot"></span>
        <span id="connection-text">尚未連線</span>
      </div>
    </div>
    <div class="hero-button-group">
      <a class="btn secondary hero-public" :href="actionHref" data-environment-link>
        <i :data-lucide="actionIcon"></i>
        <span>{{ actionText }}</span>
      </a>
      <template v-if="showAdminActions">
        <button class="btn secondary hero-password" type="button" id="change-admin-pin" hidden>
          <i data-lucide="key-round"></i>
          <span>修改密碼</span>
        </button>
        <button class="btn secondary hero-logout" type="button" id="logout-admin" hidden>
          <i data-lucide="log-out"></i>
          <span>登出</span>
        </button>
      </template>
    </div>
  </div>
</template>
