# PowerShell script to copy test images from improved_project to the frames directory

$ErrorActionPreference = "Stop"

Write-Host "Setting up test frames for attribute enricher..." -ForegroundColor Cyan

# Paths (desde el directorio raíz de RecordingsCatalog)
$ImprovedProjectDir = "..\improved_project\data\inputs"
$SessionId = "test_session_001"
$FramesDir = ".\data\frames\$SessionId"

# Create frames directory
New-Item -ItemType Directory -Force -Path $FramesDir | Out-Null

# Check if source images exist
if (-not (Test-Path "$ImprovedProjectDir\01.jpg")) {
    Write-Host "Error: Source images not found at $ImprovedProjectDir" -ForegroundColor Red
    exit 1
}

# Copy images with the correct naming: track_{id}.jpg
Write-Host "Copying test images..." -ForegroundColor Yellow
Copy-Item "$ImprovedProjectDir\01.jpg" -Destination "$FramesDir\track_1.jpg" -Force
Copy-Item "$ImprovedProjectDir\02.jpg" -Destination "$FramesDir\track_2.jpg" -Force
Copy-Item "$ImprovedProjectDir\03.jpg" -Destination "$FramesDir\track_3.jpg" -Force

Write-Host "Test frames copied successfully!" -ForegroundColor Green
Write-Host "Created:" -ForegroundColor Cyan
Get-ChildItem $FramesDir | Format-Table Name, Length, LastWriteTime

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run the SQL script: " -NoNewline
Write-Host "psql -h localhost -p 15432 -U postgres -d session_store -f scripts/setup_test_data.sql" -ForegroundColor White
Write-Host "2. Start the attribute-enricher service with docker-compose" -ForegroundColor White
Write-Host "3. Check the database for enriched attributes" -ForegroundColor White

