@echo off
cd /d "%~dp0.."
.venv\Scripts\python -m flask --app fabi create-admin
pause
