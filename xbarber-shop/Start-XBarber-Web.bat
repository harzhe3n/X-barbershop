@echo off
title XBARBER SHOP - Local Web Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install Node.js from https://nodejs.org/ first.
    pause
    exit /b 1
)

node server.js
pause
