<template>
  <div class="modal-head">
    <div>
      <p class="section-label">Import</p>
      <h3>匯入成員名單</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-member-import-dialog"
      aria-label="關閉匯入成員名單"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="member-import-form">
    <div class="import-grid">
      <label>
        <span>Excel 檔案（.xlsx）</span>
        <input id="member-import-file" name="member_file" type="file" accept=".xlsx" required>
      </label>
      <div class="import-options">
        <label class="inline-check">
          <input name="auto_create_occupations" type="checkbox" checked>
          <span>自動新增新職業</span>
        </label>
        <label class="inline-check">
          <input name="update_existing" type="checkbox">
          <span>既有編號改為更新</span>
        </label>
      </div>
    </div>

    <div class="import-summary" id="member-import-summary" hidden>
      <span class="status-badge" id="member-import-total">0 筆</span>
      <span class="status-badge" id="member-import-valid">0 筆可匯入</span>
      <span class="status-badge" id="member-import-error">0 筆錯誤</span>
      <span class="status-badge" id="member-import-occupation">0 個新職業</span>
    </div>

    <div class="table-wrap import-preview" id="member-import-preview" hidden>
      <table>
        <thead>
          <tr>
            <th>狀態</th>
            <th>編號</th>
            <th>角色名稱</th>
            <th>職業</th>
            <th>DC</th>
            <th>公會狀態</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody id="member-import-table"></tbody>
      </table>
    </div>

    <div class="button-row">
      <button class="btn primary" type="submit" id="confirm-member-import" disabled>
        <i data-lucide="upload-cloud"></i>
        <span>匯入有效資料</span>
      </button>
      <button class="btn secondary" type="button" id="download-member-import-template">
        <i data-lucide="file-spreadsheet"></i>
        <span>下載範本</span>
      </button>
      <button class="btn secondary" type="button" id="clear-member-import">
        <i data-lucide="x"></i>
        <span>清除</span>
      </button>
      <button class="btn secondary" type="button" id="cancel-member-import-dialog">
        <i data-lucide="x"></i>
        <span>取消</span>
      </button>
    </div>
  </form>
</template>
