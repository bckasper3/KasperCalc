@echo off
cd /d "%~dp0"

echo Installing/checking dependencies (first run only takes a minute)...
python -m pip install -r requirements.txt --quiet

echo Starting backend server (port 8000)...
start "MHBK5 Digitizer - Backend" cmd /k "python -m uvicorn backend.app:app --reload"

timeout /t 3 /nobreak >nul

echo Starting frontend server (port 8080)...
start "MHBK5 Digitizer - Frontend" cmd /k "python frontend\serve.py 8080"

timeout /t 2 /nobreak >nul

echo Opening in browser...
start http://127.0.0.1:8080/index.html

echo.
echo Two black windows opened - those are the servers. Leave them running.
echo Close this window or press any key to exit this launcher (servers keep running).
pause >nul
