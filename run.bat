@echo off
echo ============================================
echo  Rudar Tracker - pokretanje servera
echo ============================================
cd /d "%~dp0"

:: Provjeri Python 3.12 putem py launchera
py -3.12 --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo GRESKA: Python 3.12 nije pronadjen!
    echo.
    echo Instaliraj Python 3.12 s:
    echo https://www.python.org/downloads/release/python-3128/
    echo.
    echo Obavezno oznaci "Add Python to PATH" pri instalaciji.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('py -3.12 -c "import sys; print(sys.executable)"') do set PYTHON=%%i
echo Koristim Python: %PYTHON%

:: Kreiraj venv ako ne postoji
if not exist "venv\Scripts\activate.bat" (
    echo [1/4] Kreiranje virtualnog okruzenja s Python 3.12...
    "%PYTHON%" -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo GRESKA pri kreiranju venv-a!
        pause
        exit /b 1
    )
)

echo [2/4] Aktivacija virtualnog okruzenja...
call venv\Scripts\activate.bat

echo [3/4] Instalacija paketa...
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo GRESKA pri instalaciji paketa!
    pause
    exit /b 1
)

echo [4/4] Instalacija Playwright browsera (samo prvi put)...
python -m playwright install chromium
if %ERRORLEVEL% neq 0 (
    echo GRESKA pri instalaciji Chromium-a!
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Server pokrenut na: http://localhost:8000
echo  Zatvori ovaj prozor da zaustavi server.
echo ============================================
echo.

python -m uvicorn app:app --host 0.0.0.0 --port 8000

pause
