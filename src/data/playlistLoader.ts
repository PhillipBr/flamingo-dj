import type { Track } from "../types/track";

export type PlaylistJson = {
  schemaVersion: number;

  playlistId: string;
  playlistName: string;
  description: string | null;

  totalTracks: number;
  generatedAt: string;

  filters?: Record<string, unknown>;

  sort?: {
    field: string;
    descending: boolean;
  };

  tracks: Track[];

  source?: Record<string, unknown>;
};

export type LoadedPlaylist =
  PlaylistJson & {
    fileName: string;
    filePath: string;
  };

type JsonModule = {
  default: unknown;
};

const playlistModules =
  import.meta.glob<JsonModule>(
    "./JSON/playlists/*.json",
    {
      eager: true,
    },
  );

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isTrackLike(
  value: unknown,
): value is Track {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.artist === "string"
  );
}

function isPlaylistJson(
  value: unknown,
): value is PlaylistJson {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.schemaVersion === "number" &&
    typeof value.playlistId === "string" &&
    typeof value.playlistName === "string" &&
    typeof value.totalTracks === "number" &&
    typeof value.generatedAt === "string" &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isTrackLike)
  );
}

function getJsonFileName(
  filePath: string,
): string {
  return (
    filePath
      .split("/")
      .pop()
      ?.replace(/\.json$/i, "") ??
    filePath
  );
}

function loadJsonPlaylists():
  LoadedPlaylist[] {
  const loadedPlaylists:
    LoadedPlaylist[] = [];

  for (
    const [
      filePath,
      jsonModule,
    ] of Object.entries(
      playlistModules,
    )
  ) {
    const jsonData =
      jsonModule.default;

    if (!isPlaylistJson(jsonData)) {
      console.warn(
        `JSON omitido porque no tiene formato válido de playlist: ${filePath}`,
      );

      continue;
    }

    loadedPlaylists.push({
      ...jsonData,

      fileName:
        getJsonFileName(filePath),

      filePath,
    });
  }

  return loadedPlaylists.sort(
    (
      firstPlaylist,
      secondPlaylist,
    ) =>
      firstPlaylist.playlistName
        .localeCompare(
          secondPlaylist.playlistName,
        ),
  );
}

export const jsonPlaylists:
  LoadedPlaylist[] =
  loadJsonPlaylists();

/**
 * Alias de compatibilidad.
 *
 * Permite que archivos antiguos sigan usando:
 *
 * import { playlists } from "./playlistLoader";
 */
export const playlists:
  LoadedPlaylist[] =
  jsonPlaylists;

export const jsonPlaylistMap =
  new Map<
    string,
    LoadedPlaylist
  >(
    jsonPlaylists.map(
      (playlist) => [
        playlist.playlistId,
        playlist,
      ],
    ),
  );

/**
 * Combina todos los tracks presentes
 * en todas las playlists JSON.
 *
 * Si una canción aparece en varias
 * playlists, se conserva una sola copia
 * utilizando track.id.
 */
export const allJsonTracks:
  Track[] = Array.from(
    new Map<string, Track>(
      jsonPlaylists
        .flatMap(
          (playlist) =>
            playlist.tracks,
        )
        .map(
          (track) => [
            track.id,
            track,
          ],
        ),
    ).values(),
  );

export function getJsonPlaylistById(
  playlistId: string,
): LoadedPlaylist | undefined {
  return jsonPlaylistMap.get(
    playlistId,
  );
}

export function getJsonPlaylistTracks(
  playlistId: string,
): Track[] {
  return (
    getJsonPlaylistById(
      playlistId,
    )?.tracks ?? []
  );
}