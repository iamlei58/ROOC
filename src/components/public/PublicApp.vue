<script setup>
import { onMounted } from "vue";
import DrawAnimationDialogContent from "../draw/DrawAnimationDialogContent.vue";
import EmptyState from "../shared/EmptyState.vue";
import EventLoadToolbarContent from "../shared/EventLoadToolbarContent.vue";
import HeroHeader from "../shared/HeroHeader.vue";
import PanelHead from "../shared/PanelHead.vue";
import TableHeadBar from "../shared/TableHeadBar.vue";
import PublicFairnessNote from "./PublicFairnessNote.vue";

onMounted(() => {
  window.dispatchEvent(new CustomEvent("rooc:vue-ready", {
    detail: {
      page: "public"
    }
  }));
});
</script>

<template>
  <main class="app-shell public-shell">
    <header class="hero public-hero">
      <HeroHeader
        title="微光傾城"
        action-href="index.html"
        action-icon="lock-keyhole"
        action-text="管理後台"
      />
    </header>

    <nav class="tabs public-tabs" id="public-tabs" aria-label="成員功能">
      <button class="tab is-active" type="button" data-public-tab="verify">
        <i data-lucide="history"></i>
        <span>抽獎紀錄</span>
      </button>
      <button class="tab" type="button" data-public-tab="guides">
        <i data-lucide="book-open"></i>
        <span>攻略中心</span>
      </button>
      <button class="tab" type="button" data-public-tab="members">
        <i data-lucide="users"></i>
        <span>公會成員</span>
      </button>
    </nav>

    <section class="toast-stack" id="toast-stack" aria-live="polite" aria-label="系統提示"></section>

    <section class="panel public-panel public-tab-panel is-active" id="public-panel-verify" data-public-panel="verify">
      <div class="panel-head">
        <PanelHead
          label="抽獎資訊"
          title="抽獎紀錄與公平驗證"
          status-id="public-status"
          status-text="未載入"
        />
      </div>

      <form class="toolbar-form compact-toolbar" id="public-event-form">
        <EventLoadToolbarContent
          field-label="活動紀錄"
          select-id="public-event-select"
          default-option="選擇活動"
          refresh-button-id="refresh-public-events"
          refresh-text="刷新"
        />
      </form>

      <div class="empty-state" id="public-empty">
        <EmptyState message="選擇活動後查看中獎紀錄與抽獎驗證。" />
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
          <div class="table-wrap record-table-wrap">
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
          <div class="table-wrap record-table-wrap">
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
          <div class="table-wrap record-table-wrap">
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

    <section class="panel public-panel public-tab-panel" id="public-panel-guides" data-public-panel="guides" hidden>
      <div class="panel-head">
        <PanelHead
          label="Guides"
          title="攻略中心"
          status-id="public-guide-status"
          status-text="未載入"
        />
      </div>

      <form class="toolbar-form compact-toolbar" id="public-guide-search-form">
        <label>
          <span>搜尋攻略</span>
          <input name="query" type="search" placeholder="搜尋標題、分類或內容">
        </label>
        <div class="toolbar-actions">
          <button class="btn secondary" type="submit">
            <i data-lucide="search"></i>
            <span>搜尋</span>
          </button>
          <button class="btn secondary" type="button" id="refresh-public-guides">
            <i data-lucide="refresh-cw"></i>
            <span>刷新</span>
          </button>
        </div>
      </form>

      <div class="public-guide-layout">
        <section class="table-card public-guide-list-card">
          <div class="table-head">
            <h3>攻略列表</h3>
          </div>
          <div class="guide-list public-guide-list" id="public-guide-list"></div>
        </section>

        <section class="table-card public-guide-reader-card">
          <div class="table-head">
            <h3>攻略內容</h3>
          </div>
          <article class="guide-content guide-reader" id="public-guide-reader">
            <p class="guide-muted">選擇攻略後查看內容。</p>
          </article>
        </section>
      </div>
    </section>

    <section class="panel public-panel public-tab-panel" id="public-panel-members" data-public-panel="members" hidden>
      <div class="panel-head">
        <PanelHead
          label="成員名冊"
          title="公會成員"
          status-id="public-member-status"
          status-text="未載入"
        />
      </div>

      <form class="toolbar-form compact-toolbar" id="public-member-search-form">
        <label>
          <span>搜尋成員</span>
          <input name="query" type="search" placeholder="搜尋編號、角色名稱或職業">
        </label>
        <div class="toolbar-actions">
          <button class="btn secondary" type="submit">
            <i data-lucide="search"></i>
            <span>搜尋</span>
          </button>
          <button class="btn secondary" type="button" id="refresh-public-members">
            <i data-lucide="refresh-cw"></i>
            <span>刷新</span>
          </button>
        </div>
      </form>

      <section class="table-card public-member-list-card">
        <div class="table-head">
          <h3>成員列表</h3>
        </div>
        <div class="table-wrap public-member-table-wrap">
          <table>
            <thead id="public-member-table-head"></thead>
            <tbody id="public-member-list"></tbody>
          </table>
        </div>
      </section>
    </section>

    <dialog class="modal roster-modal" id="public-roster-dialog">
      <div class="modal-shell"></div>
    </dialog>

    <dialog class="modal audit-modal" id="audit-dialog">
      <div class="modal-shell"></div>
    </dialog>

    <dialog class="modal guide-image-modal" id="guide-image-dialog">
      <div class="guide-image-shell">
        <button class="btn icon-button guide-image-close" type="button" id="close-guide-image" aria-label="關閉圖片">
          <i data-lucide="x"></i>
        </button>
        <div class="guide-image-viewport" id="guide-image-viewport">
          <img id="guide-image-dialog-img" alt="" draggable="false">
        </div>
        <div class="guide-image-controls" aria-label="圖片縮放">
          <button class="btn table-action" type="button" id="guide-image-zoom-out" aria-label="縮小圖片">
            <i data-lucide="zoom-out"></i>
          </button>
          <input id="guide-image-zoom-range" type="range" min="50" max="300" step="10" value="100" aria-label="圖片縮放倍率">
          <output id="guide-image-zoom-value" for="guide-image-zoom-range">100%</output>
          <button class="btn table-action" type="button" id="guide-image-zoom-in" aria-label="放大圖片">
            <i data-lucide="zoom-in"></i>
          </button>
          <button class="btn table-action" type="button" id="guide-image-zoom-reset" aria-label="重設圖片大小">
            <i data-lucide="rotate-ccw"></i>
          </button>
        </div>
        <p id="guide-image-dialog-caption"></p>
      </div>
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
