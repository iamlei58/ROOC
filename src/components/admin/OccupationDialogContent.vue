<template>
  <div class="modal-head">
    <div>
      <p class="section-label">Options</p>
      <h3>職業管理</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-occupation-dialog"
      aria-label="關閉職業管理"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="modal-form" id="occupation-form">
    <input name="original_name" id="occupation-original-name" type="hidden">
    <div class="edit-state">
      <div>
        <p class="section-label" id="occupation-form-mode">新增職業</p>
        <strong id="occupation-edit-label">建立新的職業選項</strong>
      </div>
      <span class="status-badge" id="occupation-edit-badge">新增</span>
    </div>
    <div class="modal-form-fields">
      <label>
        <span>職業名稱</span>
        <input name="name" autocomplete="off" maxlength="120" placeholder="例如：神官" required>
      </label>
      <label class="inline-check">
        <input name="is_active" type="checkbox" checked>
        <span>啟用</span>
      </label>
      <button class="btn primary" type="submit">
        <i data-lucide="plus"></i>
        <span id="occupation-submit-label">新增職業</span>
      </button>
      <button class="btn secondary" type="button" id="clear-occupation-edit">
        <i data-lucide="x"></i>
        <span>取消編輯</span>
      </button>
    </div>
  </form>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>職業</th>
          <th>狀態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="occupation-table"></tbody>
    </table>
  </div>
</template>
