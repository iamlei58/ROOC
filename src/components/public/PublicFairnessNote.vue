<template>
  <strong>公開驗證邏輯</strong>
  <p>每次抽獎會保存當下可抽名單、排除人數、獎項提供者排除狀態、隨機 seed、名單 Hash 與結果 Hash。驗證時會重新計算 SHA-256，確認中獎者位置與紀錄一致。</p>
</template>
