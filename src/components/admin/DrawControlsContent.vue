<template>
  <label>
    <span>選擇獎項</span>
    <select id="draw-prize-select"></select>
  </label>
  <label>
    <span>抽出人數</span>
    <input id="draw-count" type="number" min="1" max="1" step="1" value="1">
  </label>
  <label hidden>
    <span>揭曉模式</span>
    <select id="draw-reveal-mode">
      <option value="roller">跑馬燈</option>
      <option value="flip">翻牌</option>
    </select>
  </label>
  <button class="btn accent" type="button" id="draw-prize">
    <i data-lucide="dice-5"></i>
    <span>抽出</span>
  </button>
</template>
