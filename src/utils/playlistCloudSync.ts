import {
  createClient,
} from "@supabase/supabase-js";

export type PlaylistSyncRecord = {
  flamingoPlaylistId: string;
  flamingoPlaylistName: string;

  spotifyPlaylistId:
    | string
    | null;

  spotifyPlaylistName:
    | string
    | null;

  trackIds: string[];

  lastDirection:
    | "spotify_to_flamingo"
    | "flamingo_to_spotify"
    | "create_spotify"
    | "party_sort"
    | null;

  lastSyncedAt:
    | string
    | null;
};

type PlaylistSyncRow = {
  flamingo_playlist_id: string;
  flamingo_playlist_name: string;

  spotify_playlist_id:
    | string
    | null;

  spotify_playlist_name:
    | string
    | null;

  track_ids: unknown;

  last_direction:
    | "spotify_to_flamingo"
    | "flamingo_to_spotify"
    | "create_spotify"
    | "party_sort"
    | null;

  last_synced_at:
    | string
    | null;
};

const STORAGE_PREFIX =
  "flamingo-dj-playlist-sync-v2:";

const supabaseUrl =
  String(
    import.meta.env
      .VITE_SUPABASE_URL ??
      "",
  ).trim();

const supabaseAnonKey =
  String(
    import.meta.env
      .VITE_SUPABASE_ANON_KEY ??
      "",
  ).trim();

const syncSupabase =
  supabaseUrl &&
  supabaseAnonKey
    ? createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          auth: {
            persistSession:
              true,

            autoRefreshToken:
              true,

            detectSessionInUrl:
              true,
          },
        },
      )
    : null;

function storageKey(
  playlistId: string,
): string {
  return (
    STORAGE_PREFIX +
    playlistId
  );
}

function sanitizeTrackIds(
  value: unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(
          (item) =>
            String(
              item ??
                "",
            ).trim(),
        )
        .filter(Boolean),
    ),
  );
}

function normalizeRecord(
  value:
    Partial<PlaylistSyncRecord>,
): PlaylistSyncRecord {
  return {
    flamingoPlaylistId:
      String(
        value.flamingoPlaylistId ??
          "",
      ),

    flamingoPlaylistName:
      String(
        value.flamingoPlaylistName ??
          "",
      ),

    spotifyPlaylistId:
      value.spotifyPlaylistId
        ? String(
            value.spotifyPlaylistId,
          )
        : null,

    spotifyPlaylistName:
      value.spotifyPlaylistName
        ? String(
            value.spotifyPlaylistName,
          )
        : null,

    trackIds:
      sanitizeTrackIds(
        value.trackIds,
      ),

    lastDirection:
      value.lastDirection ??
      null,

    lastSyncedAt:
      value.lastSyncedAt ??
      null,
  };
}

export function loadPlaylistSyncLocal(
  playlistId: string,
): PlaylistSyncRecord | null {
  try {
    const raw =
      window.localStorage.getItem(
        storageKey(
          playlistId,
        ),
      );

    if (!raw) {
      return null;
    }

    return normalizeRecord(
      JSON.parse(
        raw,
      ) as
        Partial<PlaylistSyncRecord>,
    );
  } catch {
    return null;
  }
}

export function savePlaylistSyncLocal(
  record:
    PlaylistSyncRecord,
): void {
  window.localStorage.setItem(
    storageKey(
      record.flamingoPlaylistId,
    ),

    JSON.stringify(
      normalizeRecord(
        record,
      ),
    ),
  );
}

async function currentUserId(): Promise<
  string | null
> {
  if (
    !syncSupabase
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await syncSupabase.auth.getUser();

  if (
    error
  ) {
    return null;
  }

  return (
    data.user?.id ??
    null
  );
}

export async function loadPlaylistSyncCloud(
  playlistId: string,
): Promise<PlaylistSyncRecord | null> {
  if (
    !syncSupabase
  ) {
    return null;
  }

  const userId =
    await currentUserId();

  if (
    !userId
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await syncSupabase
      .from(
        "dj_playlist_sync",
      )
      .select(
        `
          flamingo_playlist_id,
          flamingo_playlist_name,
          spotify_playlist_id,
          spotify_playlist_name,
          track_ids,
          last_direction,
          last_synced_at
        `,
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "flamingo_playlist_id",
        playlistId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    return null;
  }

  const row =
    data as unknown as
      PlaylistSyncRow;

  const record =
    normalizeRecord({
      flamingoPlaylistId:
        row.flamingo_playlist_id,

      flamingoPlaylistName:
        row.flamingo_playlist_name,

      spotifyPlaylistId:
        row.spotify_playlist_id,

      spotifyPlaylistName:
        row.spotify_playlist_name,

      trackIds:
        sanitizeTrackIds(
          row.track_ids,
        ),

      lastDirection:
        row.last_direction,

      lastSyncedAt:
        row.last_synced_at,
    });

  savePlaylistSyncLocal(
    record,
  );

  return record;
}

export async function loadPlaylistSyncRecord(
  playlistId: string,
): Promise<PlaylistSyncRecord | null> {
  const cloud =
    await loadPlaylistSyncCloud(
      playlistId,
    );

  return (
    cloud ??
    loadPlaylistSyncLocal(
      playlistId,
    )
  );
}

export async function persistPlaylistSync(
  record: PlaylistSyncRecord,
): Promise<{
  localSaved: boolean;
  cloudSaved: boolean;
}> {
  const normalized =
    normalizeRecord({
      ...record,

      lastSyncedAt:
        record.lastSyncedAt ??
        new Date().toISOString(),
    });

  savePlaylistSyncLocal(
    normalized,
  );

  if (
    !syncSupabase
  ) {
    return {
      localSaved:
        true,

      cloudSaved:
        false,
    };
  }

  const userId =
    await currentUserId();

  if (
    !userId
  ) {
    return {
      localSaved:
        true,

      cloudSaved:
        false,
    };
  }

  const now =
    new Date().toISOString();

  const {
    error,
  } =
    await syncSupabase
      .from(
        "dj_playlist_sync",
      )
      .upsert(
        {
          user_id:
            userId,

          flamingo_playlist_id:
            normalized.flamingoPlaylistId,

          flamingo_playlist_name:
            normalized.flamingoPlaylistName,

          spotify_playlist_id:
            normalized.spotifyPlaylistId,

          spotify_playlist_name:
            normalized.spotifyPlaylistName,

          track_ids:
            normalized.trackIds,

          last_direction:
            normalized.lastDirection,

          last_synced_at:
            normalized.lastSyncedAt,

          updated_at:
            now,
        },
        {
          onConflict:
            "user_id,flamingo_playlist_id",
        },
      );

  if (
    error
  ) {
    console.error(
      "[Flamingo Spotify Sync] Supabase persistence failed:",
      error,
    );
  }

  return {
    localSaved:
      true,

    cloudSaved:
      !error,
  };
}
