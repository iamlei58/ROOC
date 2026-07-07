<template>
  <button class="btn primary" type="button" id="open-member-create-dialog">
    <i data-lucide="plus"></i>
    <span>新增成員</span>
  </button>
  <button class="btn secondary" type="button" id="open-member-import-dialog">
    <i data-lucide="upload"></i>
    <span>匯入名單</span>
  </button>
  <form class="inline-form" id="member-search-form">
    <input name="query" autocomplete="off" placeholder="搜尋編號、角色名稱、職業">
    <label class="inline-check">
      <input name="include_inactive" type="checkbox">
      <span>含退會</span>
    </label>
  </form>
</template>
