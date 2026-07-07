<script setup>
import { onMounted } from "vue";
import DrawAnimationDialogContent from "../draw/DrawAnimationDialogContent.vue";
import EmptyState from "../shared/EmptyState.vue";
import EventLoadToolbarContent from "../shared/EventLoadToolbarContent.vue";
import HeroHeader from "../shared/HeroHeader.vue";
import PanelHead from "../shared/PanelHead.vue";
import TableHeadBar from "../shared/TableHeadBar.vue";
import AdminPinDialogContent from "./AdminPinDialogContent.vue";
import BonusPrizeDialogContent from "./BonusPrizeDialogContent.vue";
import CreateEventDialogContent from "./CreateEventDialogContent.vue";
import DrawControlsContent from "./DrawControlsContent.vue";
import MemberCreateDialogContent from "./MemberCreateDialogContent.vue";
import MemberEditDialogContent from "./MemberEditDialogContent.vue";
import MemberImportDialogContent from "./MemberImportDialogContent.vue";
import MemberListToolbar from "./MemberListToolbar.vue";
import OccupationDialogContent from "./OccupationDialogContent.vue";

const exportAction = (id) => [
  {
    id,
    icon: "file-spreadsheet",
    label: "匯出 Excel"
  }
];

const addPrizeAction = [
  {
    id: "open-bonus-prize-dialog",
    icon: "plus",
    label: "新增獎項",
    className: "btn secondary"
  }
];

onMounted(() => {
  window.dispatchEvent(new CustomEvent("rooc:vue-ready", {
    detail: {
      page: "admin"
    }
  }));
});
</script>

