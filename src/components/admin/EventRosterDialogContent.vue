<template>
  <div class="modal-head">
    <div>
      <p class="section-label">本場名單</p>
      <h3>確認抽獎候選人</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-event-roster-dialog"
      aria-label="關閉本場名單"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="event-roster-form">
    <div class="selected-prize" id="event-roster-lock-notice" hidden>
      <span>名單已鎖定</span>
      <strong>活動已有獎項或抽獎紀錄，為了保留公平性，不能再更換候選名單。</strong>
    </div>
    <label>
      <span>貼上角色名稱</span>
      <textarea
        name="roster_text"
        id="event-roster-input"
        rows="12"
        maxlength="162000"
        required
        placeholder="貼上角色名稱，可使用換行、Tab、逗號或分號分隔"
      ></textarea>
      <small class="field-help">名稱會依貼上順序保留；空白項目與重複名稱不會進入抽獎。</small>
    </label>
    <section class="event-roster-preview" id="event-roster-preview" aria-live="polite">
      <div class="event-roster-preview-head">
        <strong id="event-roster-count">尚未貼上名單</strong>
        <span id="event-roster-warning"></span>
      </div>
      <ol class="event-roster-preview-list" id="event-roster-list"></ol>
    </section>
    <div class="button-row">
      <button class="btn primary" type="submit" id="save-event-roster">
        <i data-lucide="save"></i>
        <span>儲存本場名單</span>
      </button>
      <button class="btn secondary" type="button" id="cancel-event-roster-dialog">
        <i data-lucide="x"></i>
        <span>關閉</span>
      </button>
    </div>
  </form>
</template>
