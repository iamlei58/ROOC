<template>
  <div class="modal-head">
    <div>
      <p class="section-label">Admin</p>
      <h3 id="admin-pin-title">後台登入</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="cancel-admin-pin"
      aria-label="取消管理密碼驗證"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="admin-pin-form">
    <label>
      <span id="admin-pin-label">輸入管理密碼</span>
      <input
        name="app_admin_pin"
        type="password"
        minlength="4"
        maxlength="80"
        autocomplete="current-password"
        required
      >
    </label>
    <div class="button-row">
      <button class="btn primary" type="submit">
        <i data-lucide="shield-check"></i>
        <span id="admin-pin-submit-label">登入</span>
      </button>
      <button class="btn secondary" type="button" id="dismiss-admin-pin">
        <i data-lucide="x"></i>
        <span>取消</span>
      </button>
      <button class="btn secondary" type="button" id="return-public-from-login" hidden>
        <i data-lucide="users"></i>
        <span>返回成員入口</span>
      </button>
    </div>
  </form>

  <form class="form-stack" id="change-admin-pin-form" hidden>
    <label>
      <span>目前密碼</span>
      <input
        name="current_pin"
        type="password"
        minlength="4"
        maxlength="80"
        autocomplete="current-password"
        required
      >
    </label>
    <label>
      <span>新密碼</span>
      <input
        name="new_pin"
        type="password"
        minlength="4"
        maxlength="80"
        autocomplete="new-password"
        required
      >
    </label>
    <label>
      <span>再次輸入新密碼</span>
      <input
        name="confirm_pin"
        type="password"
        minlength="4"
        maxlength="80"
        autocomplete="new-password"
        required
      >
    </label>
    <div class="button-row">
      <button class="btn primary" type="submit">
        <i data-lucide="key-round"></i>
        <span>更新密碼</span>
      </button>
      <button class="btn secondary" type="button" id="dismiss-change-admin-pin">
        <i data-lucide="x"></i>
        <span>取消</span>
      </button>
    </div>
  </form>
</template>
