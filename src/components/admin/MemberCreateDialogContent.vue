<template>
  <div class="modal-head">
    <div>
      <p class="section-label">新增</p>
      <h3>新增成員</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-member-create-dialog"
      aria-label="關閉新增成員"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="member-form">
    <label>
      <span>編號</span>
      <input name="member_no" autocomplete="off" required maxlength="80" placeholder="">
    </label>
    <label>
      <span>角色名稱</span>
      <input name="role_name" maxlength="120" required>
    </label>
    <div class="field-with-action">
      <label>
        <span>職業</span>
        <select name="occupation" id="member-occupation">
          <option value="">未設定</option>
        </select>
      </label>
      <button class="btn secondary" type="button" id="open-occupation-dialog">
        <i data-lucide="list-plus"></i>
        <span>管理職業</span>
      </button>
    </div>
    <div class="check-row">
      <label>
        <input name="joined_dc" type="checkbox">
        <span>已加入 DC</span>
      </label>
      <label>
        <input name="is_active" type="checkbox" checked>
        <span>公會中</span>
      </label>
    </div>
    <div class="button-row">
      <button class="btn primary" type="submit">
        <i data-lucide="save"></i>
        <span>新增成員</span>
      </button>
      <button class="btn secondary" type="button" id="clear-member-create">
        <i data-lucide="x"></i>
        <span>清除</span>
      </button>
    </div>
  </form>
</template>
