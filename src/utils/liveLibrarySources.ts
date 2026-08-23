import type { Playlist } from "../types/playlist";
import type { Track } from "../types/track";

export type TrackSource = {
  playlistId: string;
  playlistName: string;
  category: string | null;
};

export type LibraryTrackSourceMap = Map<
  string,
  TrackSource[]
>;

export function buildLibraryTrackSourceMap(
  playlists: readonly Playlist[],
): LibraryTrackSourceMap {
  const result: LibraryTrackSourceMap =
    new Map();

  playlists.forEach((playlist) => {
    playlist.trackIds.forEach((trackId) => {
      const current =
        result.get(trackId) ?? [];

      current.push({
        playlistId: playlist.id,
        playlistName: playlist.name,
        category:
          playlist.category?.trim() ||
          null,
      });

      result.set(trackId, current);
    });
  });

  return result;
}

export function getTrackSources(
  trackId: string,
  sourceMap: LibraryTrackSourceMap,
): TrackSource[] {
  return sourceMap.get(trackId) ?? [];
}

export function getPrimaryTrackSource(
  trackId: string,
  sourceMap: LibraryTrackSourceMap,
): TrackSource | null {
  return (
    getTrackSources(
      trackId,
      sourceMap,
    )[0] ?? null
  );
}

export function getLibraryCoverage(
  tracks: readonly Track[],
  sourceMap: LibraryTrackSourceMap,
): {
  totalTracks: number;
  playlistTracks: number;
  unassignedTracks: number;
} {
  const playlistTracks =
    tracks.reduce(
      (count, track) =>
        sourceMap.has(track.id)
          ? count + 1
          : count,
      0,
    );

  return {
    totalTracks: tracks.length,
    playlistTracks,
    unassignedTracks:
      tracks.length - playlistTracks,
  };
}
