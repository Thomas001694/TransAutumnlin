@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM 建立獨立虛擬環境，避免污染電腦原有 Python 套件。
py -3 -m venv .venv
if errorlevel 1 goto :error

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install pyinstaller

REM 產生單一檔案、無終端機視窗的 Windows EXE。
pyinstaller --noconfirm --clean --onefile --windowed ^
    --name TransAutumnlinRoutePlanner ^
    RoutePlannerGUI.py
if errorlevel 1 goto :error

echo.
echo 建置完成：dist\TransAutumnlinRoutePlanner.exe
pause
exit /b 0

:error
echo.
echo 建置失敗，請檢查上方錯誤訊息。
pause
exit /b 1
