Write-Host "Running Build..."
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build Successful. Starting..."
    npm start
} else {
    Write-Host "Build Failed. Please fix errors before starting."
    exit 1
}
