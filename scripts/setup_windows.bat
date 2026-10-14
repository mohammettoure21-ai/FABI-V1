@echo off
cd /d "%~dp0.."
py -3 -m venv .venv
if errorlevel 1 goto error
.venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 goto error
.venv\Scripts\python -m flask --app fabi init-db
if errorlevel 1 goto error
.venv\Scripts\python -m pytest -q
if errorlevel 1 goto error
echo Installation terminee. Creez votre compte avec creer_admin.bat.
pause
exit /b 0
:error
echo Installation interrompue. Consultez le message ci-dessus.
pause
exit /b 1
