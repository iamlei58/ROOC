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
import EventRosterDialogContent from "./EventRosterDialogContent.vue";
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
        title="微光傾城"
        action-href="public.html"
        action-icon="users"
        action-text="成員入口"
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

        <section class="console-toolbar" aria-label="活動工具列">
          <div class="console-toolbar-group">
            <form class="toolbar-form" id="load-event-form">
              <EventLoadToolbarContent
                field-label="未完成活動"
                select-id="event-title-select"
                default-option="選擇活動"
                refresh-button-id="refresh-events"
                refresh-text="刷新活動"
                create-button-id="open-create-event-dialog"
                create-text="建立活動"
              />
            </form>
          </div>

          <div class="console-toolbar-group console-toolbar-group-actions">
            <p class="section-label">目前活動</p>
            <div class="button-row console-actions" id="console-action-bar" aria-label="目前活動操作">
              <button class="btn secondary" type="button" id="open-event-roster-dialog" disabled>
                <i data-lucide="clipboard-list"></i>
                <span>本場名單</span>
              </button>
              <button class="btn secondary" type="button" id="toggle-event-status" disabled>
                <i data-lucide="lock"></i>
                <span>活動狀態</span>
              </button>
              <button class="btn danger" type="button" id="delete-event" disabled>
                <i data-lucide="trash-2"></i>
                <span>刪除活動</span>
              </button>
            </div>
          </div>
        </section>

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

            </section>
          </div>

          <div class="history-grid">
            <section class="table-card">
              <div class="table-head" id="award-table-head">
                <TableHeadBar title="中獎名單" :actions="exportAction('export-awards')" />
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
                  <tbody id="award-table"></tbody>
                </table>
              </div>
            </section>

            <section class="table-card">
              <div class="table-head" id="draw-log-table-head">
                <TableHeadBar title="抽獎紀錄" :actions="exportAction('export-draw-log')" />
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

        <dialog class="modal roster-editor-modal" id="create-event-dialog">
          <div class="modal-shell">
            <CreateEventDialogContent />
          </div>
        </dialog>

        <dialog class="modal roster-editor-modal" id="event-roster-dialog">
          <div class="modal-shell">
            <EventRosterDialogContent />
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

        <section class="console-toolbar" aria-label="歷史活動工具列">
          <div class="console-toolbar-group">
            <form class="toolbar-form" id="history-event-form">
              <EventLoadToolbarContent
                field-label="已結束活動"
                select-id="history-event-select"
                default-option="選擇歷史活動"
                refresh-button-id="refresh-history-events"
                refresh-text="刷新歷史"
              />
            </form>
          </div>

          <div class="console-toolbar-group console-toolbar-group-actions">
            <p class="section-label">歷史活動</p>
            <div class="button-row console-actions" id="history-action-bar" aria-label="歷史活動操作">
              <button class="btn secondary" type="button" id="reopen-history-event" disabled>
                <i data-lucide="unlock"></i>
                <span>重新開放</span>
              </button>
              <button class="btn danger" type="button" id="delete-history-event" disabled>
                <i data-lucide="trash-2"></i>
                <span>刪除活動</span>
              </button>
            </div>
          </div>
        </section>

        <div class="empty-state" id="history-empty">
          <EmptyState message="載入已結束活動後查看歷史資訊。" />
        </div>

        <div class="history-detail" id="history-detail" hidden>
          <section class="info-block">
            <div id="admin-history-event-header"></div>
          </section>

          <section class="stats-grid" id="admin-history-stats-grid"></section>

          <section class="table-card">
            <div class="table-head" id="history-prize-table-head">
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
                <tbody id="history-prize-table"></tbody>
              </table>
            </div>
          </section>

          <section class="table-card">
            <div class="table-head" id="history-award-table-head">
              <TableHeadBar title="中獎名單" :actions="exportAction('export-history-awards')" />
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
                <tbody id="history-award-table"></tbody>
              </table>
            </div>
          </section>

          <section class="table-card">
            <div class="table-head" id="history-draw-log-table-head">
              <TableHeadBar title="抽獎紀錄" :actions="exportAction('export-history-draw-log')" />
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
          <div class="table-wrap member-table-wrap">
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

      <section class="panel tab-panel" id="panel-guides" data-panel="guides" hidden>
        <div class="panel-head">
          <PanelHead
            label="Guides"
            title="攻略中心"
            status-id="guide-status"
            status-text="未載入"
          />
        </div>

        <div class="guide-admin-layout">
          <section class="guide-view table-card guide-list-card is-active" id="guide-list-view">
            <div class="guide-list-head">
              <div>
                <p class="section-label">攻略列表</p>
                <h3>選擇攻略</h3>
              </div>
              <button class="btn primary" type="button" id="create-guide-post">
                <i data-lucide="plus"></i>
                <span>新增</span>
              </button>
            </div>

            <form class="guide-search-form" id="guide-search-form">
              <input name="query" type="search" placeholder="搜尋攻略">
              <select name="status" aria-label="攻略狀態">
                <option value="">全部狀態</option>
                <option value="published">已發布</option>
                <option value="draft">草稿</option>
              </select>
              <button class="btn secondary" type="submit">
                <i data-lucide="search"></i>
                <span>搜尋</span>
              </button>
            </form>

            <div class="guide-maintenance-row">
              <button class="btn secondary" type="button" id="refresh-guides">
                <i data-lucide="refresh-cw"></i>
                <span>刷新</span>
              </button>
            </div>
            <div class="guide-list" id="guide-post-list"></div>
          </section>

          <section class="guide-view table-card guide-editor-card" id="guide-editor-view" hidden>
            <div class="guide-editor-head">
              <div class="guide-editor-title-row">
                <button class="btn secondary guide-back-button" type="button" id="back-to-guide-list">
                  <i data-lucide="arrow-left"></i>
                  <span>列表</span>
                </button>
                <div>
                  <p class="section-label">編輯器</p>
                  <h3 id="guide-editor-title">新增攻略</h3>
                </div>
              </div>
              <div class="button-row guide-danger-row">
                <button class="btn danger" type="button" id="delete-guide-post" disabled>
                  <i data-lucide="trash-2"></i>
                  <span>刪除攻略</span>
                </button>
              </div>
            </div>

            <form class="guide-form" id="guide-post-form">
              <input type="hidden" name="id">
              <section class="guide-meta-card" aria-label="攻略基本資料">
                <div class="guide-meta-grid">
                  <label class="guide-title-field">
                    <span>標題</span>
                    <input name="title" required maxlength="160" placeholder="例如：神官團補基礎配置">
                  </label>
                  <label class="guide-category-field">
                    <span>分類</span>
                    <input name="category" required maxlength="80" placeholder="例如：職業攻略">
                    <div class="guide-category-presets" aria-label="常用分類">
                      <button class="chip-button" type="button" data-guide-category-preset="一般">一般</button>
                      <button class="chip-button" type="button" data-guide-category-preset="職業攻略">職業攻略</button>
                      <button class="chip-button" type="button" data-guide-category-preset="王團攻略">王團攻略</button>
                      <button class="chip-button" type="button" data-guide-category-preset="活動資訊">活動資訊</button>
                    </div>
                  </label>
                  <label>
                    <span>狀態</span>
                    <select name="status">
                      <option value="draft">草稿</option>
                      <option value="published">發布</option>
                    </select>
                  </label>
                  <label class="inline-check guide-pin-check">
                    <input name="is_pinned" type="checkbox">
                    <span>置頂</span>
                  </label>
                </div>

                <label>
                  <span>摘要</span>
                  <textarea name="summary" rows="2" maxlength="500" placeholder="列表中顯示的簡短說明"></textarea>
                </label>
              </section>

              <section class="guide-markdown-editor" aria-label="攻略 Markdown 編輯器">
                <div class="guide-markdown-toolbar" id="guide-markdown-toolbar" aria-label="Markdown 工具列">
                  <button class="btn table-action" type="button" data-guide-md-action="h2" title="小標題">
                    <i data-lucide="heading-2"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="h3" title="段落標題">
                    <i data-lucide="heading-3"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="bold" title="粗體">
                    <i data-lucide="bold"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="italic" title="斜體">
                    <i data-lucide="italic"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="list" title="清單">
                    <i data-lucide="list"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="quote" title="引用">
                    <i data-lucide="quote"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="code" title="程式碼">
                    <i data-lucide="code-2"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="link" title="連結">
                    <i data-lucide="link"></i>
                  </button>
                  <button class="btn table-action" type="button" data-guide-md-action="image-link" title="圖片連結">
                    <i data-lucide="image"></i>
                  </button>
                  <label class="btn table-action guide-md-upload" title="上傳圖片">
                    <i data-lucide="image-up"></i>
                    <input id="guide-image-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
                  </label>
                </div>

                <div class="guide-markdown-shell">
                  <label class="guide-editor-pane">
                    <span>Markdown</span>
                    <textarea
                      id="guide-content-editor"
                      name="content"
                      rows="22"
                      placeholder="在這裡寫攻略。可以使用 Markdown，也可以上傳圖片後自動插入圖片語法。"
                    ></textarea>
                  </label>
                  <section class="guide-preview-pane">
                    <div class="guide-pane-label">Preview</div>
                    <article class="guide-content" id="guide-preview"></article>
                  </section>
                </div>
              </section>

              <div class="button-row guide-editor-actions">
                <button class="btn primary" type="submit">
                  <i data-lucide="save"></i>
                  <span>儲存攻略</span>
                </button>
              </div>
            </form>

          </section>
        </div>
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

    <dialog class="modal compact-modal confirm-modal" id="confirm-dialog">
      <div class="modal-shell">
        <div id="confirm-dialog-content"></div>
      </div>
    </dialog>
  </main>
</template>
