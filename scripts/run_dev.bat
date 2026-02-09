@echo off
echo Running Build...
call npm run build
if %errorlevel% neq 0 (
    echo Build Failed.
    exit /b %errorlevel%
)
echo Build Successful. Starting...
call npm start
