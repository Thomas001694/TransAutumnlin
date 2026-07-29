# TransAutumnlin Route Planner Web

奧鐵路線導航器 Demo52 的純網頁版本，可直接部署到 GitHub Pages。

## 功能

- 起點、終點與可選經由站
- 最少轉乘／最少站數
- 禁止在非轉乘站換線
- 重疊路線區間辨識
- 響應式手機與電腦介面
- 第一次開啟後可離線使用
- 支援安裝成 PWA（瀏覽器支援時顯示「安裝到裝置」）

## 部署到 GitHub Pages

1. 將本專案全部檔案上傳到 GitHub 儲存庫根目錄。
2. 進入儲存庫的 **Settings → Pages**。
3. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
4. 進入 **Actions**，等待 `Deploy GitHub Pages` 顯示綠色勾勾。
5. 部署網址通常是：

   `https://你的帳號.github.io/儲存庫名稱/`

例如儲存庫是 `Thomas001694/TransAutumnlin-Route-Planner`：

`https://thomas001694.github.io/TransAutumnlin-Route-Planner/`

## 主要檔案

- `index.html`：網頁結構
- `styles.css`：介面樣式
- `route-data.js`：路線與轉乘站資料
- `app.js`：Demo52 搜尋演算法與介面操作
- `service-worker.js`：離線快取
- `manifest.webmanifest`：PWA 安裝資訊
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自動部署

## 本機預覽

由於網頁使用 JavaScript 模組，請使用簡單 HTTP 伺服器，不要直接雙擊 `index.html`：

```bash
python -m http.server 8000
```

然後開啟：

`http://localhost:8000/`
