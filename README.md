# 奧鐵路線導航器（網頁版）

純 HTML、CSS、JavaScript 的 GitHub Pages 網頁程式。

## 功能

- 起點、終點、經由站可直接打字。
- 輸入時由瀏覽器顯示車站名稱建議。
- 可選最少轉乘或最少站數。
- 可交換起終點。
- 可安裝成 PWA，並支援離線使用。
- 不需要 Python、資料庫或後端伺服器。

## 上傳到 GitHub

將本專案所有檔案放在儲存庫根目錄，至少包含：

```text
index.html
styles.css
app.js
route-data.js
service-worker.js
manifest.webmanifest
icons/
```

接著進入：

```text
Settings → Pages
```

設定：

```text
Source: Deploy from a branch
Branch: main
Folder: /(root)
```

## 更新後網頁沒變

本版已將離線快取改成網路優先，並把快取版本提高為 `v2`。
若瀏覽器仍顯示舊版，可按 `Ctrl + F5`，或清除該網站的儲存空間後重新開啟。

## 本機測試

需要 Node.js：

```bash
npm test
```
