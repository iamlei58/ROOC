<script setup>
import LegacyBridge from "../LegacyBridge.vue";
import DrawAnimationDialogContent from "../draw/DrawAnimationDialogContent.vue";
import EmptyState from "../shared/EmptyState.vue";
import EventLoadToolbarContent from "../shared/EventLoadToolbarContent.vue";
import HeroHeader from "../shared/HeroHeader.vue";
import PanelHead from "../shared/PanelHead.vue";
import TableHeadBar from "../shared/TableHeadBar.vue";
import PublicFairnessNote from "./PublicFairnessNote.vue";
</script>

<template>
  <LegacyBridge page="public" />

  <main class="app-shell public-shell">
    <header class="hero public-hero">
      <HeroHeader
        title="公開驗證"
        action-href="index.html"
        action-icon="lock-keyhole"
        action-text="管理後台"
      />
    </header>

    <section class="toast-stack" id="toast-stack" aria-live="polite" aria-label="系統提示"></section>

    <section class="panel public-panel">
      <div class="panel-head">
        <PanelHead
          label="Fairness"
          title="抽獎歷史與公平驗證"
          status-id="public-status"
          status-text="未載入"
        />
      </div>

      <form class="toolbar-form compact-toolbar" id="public-event-form">
        <EventLoadToolbarContent
          field-label="公開活動"
          select-id="public-event-select"
          default-option="選擇活動"
          submit-icon="search"
          submit-text="查看"
          refresh-button-id="refresh-public-events"
          refresh-text="刷新"
        />
      </form>

      <div class="empty-state" id="public-empty">
        <EmptyState message="選擇活動後查看公開中獎紀錄與抽獎驗證。" />
      </div>

      <div class="public-detail" id="public-detail" hidden>
        <section class="info-block public-summary">
          <div id="public-event-header"></div>
          <div class="public-live-banner" id="public-live-banner" hidden></div>
          <div class="fairness-note">
            <PublicFairnessNote />
          </div>
        </section>

        <section class="stats-grid" id="public-stats-grid"></section>

        <section class="table-card">
          <div class="table-head" id="public-prize-table-head">
            <TableHeadBar title="獎項紀錄" />
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>獎項</th>
                  <th>提供者</th>
                  <th>名額</th>
                  <th>已完成</th>
                  <th>剩餘</th>
                </tr>
              </thead>
              <tbody id="public-prize-table"></tbody>
            </table>
          </div>
        </section>

        <section class="table-card">
          <div class="table-head" id="public-award-table-head">
            <TableHeadBar title="中獎名單" />
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>獎項</th>
                  <th>提供者</th>
                  <th>原抽中者</th>
                  <th>領獎者</th>
                  <th>狀態</th>
                  <th>時間</th>
                </tr>
              </thead>
              <tbody id="public-award-table"></tbody>
            </table>
          </div>
        </section>

        <section class="table-card">
          <div class="table-head" id="public-draw-table-head">
            <TableHeadBar title="抽獎驗證紀錄" />
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>獎項</th>
                  <th>提供者</th>
                  <th>抽中</th>
                  <th>結果</th>
                  <th>機率</th>
                  <th>驗證</th>
                </tr>
              </thead>
              <tbody id="public-draw-table"></tbody>
            </table>
          </div>
        </section>
      </div>
    </section>

    <dialog class="modal roster-modal" id="public-roster-dialog">
      <div class="modal-shell"></div>
    </dialog>

    <dialog class="modal audit-modal" id="audit-dialog">
      <div class="modal-shell"></div>
    </dialog>

    <dialog class="modal draw-animation-modal public-live-modal" id="public-live-dialog">
      <div class="modal-shell draw-animation-shell">
        <DrawAnimationDialogContent
          close-button-id="close-public-live"
          close-label="關閉直播抽獎"
          stage-class="public-live-stage"
          fireworks-layer-id="public-live-fireworks-layer"
          phase-id="public-live-phase"
          phase-text="抽獎同步中"
          prize-id="public-live-prize"
          prize-text="等待抽獎"
          roller-id="public-live-roller"
          reveal-content-id="public-live-reveal-content"
          result-list-id="public-live-results"
          flip-list-id="public-live-flip-results"
        />
      </div>
    </dialog>
  </main>
</template>
