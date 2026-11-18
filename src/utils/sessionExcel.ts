import type { PlayedEntry } from "../types/playedSession";

/** Real .xlsx export via SheetJS. Install dependency with npm install xlsx. */
export async function exportPlayedSessionExcel(entries: PlayedEntry[], startedAt: string | null): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = entries.map((entry) => ({
    "Play Order": entry.playOrder,
    SongID: entry.songId,
    Title: entry.title,
    Artist: entry.artist,
    Playlist_Name: entry.playlistName,
    Played_At: entry.playedAt,
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 42 }, { wch: 32 }, { wch: 32 }, { wch: 24 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Played Tracks");
  const stamp = (startedAt ?? new Date().toISOString()).replace(/[:.]/g, "-");
  XLSX.writeFile(workbook, `FLAMINGO_DJ_SESSION_${stamp}.xlsx`);
}
