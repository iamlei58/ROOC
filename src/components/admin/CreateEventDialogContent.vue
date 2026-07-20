<template>
  <div class="modal-head">
    <div>
      <p class="section-label">建立</p>
      <h3>建立抽獎活動</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-create-event-dialog"
      aria-label="關閉建立活動"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="create-event-form">
    <label>
      <span>活動名稱</span>
      <input name="title" required maxlength="120" placeholder="">
    </label>
    <label>
      <span>活動說明</span>
      <textarea name="description" rows="4" maxlength="1200"></textarea>
    </label>
    <label>
      <span>本場抽獎名單</span>
      <textarea
        name="roster_text"
        id="create-event-roster-input"
        rows="9"
        maxlength="162000"
        required
        placeholder="貼上角色名稱，可使用換行、Tab、逗號或分號分隔"
      ></textarea>
      <small class="field-help">系統會清除空白項目並合併重複名稱；建立活動前請確認下方解析結果。</small>
    </label>
    <section class="event-roster-preview" id="create-event-roster-preview" aria-live="polite">
      <div class="event-roster-preview-head">
        <strong id="create-event-roster-count">尚未貼上名單</strong>
        <span id="create-event-roster-warning"></span>
      </div>
      <ol class="event-roster-preview-list" id="create-event-roster-list"></ol>
    </section>
    <div class="button-row">
      <button class="btn primary" type="submit">
        <i data-lucide="plus"></i>
        <span>建立活動</span>
      </button>
      <button class="btn secondary" type="button" id="cancel-create-event-dialog">
        <i data-lucide="x"></i>
        <span>取消</span>
      </button>
    </div>
  </form>
</template>
