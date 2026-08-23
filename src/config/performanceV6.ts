/*
 * Flamingo DJ V6 performance rules.
 *
 * Initial table data:
 * - Title
 * - Artist
 * - Duration
 * - Popularity
 * - Key
 * - BPM
 * - Energy
 * - ReleaseDate
 *
 * Everything else is EXTRA and can be hydrated lazily.
 */

export const CORE_TRACK_COLUMN_IDS =
  new Set<string>([
    "title",
    "artist",
    "duration",
    "durationSeconds",
    "spotifyPopularity",
    "popularity",
    "musicalKey",
    "key",
    "tempo",
    "bpm",
    "energy",
    "releaseDate",
  ]);


export function isCoreTrackColumn(
  columnId: string,
): boolean {
  return CORE_TRACK_COLUMN_IDS.has(
    columnId,
  );
}
