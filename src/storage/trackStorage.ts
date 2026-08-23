import {
  allJsonTracks,
} from "../data/playlistLoader";

import type {
  ArtistDetails,
  Track,
} from "../types/track";

export const TRACKS_STORAGE_KEY =
  "flamingo-dj-tracks";

type UnknownRecord =
  Record<string, unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function toNullableString(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function toRequiredString(
  value: unknown,
  fallback = "",
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned =
    value.trim();

  return cleaned || fallback;
}

function toNullableNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsedValue =
      Number(value);

    if (
      Number.isFinite(
        parsedValue,
      )
    ) {
      return parsedValue;
    }
  }

  return null;
}

function toStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .map(
          (item) =>
            item.trim(),
        )
        .filter(Boolean),
    ),
  );
}

function parseArtistDetails(
  value: unknown,
): ArtistDetails | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    artistId:
      toNullableString(
        value.artistId,
      ),

    imageUrl:
      toNullableString(
        value.imageUrl,
      ),

    genres:
      toStringArray(
        value.genres,
      ),

    country:
      toNullableString(
        value.country,
      ),

    spotifyUrl:
      toNullableString(
        value.spotifyUrl,
      ),

    musicBrainzId:
      toNullableString(
        value.musicBrainzId,
      ),

    popularity:
      toNullableNumber(
        value.popularity,
      ),

    followers:
      toNullableNumber(
        value.followers,
      ),
  };
}

function parseTrack(
  value: unknown,
): Track | null {
  if (!isRecord(value)) {
    return null;
  }

  const id =
    toRequiredString(
      value.id,
    );

  const title =
    toRequiredString(
      value.title,
    );

  const artist =
    toRequiredString(
      value.artist,
    );

  if (
    !id ||
    !title ||
    !artist
  ) {
    return null;
  }

  return {
    id,

    externalSongId:
      toNullableString(
        value.externalSongId,
      ),

    title,
    artist,

    album:
      toNullableString(
        value.album,
      ),

    artworkUrl:
      toNullableString(
        value.artworkUrl,
      ),

    durationSeconds:
      toNullableNumber(
        value.durationSeconds,
      ),

    releaseDate:
      toNullableString(
        value.releaseDate,
      ),

    genre:
      toNullableString(
        value.genre,
      ),

    country:
      toNullableString(
        value.country,
      ),

    spotifyPopularity:
      toNullableNumber(
        value.spotifyPopularity,
      ),

    spotifyUrl:
      toNullableString(
        value.spotifyUrl,
      ),

    tempo:
      toNullableNumber(
        value.tempo,
      ),

    musicalKey:
      toNullableString(
        value.musicalKey,
      ),

    energy:
      toNullableNumber(
        value.energy,
      ),

    overallVolume:
      toNullableNumber(
        value.overallVolume,
      ),

    cuePoints:
      toNullableString(
        value.cuePoints,
      ),

    keywords:
      toStringArray(
        value.keywords,
      ),

    comments:
      toNullableString(
        value.comments,
      ),

    folder:
      toNullableString(
        value.folder,
      ),

    dateAdded:
      toNullableString(
        value.dateAdded,
      ),

    rating:
      toNullableNumber(
        value.rating,
      ),

    artistDetails:
      parseArtistDetails(
        value.artistDetails,
      ),
  };
}

function cloneArtistDetails(
  artistDetails:
    ArtistDetails | null,
): ArtistDetails | null {
  if (!artistDetails) {
    return null;
  }

  return {
    ...artistDetails,

    genres: [
      ...artistDetails.genres,
    ],
  };
}

function cloneTrack(
  track: Track,
): Track {
  return {
    ...track,

    keywords: [
      ...track.keywords,
    ],

    artistDetails:
      cloneArtistDetails(
        track.artistDetails,
      ),
  };
}

function getDefaultTracks():
  Track[] {
  return allJsonTracks.map(
    cloneTrack,
  );
}

function parseStoredTracks(
  value: unknown,
): Track[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseTrack)
    .filter(
      (
        track,
      ): track is Track =>
        track !== null,
    );
}

/**
 * Los datos técnicos y musicales siempre
 * se actualizan desde los JSON.
 *
 * Solo se conservan desde localStorage
 * los campos que pueden editarse desde
 * la aplicación.
 */
function mergeTrack(
  jsonTrack: Track,
  storedTrack:
    Track | undefined,
): Track {
  if (!storedTrack) {
    return cloneTrack(
      jsonTrack,
    );
  }

  return {
    /*
     * La información principal procede
     * siempre del JSON actualizado.
     */
    ...cloneTrack(
      jsonTrack,
    ),

    /*
     * Campos editables localmente.
     */
    comments:
      storedTrack.comments ??
      jsonTrack.comments,

    rating:
      storedTrack.rating ??
      jsonTrack.rating,

    /*
     * Conserva keywords locales solamente
     * cuando tengan contenido.
     */
    keywords:
      storedTrack.keywords.length >
      0
        ? [
            ...storedTrack.keywords,
          ]
        : [
            ...jsonTrack.keywords,
          ],
  };
}

function mergeTracks(
  jsonTracks: Track[],
  storedTracks: Track[],
): Track[] {
  const storedTrackMap =
    new Map<
      string,
      Track
    >(
      storedTracks.map(
        (track) => [
          track.id,
          track,
        ],
      ),
    );

  /*
   * Los tracks actuales del JSON son
   * siempre el catálogo principal.
   */
  return jsonTracks.map(
    (jsonTrack) =>
      mergeTrack(
        jsonTrack,
        storedTrackMap.get(
          jsonTrack.id,
        ),
      ),
  );
}

export function loadTracks():
  Track[] {
  const defaultTracks =
    getDefaultTracks();

  try {
    const storedValue =
      localStorage.getItem(
        TRACKS_STORAGE_KEY,
      );

    if (!storedValue) {
      saveTracks(
        defaultTracks,
      );

      return defaultTracks;
    }

    const parsedValue:
      unknown =
      JSON.parse(
        storedValue,
      );

    const storedTracks =
      parseStoredTracks(
        parsedValue,
      );

    const mergedTracks =
      mergeTracks(
        defaultTracks,
        storedTracks,
      );

    saveTracks(
      mergedTracks,
    );

    return mergedTracks;
  } catch (error) {
    console.error(
      "Unable to load tracks from localStorage. JSON tracks will be used.",
      error,
    );

    saveTracks(
      defaultTracks,
    );

    return defaultTracks;
  }
}

export function saveTracks(
  tracks: Track[],
): void {
  try {
    localStorage.setItem(
      TRACKS_STORAGE_KEY,
      JSON.stringify(
        tracks,
      ),
    );
  } catch (error) {
    console.error(
      "Unable to save tracks to localStorage.",
      error,
    );
  }
}

export function resetTracks():
  Track[] {
  const restoredTracks =
    getDefaultTracks();

  saveTracks(
    restoredTracks,
  );

  return restoredTracks;
}

export function clearStoredTracks():
  void {
  try {
    localStorage.removeItem(
      TRACKS_STORAGE_KEY,
    );
  } catch (error) {
    console.error(
      "Unable to clear stored tracks.",
      error,
    );
  }
}