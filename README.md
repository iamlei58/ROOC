# ROOC 抽獎控制台

GitHub Pages 靜態前端搭配 Supabase Postgres/RPC 的會員池抽獎系統。

前端目前已接上 Vue 3 + Vite build 流程。現有後台與公開驗證頁仍保留原本穩定的靜態 DOM/RPC 行為，新的抽獎互動會逐步改用 Vue 元件承接。

## 核心規則

- 新活動建立時直接貼上角色名稱，系統會建立該場活動專用的固定名單快照。
- 名單支援換行、Tab、半形／全形逗號與分號，空白項目及重複名稱會自動略過。
- 活動名單可在新增第一個獎項前修改；有獎項後即鎖定，避免抽獎母體中途變動。
- 舊活動若沒有名單快照，仍相容原本的 `rooc_members` 公會會員池。
- 每場抽獎活動中，同一人只能被處理一次。
- 已確認得獎、放棄重抽、原抽中後轉讓、被指定轉讓的人，都會進入該場活動的排除名單。
- 被指定轉讓的人必須在本場名單中且尚未被排除。
- 獎項可有多個名額。
- 抽獎過程中可以隨時新增獎項，用於現場加碼。
- 系統保留中獎名單、抽獎時間、抽獎批次、抽獎 token、轉讓/放棄紀錄，並可匯出 Excel。

## Supabase Project

目前使用的 project：

- Name: `rooc`
- Project ID: `euzosifslqchutznteqc`
- Region: `ap-northeast-1`

不要把資料庫密碼或 service role key 放進 repo、GitHub Pages、`config.js`。前端只需要 Project URL 與 anon public key。

## 資料表

- `rooc_members`：會員池
  - `member_no`：編號
  - `role_name`：角色名稱，必填
  - `occupation`：職業
  - `joined_dc`：是否加入 DC
  - `is_active`：公會狀態，true 代表公會中，false 代表已退會
- `rooc_occupations`：職業選項
  - 職業可新增、改名、啟用、停用
  - 改名職業會同步更新既有成員的職業
  - 停用職業不會出現在成員表單下拉選單
- `raffle_events`：抽獎活動，活動名稱不可重複
- `raffle_event_members`：每場活動建立時固定保存的角色名稱名單
- `raffle_prizes`：獎項與提供者
- `raffle_draws`：每一次抽出與處理結果
- `raffle_exclusions`：每場活動的排除名單
- `raffle_app_config`：管理密碼 hash

所有前端操作都透過 RPC 執行。資料表已啟用 RLS 並撤銷 anon/authenticated 的直接表格存取。

## Supabase 初始化

可用兩種方式套用 schema：

1. 由 Codex 使用 Supabase connector 執行 migration。
2. 手動到 Supabase SQL Editor 執行 `supabase/schema.sql`。

第一次進入後台時，系統會要求輸入管理密碼。若尚未初始化，系統會建立；若已初始化，則會驗證該密碼。

管理密碼以 hash 存在資料庫，不會以明碼保存。前端只會把已驗證的管理密碼暫存在同一分頁的 `sessionStorage`，重整頁面後可沿用，關閉分頁後會清除。管理密碼可用頁面右上角的「修改密碼」更新，也可用「登出」清除暫存登入狀態。

## 設定方式

前端不需要在畫面貼 Supabase 設定。正式部署時，GitHub Actions 會先執行 Vite build，再用 repo variables 產生 `dist/config.js`。

需要的變數：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

選用的測試資料庫變數：

- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_LABEL`，預設為 `測試資料庫 rooc_test`

`SUPABASE_ANON_KEY` 是公開前端金鑰，可以放在 GitHub Pages；資料庫密碼與 service role key 不可以。

正式頁面預設永遠使用 `production`。需要測試時，在網址加上 `?env=rooc_test`，例如：

- `index.html?env=rooc_test`
- `public.html?env=rooc_test`

本機或帶有 `env` 參數時，頁面右上角會顯示資料庫切換器；一般正式入口不會顯示，避免正式使用介面被誤切到測試資料庫。

前端的資料庫切換是切換 Supabase Project URL 與 anon key。若 `rooc_test` 是另一個 Supabase 專案，請填它自己的 Project URL 與 anon public key，並先在該專案套用 `supabase/schema.sql`。

## 本機使用

複製 `.env.example` 為 `.env`，填入 Supabase 設定後產生本機設定檔：

```bash
php scripts/write-config.php
```

這會產生 `config.local.js`，該檔案已被 `.gitignore` 排除，不會被提交。

安裝前端依賴並啟動 Vite：

```bash
npm install
npm run dev
```

Vite 8 需要 Node `^20.19.0` 或 `>=22.12.0`；GitHub Actions 已設定使用 Node 24。

Vite 會提供本機網址給後台與公開驗證頁使用。如果 `.env` 有填入 `SUPABASE_TEST_URL` 與 `SUPABASE_TEST_ANON_KEY`，本機頁面會出現正式/測試資料庫切換器。

舊的直接打開 `index.html` 方式仍可檢查既有靜態頁，但 Vue 元件與後續新抽獎模式請用 Vite dev server。

## GitHub Pages 部署

1. 將 repo 推到 GitHub，分支使用 `rooc`。
2. 到 GitHub repo Settings > Pages，Source 選 GitHub Actions。
3. 到 Settings > Secrets and variables > Actions > Variables 新增：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_TEST_URL`，選填
   - `SUPABASE_TEST_ANON_KEY`，選填
   - `SUPABASE_TEST_LABEL`，選填
4. push 到 `rooc` 分支後，`Deploy GitHub Pages` workflow 會安裝 Node 依賴、執行 `npm run build`，並部署 `dist/`。

如果沒有設定 repo variables，部署後會顯示尚未連線。

## 現場流程

1. 進入後台時輸入管理密碼，登入後才會載入活動、會員與紀錄資料。
2. 在成員表單按「管理職業」，新增或修改職業。
3. 建立抽獎活動，直接把當下的角色名稱名單貼入輸入框並確認解析人數。
4. 如需調整，可在新增獎項前從「本場名單」重新貼上；新增第一個獎項後名單即鎖定。
5. 新增第一批獎項；獎項提供者只會顯示本場名單成員，現場加碼時可再新增。
6. 選擇獎項後按「抽出」。
7. 對抽出結果選擇：
   - 確認得獎
   - 放棄並重抽
   - 指定轉讓給另一個可收名單中的會員
8. 活動結束後匯出 Excel。

## 檔案

- `index.html`：前端頁面
- `public.html`：公開驗證頁面
- `package.json`：Vue/Vite 依賴與 build 指令
- `vite.config.js`：Vite 多頁 build 與 legacy static copy 設定
- `src/`：Vue 入口、橋接元件與後續元件化區域
- `shared.js`：兩個頁面共用的 Supabase 環境切換與設定載入
- `app.js`：Supabase 連線與抽獎互動流程
- `public.js`：公開驗證頁互動流程
- `styles.css`：介面樣式
- `config.js`：部署時的公開 Supabase 設定
- `config.local.js`：本機設定產物，已被 git 忽略
- `.env.example`：本機設定範例
- `scripts/write-config.php`：由 `.env` 產生 `config.local.js`
- `scripts/write-runtime-config.mjs`：GitHub Actions 部署時產生 `dist/config.js`
- `supabase/schema.sql`：資料表、RLS、RPC
- `.github/workflows/deploy-pages.yml`：GitHub Pages workflow
