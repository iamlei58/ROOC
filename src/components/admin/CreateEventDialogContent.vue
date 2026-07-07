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
