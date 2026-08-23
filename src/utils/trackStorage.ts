import type { Track } from "../types/track";
import { hydrateTrackExtras, loadCoreTracks } from "./normalizedCatalog";

const OLD_CACHE_KEYS = [
  "flamingo-dj-tracks",
  "flamingo-dj-library-tracks",
];

export function loadTracks(): Track[] {
  for (const key of OLD_CACHE_KEYS) localStorage.removeItem(key);
  return loadCoreTracks();
}

export async function loadTrackExtras(
  tracks: Track[],
  ids: Iterable<string>,
): Promise<Track[]> {
  return hydrateTrackExtras(tracks, ids);
}

export function saveTracks(_tracks: Track[]): void {
  window.dispatchEvent(new Event("flamingo-dj-tracks-updated"));
}
