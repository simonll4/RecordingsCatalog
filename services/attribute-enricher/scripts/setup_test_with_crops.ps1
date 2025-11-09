# PowerShell script to use crops from improved_project as frames
# This uses the actual cropped detections instead of full frames

$ErrorActionPreference = "Stop"

Write-Host "Setting up test frames using crops from improved_project..." -ForegroundColor Cyan

# Paths
$ImprovedProjectCropsDir = "..\improved_project\data\outputs\crops"
$SessionId = "test_session_001"
$FramesDir = ".\data\frames\$SessionId"

# Create frames directory
New-Item -ItemType Directory -Force -Path $FramesDir | Out-Null

# Check if source crops exist
if (-not (Test-Path "$ImprovedProjectCropsDir\01_person_0.jpg")) {
    Write-Host "Error: Crop images not found at $ImprovedProjectCropsDir" -ForegroundColor Red
    Write-Host "Make sure you've run the detector in improved_project first" -ForegroundColor Yellow
    exit 1
}

# Copy crops as frames
# Using person detections from each image
Write-Host "Copying person detection crops..." -ForegroundColor Yellow

# Image 01 - person detection
if (Test-Path "$ImprovedProjectCropsDir\01_person_0.jpg") {
    Copy-Item "$ImprovedProjectCropsDir\01_person_0.jpg" -Destination "$FramesDir\track_1.jpg" -Force
    Write-Host "  ✓ track_1.jpg (from 01_person_0.jpg)" -ForegroundColor Green
} else {
    Write-Host "  ✗ 01_person_0.jpg not found" -ForegroundColor Red
}

# Image 02 - person detection
if (Test-Path "$ImprovedProjectCropsDir\02_person_0.jpg") {
    Copy-Item "$ImprovedProjectCropsDir\02_person_0.jpg" -Destination "$FramesDir\track_2.jpg" -Force
    Write-Host "  ✓ track_2.jpg (from 02_person_0.jpg)" -ForegroundColor Green
} else {
    Write-Host "  ✗ 02_person_0.jpg not found" -ForegroundColor Red
}

# Image 03 - person detection
if (Test-Path "$ImprovedProjectCropsDir\03_person_0.jpg") {
    Copy-Item "$ImprovedProjectCropsDir\03_person_0.jpg" -Destination "$FramesDir\track_3.jpg" -Force
    Write-Host "  ✓ track_3.jpg (from 03_person_0.jpg)" -ForegroundColor Green
} else {
    Write-Host "  ✗ 03_person_0.jpg not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Test frames copied successfully!" -ForegroundColor Green
Write-Host "Created:" -ForegroundColor Cyan
Get-ChildItem $FramesDir | Format-Table Name, Length, LastWriteTime

Write-Host ""
Write-Host "Note: These are CROPPED images (not full frames)" -ForegroundColor Yellow
Write-Host "The bbox in the database should be adjusted to cover the whole crop:" -ForegroundColor Yellow
Write-Host '  bbox: {"x": 0.5, "y": 0.5, "w": 1.0, "h": 1.0}' -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update database with full-crop bboxes" -ForegroundColor White
Write-Host "2. Restart attribute-enricher: docker-compose restart attribute-enricher" -ForegroundColor White
Write-Host "3. View logs: docker-compose logs -f attribute-enricher" -ForegroundColor White

