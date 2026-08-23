param(
  [string]$ProjectRoot = "C:\Users\fbrav\OneDrive\Desktop\__DB_FILES\FLAMINGOAPP_DJ_REACT"
)

$ErrorActionPreference = "Stop"

$TrackColumns = Join-Path $ProjectRoot "src\config\trackColumns.ts"
$PlaylistDetail = Join-Path $ProjectRoot "src\pages\PlaylistDetailPage.tsx"
$TracksPage = Join-Path $ProjectRoot "src\pages\TracksPage.tsx"
$TracksTable = Join-Path $ProjectRoot "src\components\tracks\TracksTable.tsx"

foreach ($file in @($TrackColumns, $PlaylistDetail, $TracksPage, $TracksTable)) {
  if (!(Test-Path -LiteralPath $file)) {
    throw "Required file not found: $file"
  }
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = Join-Path $ProjectRoot "_dj_layout_v7_backup_$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

Copy-Item -LiteralPath $TrackColumns -Destination (Join-Path $backup "trackColumns.ts") -Force
Copy-Item -LiteralPath $PlaylistDetail -Destination (Join-Path $backup "PlaylistDetailPage.tsx") -Force
Copy-Item -LiteralPath $TracksPage -Destination (Join-Path $backup "TracksPage.tsx") -Force
Copy-Item -LiteralPath $TracksTable -Destination (Join-Path $backup "TracksTable.tsx") -Force

$TrackColumnsContent = @'
import type {
  TrackColumnDefinition,
  TrackColumnId,
} from "../types/trackColumn";

export const TRACK_COLUMNS: TrackColumnDefinition[] = [
  { id: "artwork", label: "Artwork", locked: false, defaultVisible: false },
  { id: "title", label: "Title", locked: true, defaultVisible: true },
  { id: "artist", label: "Artist", locked: true, defaultVisible: true },
  { id: "album", label: "Album", locked: false, defaultVisible: false },
  { id: "tempo", label: "BPM", locked: false, defaultVisible: true },
  { id: "musicalKey", label: "Key", locked: false, defaultVisible: true },
  { id: "camelot", label: "Camelot", locked: false, defaultVisible: false },
  { id: "energy", label: "Energy", locked: false, defaultVisible: true },
  { id: "spotifyPopularity", label: "Popularity", locked: false, defaultVisible: true },
  { id: "genre", label: "Genre", locked: false, defaultVisible: false },
  { id: "country", label: "Country", locked: false, defaultVisible: false },
  { id: "durationSeconds", label: "Duration", locked: false, defaultVisible: true },
  { id: "releaseDate", label: "Release Date", locked: false, defaultVisible: true },
  { id: "overallVolume", label: "Overall Volume", locked: false, defaultVisible: false },
  { id: "rating", label: "Rating", locked: false, defaultVisible: false },
  { id: "folder", label: "Folder", locked: false, defaultVisible: false },
  { id: "dateAdded", label: "Date Added", locked: false, defaultVisible: false },
];

export const DEFAULT_VISIBLE_TRACK_COLUMNS: TrackColumnId[] =
  TRACK_COLUMNS.filter(
    (column: TrackColumnDefinition) => column.defaultVisible,
  ).map(
    (column: TrackColumnDefinition) => column.id,
  );

export const LOCKED_TRACK_COLUMNS: TrackColumnId[] =
  TRACK_COLUMNS.filter(
    (column: TrackColumnDefinition) => column.locked,
  ).map(
    (column: TrackColumnDefinition) => column.id,
  );
'@

Set-Content -LiteralPath $TrackColumns -Value $TrackColumnsContent -Encoding UTF8

function Update-VisibleKey([string]$Path) {
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $text = [regex]::Replace(
    $text,
    '"flamingo-dj-visible-track-columns(?:-v\d+)?"',
    '"flamingo-dj-visible-track-columns-v7"'
  )
  Set-Content -LiteralPath $Path -Value $text -Encoding UTF8
}

Update-VisibleKey $PlaylistDetail
Update-VisibleKey $TracksPage

$tableText = Get-Content -LiteralPath $TracksTable -Raw -Encoding UTF8
$tableText = [regex]::Replace(
  $tableText,
  '"flamingo-dj-track-column-order(?:-v\d+)?"',
  '"flamingo-dj-track-column-order-v7"'
)
$tableText = [regex]::Replace(
  $tableText,
  '"flamingo-dj-track-column-widths(?:-v\d+)?"',
  '"flamingo-dj-track-column-widths-v7"'
)
Set-Content -LiteralPath $TracksTable -Value $tableText -Encoding UTF8

Write-Host ""
Write-Host "SUCCESS - DJ layout V7 installed"
Write-Host "Backup: $backup"
Write-Host ""
Write-Host "Default columns:"
Write-Host "Title | Artist | Duration | Popularity | Key | BPM | Energy | Release Date"
Write-Host ""
Write-Host "Now run:"
Write-Host "npm run build"
