# TransAutumnlin Route Planner

奧鐵路線導航器 Demo52。可依起點、終點、經由站，搜尋「最少轉乘」或「最少站數」的路線。

## 最簡單的啟動方式

### Windows 已安裝 Python 3

1. 下載或解壓縮整個專案。
2. 雙擊 `啟動程式.bat`。
3. 在視窗中選擇起點、終點及需要的經由站。

程式只使用 Python 內建模組，不需要另外安裝套件。

### 使用單一 Windows EXE

GitHub Actions 會自動建立：

`TransAutumnlinRoutePlanner.exe`

下載方式：

1. 開啟 GitHub 儲存庫的 **Actions**。
2. 選擇 **Build Windows EXE**。
3. 開啟最新一次成功的執行紀錄。
4. 在 **Artifacts** 下載 `TransAutumnlinRoutePlanner-Windows`。
5. 解壓縮後直接雙擊 EXE。

## 手動建立 EXE

Windows 已安裝 Python 3 時，可雙擊：

`build_exe.bat`

完成後程式位於：

`dist/TransAutumnlinRoutePlanner.exe`

## 專案檔案

- `Demo52.py`：路線資料與最佳路徑演算法。
- `RoutePlannerGUI.py`：Tkinter 圖形介面。
- `啟動程式.bat`：有 Python 時直接雙擊啟動。
- `build_exe.bat`：在本機建立 Windows EXE。
- `tests/test_route_planner.py`：核心功能測試。
- `.github/workflows/build-windows.yml`：GitHub 自動測試與打包設定。

## 命令列版本

仍可直接執行：

```bash
python Demo52.py
```

## 系統需求

原始碼模式需要 Python 3.9 以上。GitHub Actions 建置使用 Python 3.12。
