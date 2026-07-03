# ROOC 抽獎控制台

GitHub Pages 靜態前端搭配 Supabase Postgres/RPC 的會員池抽獎系統。

## 核心規則

- 參加者來自 Supabase 的 `rooc_members` 會員表。
- 成員可啟用/停用；停用成員不會進入可抽名單。
- 每場抽獎活動中，同一人只能被處理一次。
- 已確認得獎、放棄重抽、原抽中後轉讓、被指定轉讓的人，都會進入該場活動的排除名單。
- 被指定轉讓的人必須是啟用中且尚未被排除的會員。
- 獎項可有多個名額。
- 抽獎過程中可以隨時新增獎項，用於現場加碼。
- 系統保留中獎名單、抽獎時間、抽獎批次、抽獎 token、轉讓/放棄紀錄，並可匯出 CSV。

## Supabase Project

目前使用的 project：

- Name: `rooc`
- Project ID: `euzosifslqchutznteqc`
- Region: `ap-northeast-1`

不要把資料庫密碼或 service role key 放進 repo、GitHub Pages、`config.js`。前端只需要 Project URL 與 anon public key。

## 資料表

- `rooc_members`：會員池
  - `member_no`：編號
  - `display_name`：顯示名稱
  - `occupation`：職業
  - `role_id`：角色 ID
  - `joined_dc`：是否加入 DC
  - `is_active`：是否啟用
- `raffle_events`：抽獎活動
- `raffle_prizes`：獎項與提供者
- `raffle_draws`：每一次抽出與處理結果
- `raffle_exclusions`：每場活動的排除名單
- `raffle_app_config`：成員管理 PIN

所有前端操作都透過 RPC 執行。資料表已啟用 RLS 並撤銷 anon/authenticated 的直接表格存取。

## Supabase 初始化

可用兩種方式套用 schema：

1. 由 Codex 使用 Supabase connector 執行 migration。
2. 手動到 Supabase SQL Editor 執行 `supabase/schema.sql`。

第一次使用「成員」頁時，輸入一組成員管理 PIN。若尚未初始化，系統會建立；若已初始化，則會驗證該 PIN。

## 設定方式

前端不需要在畫面貼 Supabase 設定。正式部署時，GitHub Actions 會用 repo variables 產生 `config.js`。

需要的變數：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

`SUPABASE_ANON_KEY` 是公開前端金鑰，可以放在 GitHub Pages；資料庫密碼與 service role key 不可以。

## 本機使用

複製 `.env.example` 為 `.env`，填入 Supabase 設定後產生本機設定檔：

```bash
php scripts/write-config.php
```

這會產生 `config.local.js`，該檔案已被 `.gitignore` 排除，不會被提交。

之後直接用瀏覽器打開 `index.html`。

## GitHub Pages 部署

1. 將 repo 推到 GitHub，分支使用 `rooc`。
2. 到 GitHub repo Settings > Pages，Source 選 GitHub Actions。
3. 到 Settings > Secrets and variables > Actions > Variables 新增：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. push 到 `rooc` 分支後，`Deploy GitHub Pages` workflow 會自動部署。

如果沒有設定 repo variables，部署後會顯示尚未連線。

## 現場流程

1. 到「成員」建立或登入成員管理 PIN。
2. 新增/更新會員，或停用不參加的人。
3. 到「活動/獎項」建立抽獎活動。
4. 到「抽獎控制台」載入活動。
5. 新增第一批獎項；現場加碼時可再新增。
6. 選擇獎項後按「抽出」。
7. 對抽出結果選擇：
   - 確認得獎
   - 放棄並重抽
   - 指定轉讓給另一個可收名單中的會員
8. 活動結束後匯出 CSV。

## 檔案

- `index.html`：前端頁面
- `app.js`：Supabase 連線與抽獎互動流程
- `styles.css`：介面樣式
- `config.js`：部署時的公開 Supabase 設定
- `config.local.js`：本機設定產物，已被 git 忽略
- `.env.example`：本機設定範例
- `scripts/write-config.php`：由 `.env` 產生 `config.local.js`
- `supabase/schema.sql`：資料表、RLS、RPC
- `.github/workflows/deploy-pages.yml`：GitHub Pages workflow
