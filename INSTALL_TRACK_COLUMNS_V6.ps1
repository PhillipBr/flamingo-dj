param(
    [string]$ProjectRoot = "C:\Users\fbrav\OneDrive\Desktop\__DB_FILES\FLAMINGOAPP_DJ_REACT"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================"
Write-Host "FLAMINGO DJ - TRACK COLUMNS V6 FIX"
Write-Host "============================================================"
Write-Host "Project: $ProjectRoot"
Write-Host ""

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$SourceTrackColumns = Join-Path $PackageRoot "src\config\trackColumns.ts"
$TargetTrackColumns = Join-Path $ProjectRoot "src\config\trackColumns.ts"

$PlaylistPage = Join-Path $ProjectRoot "src\pages\PlaylistDetailPage.tsx"
$TracksPage = Join-Path $ProjectRoot "src\pages\TracksPage.tsx"
$TracksTable = Join-Path $ProjectRoot "src\components\tracks\TracksTable.tsx"

foreach ($Path in @(
    $SourceTrackColumns,
    $TargetTrackColumns,
    $PlaylistPage,
    $TracksPage,
    $TracksTable
)) {
    if (!(Test-Path $Path)) {
        throw "Required file not found: $Path"
    }
}

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = Join-Path $ProjectRoot "_track_columns_v6_backup_$Stamp"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $BackupDir |
    Out-Null

Write-Host "Creating backup..."

Copy-Item `
    $TargetTrackColumns `
    (Join-Path $BackupDir "trackColumns.ts") `
    -Force

Copy-Item `
    $PlaylistPage `
    (Join-Path $BackupDir "PlaylistDetailPage.tsx") `
    -Force

Copy-Item `
    $TracksPage `
    (Join-Path $BackupDir "TracksPage.tsx") `
    -Force

Copy-Item `
    $TracksTable `
    (Join-Path $BackupDir "TracksTable.tsx") `
    -Force

Write-Host "Backup: $BackupDir"
Write-Host ""

Write-Host "1/4 Replacing trackColumns.ts..."

Copy-Item `
    $SourceTrackColumns `
    $TargetTrackColumns `
    -Force

Write-Host "OK"
Write-Host ""

Write-Host "2/4 Updating PlaylistDetailPage storage key..."

$Text = Get-Content `
    -LiteralPath $PlaylistPage `
    -Raw `
    -Encoding UTF8

$Text = $Text.Replace(
    '"flamingo-dj-visible-track-columns"',
    '"flamingo-dj-visible-track-columns-v7"'
)

Set-Content `
    -LiteralPath $PlaylistPage `
    -Value $Text `
    -Encoding UTF8

Write-Host "OK"
Write-Host ""

Write-Host "3/4 Updating TracksPage storage key..."

$Text = Get-Content `
    -LiteralPath $TracksPage `
    -Raw `
    -Encoding UTF8

$Text = $Text.Replace(
    '"flamingo-dj-visible-track-columns"',
    '"flamingo-dj-visible-track-columns-v7"'
)

Set-Content `
    -LiteralPath $TracksPage `
    -Value $Text `
    -Encoding UTF8

Write-Host "OK"
Write-Host ""

Write-Host "4/4 Updating TracksTable layout cache keys..."

$Text = Get-Content `
    -LiteralPath $TracksTable `
    -Raw `
    -Encoding UTF8

$Text = $Text.Replace(
    '"flamingo-dj-track-column-order"',
    '"flamingo-dj-track-column-order-v7"'
)

$Text = $Text.Replace(
    '"flamingo-dj-track-column-widths"',
    '"flamingo-dj-track-column-widths-v7"'
)

Set-Content `
    -LiteralPath $TracksTable `
    -Value $Text `
    -Encoding UTF8

Write-Host "OK"
Write-Host ""

Write-Host "FINAL DEFAULT COLUMNS:"
Write-Host "  Title"
Write-Host "  Artist"
Write-Host "  Duration"
Write-Host "  Popularity"
Write-Host "  Key"
Write-Host "  BPM"
Write-Host "  Energy"
Write-Host "  Release Date"
Write-Host ""
Write-Host "NOT DEFAULT:"
Write-Host "  Artwork"
Write-Host "  Album"
Write-Host "  Camelot"
Write-Host "  Genre"
Write-Host "  Country"
Write-Host "  Overall Volume"
Write-Host "  Rating"
Write-Host "  Folder"
Write-Host "  Date Added"
Write-Host ""
Write-Host "Now run:"
Write-Host "  npm run build"
Write-Host ""
