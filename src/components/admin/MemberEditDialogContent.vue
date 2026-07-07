<template>
  <div class="modal-head">
    <div>
      <p class="section-label">Edit</p>
      <h3>編輯成員</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-member-edit"
      aria-label="關閉成員編輯"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="member-edit-form">
    <input name="original_member_no" type="hidden">
    <label>
      <span>編號</span>
      <input name="member_no" autocomplete="off" required maxlength="80">
    </label>
    <label>
      <span>角色名稱</span>
      <input name="role_name" maxlength="120" required>
    </label>
    <label>
      <span>職業</span>
      <select name="occupation" id="edit-member-occupation">
        <option value="">未設定</option>
      </select>
    </label>
    <div class="check-row">
      <label>
        <input name="joined_dc" type="checkbox">
        <span>已加入 DC</span>
      </label>
      <label>
        <input name="is_active" type="checkbox">
        <span>公會中</span>
      </label>
    </div>
    <div class="button-row">
      <button class="btn primary" type="submit">
        <i data-lucide="save"></i>
        <span>儲存修改</span>
      </button>
      <button class="btn secondary" type="button" id="cancel-member-edit">
        <i data-lucide="x"></i>
        <span>取消</span>
      </button>
    </div>
  </form>
</template>