<template>
  <main class="app-shell">
    <header class="hero">
      <HeroHeader
        title="星辰"
        action-href="public.html"
        action-icon="shield-check"
        action-text="公開驗證"
        show-admin-actions
      />
    </header>

    <nav class="tabs" id="admin-tabs" aria-label="主要功能"></nav>

    <section class="toast-stack" id="toast-stack" aria-live="polite" aria-label="系統提示"></section>

    <section class="workspace">
      <section class="panel tab-panel is-active" id="panel-console" data-panel="console">
        <div class="panel-head">
          <PanelHead
            label="抽獎現場"
            title="抽獎控制台"
            status-id="console-status"
            status-text="未載入"
          />
        </div>

        <form class="toolbar-form" id="load-event-form">
          <EventLoadToolbarContent
            field-label="未完成活動"
            select-id="event-title-select"
            default-option="選擇活動"
            submit-icon="log-in"
            submit-text="載入"
            refresh-button-id="refresh-events"
            refresh-text="刷新活動"
            create-button-id="open-create-event-dialog"
            create-text="建立活動"
          />
        </form>

        <div class="empty-state" id="console-empty">
          <EmptyState message="載入活動後開始抽獎。" />
        </div>

        <div class="console-detail" id="console-detail" hidden>
          <section class="table-card">
            <div class="table-head" id="prize-queue-head">
              <TableHeadBar title="獎項佇列" :actions="addPrizeAction" />
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
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="prize-table"></tbody>
              </table>
            </div>
          </section>

          <section class="stats-grid" id="admin-console-stats-grid"></section>

          <div class="board-grid single-board">
            <section class="info-block draw-station">
              <div id="admin-console-event-header"></div>

              <div class="draw-controls">
                <DrawControlsContent />
              </div>

              <div class="draw-odds-card" id="draw-odds-card" hidden></div>
              <div class="pending-card" id="pending-card" hidden></div>

              <div class="button-row console-actions">
                <button class="btn secondary" type="button" id="refresh-event">
                  <i data-lucide="refresh-cw"></i>
                  <span>刷新</span>
                </button>
                <button class="btn secondary" type="button" id="reopen-event">
                  <i data-lucide="unlock"></i>
                  <span>重新開放</span>
                </button>
                <button class="btn secondary" type="button" id="close-event">
                  <i data-lucide="lock"></i>
                  <span>結束活動</span>
                </button>
                <button class="btn danger" type="button" id="delete-event">
                  <i data-lucide="trash-2"></i>
                  <span>刪除活動</span>
                </button>
              </div>
            </section>
          </div>

          <div class="history-grid">
            <section class="table-card">
              <div class="table-head" id="award-table-head">
                <TableHeadBar title="中獎名單" :actions="exportAction('export-awards')" />
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
                  <tbody id="award-table"></tbody>
                </table>
              </div>
            </section>

            <section class="table-card">
              <div class="table-head" id="draw-log-table-head">
                <TableHeadBar title="抽獎紀錄" :actions="exportAction('export-draw-log')" />
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
                  <tbody id="draw-log-table"></tbody>
                </table>
              </div>
            </section>
          </div>
        </div>

        <dialog class="modal prize-modal" id="bonus-prize-dialog">
          <div class="modal-shell">
            <BonusPrizeDialogContent />
          </div>
        </dialog>

        <dialog class="modal draw-animation-modal" id="draw-animation-dialog">
          <div class="modal-shell draw-animation-shell">
            <DrawAnimationDialogContent
              close-button-id="close-draw-animation"
              close-label="關閉抽獎結果"
              fireworks-layer-id="draw-fireworks-layer"
              phase-id="draw-animation-phase"
              phase-text="抽選中"
              prize-id="draw-animation-prize"
              prize-text="準備抽獎"
              roller-id="draw-animation-roller"
              reveal-content-id="draw-animation-reveal-content"
              result-list-id="draw-animation-results"
              flip-list-id="draw-animation-flip-results"
            />
          </div>
        </dialog>

        <dialog class="modal compact-modal" id="create-event-dialog">
          <div class="modal-shell">
            <CreateEventDialogContent />
          </div>
        </dialog>
      </section>

      <section class="panel tab-panel" id="panel-history" data-panel="history" hidden>
        <div class="panel-head">
          <PanelHead
            label="歷史查詢"
            title="歷史抽獎資訊"
            status-id="history-status"
            status-text="未載入"
          />
        </div>

        <form class="toolbar-form compact-toolbar" id="history-event-form">
          <EventLoadToolbarContent
            field-label="已結束活動"
            select-id="history-event-select"
            default-option="選擇歷史活動"
            submit-icon="log-in"
            submit-text="載入"
            refresh-button-id="refresh-history-events"
            refresh-text="刷新歷史"
          />
        </form>

        <div class="empty-state" id="history-empty">
          <EmptyState message="載入已結束活動後查看歷史資訊。" />
        </div>

        <div class="history-detail" id="history-detail" hidden>
          <section class="info-block">
            <div id="admin-history-event-header"></div>
            <div class="button-row">
              <button class="btn danger" type="button" id="delete-history-event">
                <i data-lucide="trash-2"></i>
                <span>刪除活動</span>
              </button>
            </div>
          </section>

          <section class="stats-grid" id="admin-history-stats-grid"></section>

          <section class="table-card">
            <div class="table-head" id="history-prize-table-head">
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
                <tbody id="history-prize-table"></tbody>
              </table>
            </div>
          </section>

          <section class="table-card">
            <div class="table-head" id="history-award-table-head">
              <TableHeadBar title="中獎名單" :actions="exportAction('export-history-awards')" />
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
                <tbody id="history-award-table"></tbody>
              </table>
            </div>
          </section>

          <section class="table-card">
            <div class="table-head" id="history-draw-log-table-head">
              <TableHeadBar title="抽獎紀錄" :actions="exportAction('export-history-draw-log')" />
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
                <tbody id="history-draw-log-table"></tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section class="panel tab-panel" id="panel-members" data-panel="members" hidden>
        <div class="panel-head">
          <PanelHead
            label="Members"
            title="成員資料"
            status-id="member-status"
            status-text="未載入"
            status-in-actions
          />
        </div>

        <section class="table-card">
          <div class="table-head with-form" id="member-list-table-head">
            <h3>成員列表</h3>
            <div class="member-list-toolbar">
              <MemberListToolbar />
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead id="member-table-head"></thead>
              <tbody id="member-table"></tbody>
            </table>
          </div>
        </section>

        <dialog class="modal member-modal" id="member-create-dialog">
          <div class="modal-shell">
            <MemberCreateDialogContent />
          </div>
        </dialog>

        <dialog class="modal import-modal" id="member-import-dialog">
          <div class="modal-shell">
            <MemberImportDialogContent />
          </div>
        </dialog>

        <dialog class="modal compact-modal" id="member-edit-dialog">
          <div class="modal-shell">
            <MemberEditDialogContent />
          </div>
        </dialog>

        <dialog class="modal" id="occupation-dialog">
          <div class="modal-shell">
            <OccupationDialogContent />
          </div>
        </dialog>
      </section>
    </section>

    <dialog class="modal compact-modal" id="admin-pin-dialog">
      <div class="modal-shell">
        <AdminPinDialogContent />
      </div>
    </dialog>

    <dialog class="modal roster-modal" id="roster-dialog">
      <div class="modal-shell"></div>
    </dialog>

    <dialog class="modal audit-modal" id="audit-dialog">
      <div class="modal-shell"></div>
    </dialog>

    <dialog class="modal compact-modal confirm-modal" id="confirm-dialog">
      <div class="modal-shell">
        <div id="confirm-dialog-content"></div>
      </div>
    </dialog>
  </main>
</template>
