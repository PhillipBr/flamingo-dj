import type { Playlist } from "../types/playlist";

type RawRecord =
  Record<string, unknown>;

type RawPlaylist = {
  schemaVersion?: unknown;
  playlistId?: unknown;
  playlistName?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  source?: unknown;
  generatedAt?: unknown;
  updatedAt?: unknown;
  trackIds?: unknown;
  tracks?: unknown;
};

type PlaylistCatalogEntry = {
  playlist: Playlist;
  source:
    | "python"
    | "flamingo-dj-app";
};

const jsonModules =
  import.meta.glob(
    "./JSON/playlists/*.json",
    {
      eager: true,
      import: "default",
    },
  ) as Record<
    string,
    unknown
  >;

function isRecord(
  value: unknown,
): value is RawRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function normalizeIdPart(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    );
}

function filenameFromPath(
  path: string,
): string {
  const file =
    path
      .split("/")
      .pop() ??
    "playlist.json";

  return file.replace(
    /\.json$/i,
    "",
  );
}

function trackIdFromUnknown(
  value: unknown,
): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.id,
    value.song_id,
    value.songId,
    value.SongID,
    value.externalSongId,
  ];

  for (
    const candidate of
      candidates
  ) {
    if (
      typeof candidate ===
        "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }

    if (
      typeof candidate ===
        "number" &&
      Number.isFinite(candidate)
    ) {
      return String(
        candidate,
      );
    }
  }

  return null;
}

function normalizeTrackIds(
  raw: RawPlaylist,
): string[] {
  if (
    Array.isArray(
      raw.trackIds,
    )
  ) {
    return Array.from(
      new Set(
        raw.trackIds
          .map(
            (value) =>
              typeof value ===
                "string"
                ? value.trim()
                : typeof value ===
                    "number"
                  ? String(
                      value,
                    )
                  : "",
          )
          .filter(Boolean),
      ),
    );
  }

  if (
    !Array.isArray(
      raw.tracks,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      raw.tracks
        .map(
          trackIdFromUnknown,
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
    ),
  );
}

function normalizePlaylist(
  path: string,
  value: unknown,
): PlaylistCatalogEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const raw =
    value as RawPlaylist;

  const filename =
    filenameFromPath(
      path,
    );

  const name =
    asString(
      raw.playlistName,
    ) ??
    asString(
      raw.name,
    ) ??
    filename;

  const source =
    asString(
      raw.source,
    ) ===
    "flamingo-dj-app"
      ? "flamingo-dj-app"
      : "python";

  const rawId =
    asString(
      raw.playlistId,
    );

  const id =
    rawId ??
    normalizeIdPart(
      name,
    ) ??
    `playlist-${filename}`;

  const description =
    asString(
      raw.description,
    ) ??
    (source ===
    "python"
      ? "Imported Flamingo DJ playlist."
      : "");

  const category =
    asString(
      raw.category,
    ) ??
    (source ===
    "python"
      ? "Imported"
      : "Custom");

  const updatedAt =
    asString(
      raw.updatedAt,
    ) ??
    asString(
      raw.generatedAt,
    ) ??
    "Imported";

  return {
    source,

    playlist: {
      id,
      name,
      description,
      category,
      trackIds:
        normalizeTrackIds(
          raw,
        ),
      updatedAt,
    },
  };
}

const catalogEntries =
  Object.entries(
    jsonModules,
  )
    .map(
      ([path, value]) =>
        normalizePlaylist(
          path,
          value,
        ),
    )
    .filter(
      (
        entry,
      ): entry is PlaylistCatalogEntry =>
        entry !== null,
    );

const byId =
  new Map<
    string,
    PlaylistCatalogEntry
  >();

for (
  const entry of
    catalogEntries
) {
  const existing =
    byId.get(
      entry.playlist.id,
    );

  if (!existing) {
    byId.set(
      entry.playlist.id,
      entry,
    );

    continue;
  }

  /*
   * If the same ID somehow exists in
   * two JSON files, prefer the
   * app-managed file only when the
   * existing entry is also app data.
   *
   * Python-generated source data should
   * remain authoritative for imported
   * playlists.
   */
  if (
    existing.source ===
      "flamingo-dj-app" &&
    entry.source ===
      "python"
  ) {
    byId.set(
      entry.playlist.id,
      entry,
    );
  }
}

export const initialPlaylists:
  Playlist[] =
  Array.from(
    byId.values(),
  ).map(
    (entry) => ({
      ...entry.playlist,

      trackIds: [
        ...entry.playlist
          .trackIds,
      ],
    }),
  );

export const pythonPlaylistIds =
  new Set(
    Array.from(
      byId.values(),
    )
      .filter(
        (entry) =>
          entry.source ===
          "python",
      )
      .map(
        (entry) =>
          entry.playlist.id,
      ),
  );

export const appJsonPlaylistIds =
  new Set(
    Array.from(
      byId.values(),
    )
      .filter(
        (entry) =>
          entry.source ===
          "flamingo-dj-app",
      )
      .map(
        (entry) =>
          entry.playlist.id,
      ),
  );
