# ROOC 抽獎系統

GitHub Pages 靜態前端搭配 Supabase Postgres/RPC 的抽獎系統。

## 功能

- 建立抽獎活動、設定抽獎代碼與中獎名額
- 公開報名頁面
- 管理 PIN 驗證
- 隨機開獎並固定中獎名單
- GitHub Actions 部署到 GitHub Pages

## Supabase

1. 建立 Supabase project。
2. 到 SQL Editor 執行 `supabase/schema.sql`。
3. 到 Project Settings > API 取得 Project URL 與 anon public key。

資料表已啟用 RLS，瀏覽器只需要 anon key。管理動作透過 Postgres RPC 驗證管理 PIN，不要把 service role key 放到前端或 GitHub Pages。

## 本機使用

直接用瀏覽器打開 `index.html`。

第一次使用時到「設定」填入 Supabase Project URL 與 anon key。設定會存在瀏覽器 localStorage。

## GitHub Pages 部署

1. 將此 repo 推到 GitHub，分支使用 `rooc`。
2. 到 GitHub repo Settings > Pages，Source 選 GitHub Actions。
3. 到 Settings > Secrets and variables > Actions > Variables 新增：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. push 到 `rooc` 分支後，`Deploy GitHub Pages` workflow 會自動部署。

如果沒有設定 repo variables，workflow 會使用 repo 內的 `config.js`。anon key 是公開前端金鑰，可以放在 GitHub Pages；service role key 不可以。

## 抽獎流程

1. 管理者在「建立/管理」建立活動。
2. 複製分享連結給參加者。
3. 參加者在公開頁面報名。
4. 管理者用抽獎代碼與 PIN 載入活動後按「開獎」。

## 檔案

- `index.html`：前端頁面
- `app.js`：Supabase 連線與互動流程
- `styles.css`：介面樣式
- `config.js`：部署時的公開 Supabase 設定
- `supabase/schema.sql`：資料表、RLS、RPC
- `.github/workflows/deploy-pages.yml`：GitHub Pages workflow
