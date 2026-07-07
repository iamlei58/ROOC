<template>
  <div class="modal-head">
    <div>
      <p class="section-label" id="bonus-prize-mode">新增</p>
      <h3 id="bonus-prize-title">新增獎項</h3>
    </div>
    <button
      class="btn icon-button"
      type="button"
      id="close-bonus-prize-dialog"
      aria-label="關閉獎項調整"
    >
      <i data-lucide="x"></i>
    </button>
  </div>

  <form class="form-stack" id="add-prize-form" novalidate>
    <input name="prize_id" id="bonus-prize-id" type="hidden">
    <div class="selected-prize" id="bonus-selected-prize" hidden>
      <span>調整獎項</span>
      <strong id="bonus-selected-prize-name"></strong>
    </div>
    <label data-new-prize-field>
      <span>獎項名稱</span>
      <input name="name" id="bonus-prize-name" maxlength="120" required placeholder="月卡">
    </label>
    <label data-new-prize-field>
      <span>提供者</span>
      <select name="provider" id="prize-provider-select" required>
        <option value="">選擇提供者</option>
      </select>
    </label>
    <label>
      <span id="bonus-quantity-label">名額</span>
      <input
        name="quantity"
        id="bonus-prize-quantity"
        type="number"
        min="1"
        max="200"
        value="1"
        required
      >
    </label>
    <div class="button-row">
      <button class="btn primary" type="submit">
        <i data-lucide="plus"></i>
        <span id="bonus-prize-submit-label">新增獎項</span>
      </button>
      <button class="btn secondary" type="button" id="cancel-bonus-prize-dialog">
        <i data-lucide="x"></i>
        <span>取消</span>
      </button>
    </div>
  </form>
</template>
