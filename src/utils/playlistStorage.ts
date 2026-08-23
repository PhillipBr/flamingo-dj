import type {
  Playlist,
} from "../types/playlist";


type JsonRecord =
  Record<string, unknown>;


/*
 * V6 normalized playlists contain metadata + trackIds only.
 * These small files are safe to load eagerly.
 */
const normalizedPlaylistModules =
  import.meta.glob(
    "../data/JSON/normalized/playlists/*.json",
    {
      eager: true,
      import: "default",
    },
  ) as Record<
    string,
    unknown
  >;


/*
 * App-created playlists remain lightweight in localStorage.
 * Track metadata itself is NOT stored here.
 */
const APP_PLAYLIST_STORAGE_KEY =
  "flamingo-dj-playlists";


function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}


function cleanText(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}


function cleanTrackIds(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  const seen =
    new Set<string>();

  const output:
    string[] = [];

  for (
    const item of value
  ) {
    if (
      item === null ||
      item === undefined
    ) {
      continue;
    }

    const id =
      String(item)
        .trim();

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);
    output.push(id);
  }

  return output;
}


function normalizedPlaylistFromJson(
  raw: unknown,
  fallbackName: string,
): Playlist | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name =
    cleanText(
      raw.playlistName,
    ) ||
    fallbackName;

  const id =
    cleanText(
      raw.playlistId,
    ) ||
    name
      .toLowerCase()
      .normalize("NFD")
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

  if (
    !id ||
    !name
  ) {
    return null;
  }

  return {
    id,
    name,

    description:
      cleanText(
        raw.description,
      ),

    category:
      cleanText(
        raw.category,
      ) ||
      "Imported",

    trackIds:
      cleanTrackIds(
        raw.trackIds,
      ),

    updatedAt:
      cleanText(
        raw.generatedAt,
      ) ||
      cleanText(
        raw.updatedAt,
      ) ||
      "Today",
  };
}


function filenameWithoutExtension(
  path: string,
): string {
  const normalized =
    path.replace(
      /\\/g,
      "/",
    );

  const filename =
    normalized
      .split("/")
      .pop() ??
    normalized;

  return filename.replace(
    /\.json$/i,
    "",
  );
}


function loadNormalizedPlaylists():
  Playlist[] {
  const output:
    Playlist[] = [];

  for (
    const [
      modulePath,
      value,
    ] of Object.entries(
      normalizedPlaylistModules,
    )
  ) {
    const playlist =
      normalizedPlaylistFromJson(
        value,
        filenameWithoutExtension(
          modulePath,
        ),
      );

    if (playlist) {
      output.push(
        playlist,
      );
    }
  }

  return output;
}


function loadAppPlaylists():
  Playlist[] {
  try {
    const raw =
      localStorage.getItem(
        APP_PLAYLIST_STORAGE_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (
      !Array.isArray(
        parsed,
      )
    ) {
      return [];
    }

    return parsed.filter(
      (
        item,
      ): item is Playlist =>
        isRecord(item) &&
        typeof item.id ===
          "string" &&
        typeof item.name ===
          "string" &&
        Array.isArray(
          item.trackIds,
        ),
    );
  } catch {
    return [];
  }
}


/*
 * Public helper used by:
 * - PlaylistsPage.tsx
 * - TrackContextMenu.tsx
 *
 * Restored in V6 so existing callers keep compiling.
 */
export function createPlaylistId(
  name?: string,
): string {
  const base =
    (name ?? "playlist")
      .trim()
      .toLowerCase()
      .normalize("NFD")
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
      ) ||
    "playlist";

  const timestamp =
    Date.now()
      .toString(36);

  const random =
    Math.random()
      .toString(36)
      .slice(2, 8);

  return `${base}-${timestamp}-${random}`;
}


export function loadPlaylists():
  Playlist[] {
  const normalized =
    loadNormalizedPlaylists();

  const appPlaylists =
    loadAppPlaylists();

  /*
   * Disk V6 playlists are authoritative for imported playlists.
   * App-only playlists are preserved if their ID is not already on disk.
   */
  const byId =
    new Map<
      string,
      Playlist
    >();

  for (
    const playlist of normalized
  ) {
    byId.set(
      playlist.id,
      playlist,
    );
  }

  for (
    const playlist of appPlaylists
  ) {
    if (
      !byId.has(
        playlist.id,
      )
    ) {
      byId.set(
        playlist.id,
        playlist,
      );
    }
  }

  return [
    ...byId.values(),
  ];
}


export function savePlaylists(
  playlists: Playlist[],
): void {
  /*
   * Lightweight persistence only:
   * playlist metadata + trackIds.
   *
   * Full Track metadata stays in the V6 JSON catalogs.
   */
  localStorage.setItem(
    APP_PLAYLIST_STORAGE_KEY,
    JSON.stringify(
      playlists,
    ),
  );

  window.dispatchEvent(
    new Event(
      "flamingo-dj-playlists-updated",
    ),
  );
}
