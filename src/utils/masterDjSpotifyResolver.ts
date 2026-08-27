import type { Track } from "../types/track";

import type {
  SpotifyPlaylistTrack,
} from "./playlistSpotifySync";

const LOCAL_RESOLVER_URL =
  "http://127.0.0.1:8002";

export type MasterDjIncompleteTrack = {
  spotifyTrackId: string;
  linkedFromTrackId:
    | string
    | null;

  songId: string;

  title:
    | string
    | null;

  artist:
    | string
    | null;

  missing: string[];
};

export type MasterDjUnknownTrack = {
  spotifyTrackId: string;

  linkedFromTrackId:
    | string
    | null;

  title:
    | string
    | null;

  artist:
    | string
    | null;
};

export async function resolveSpotifyTracksFromMasterDj(
  spotifyTracks:
    SpotifyPlaylistTrack[],
): Promise<{
  available: boolean;

  resolvedTracks:
    Track[];

  incomplete:
    MasterDjIncompleteTrack[];

  unknown:
    MasterDjUnknownTrack[];

  resolvedCount: number;
}> {
  if (
    spotifyTracks.length ===
    0
  ) {
    return {
      available:
        true,

      resolvedTracks:
        [],

      incomplete:
        [],

      unknown:
        [],

      resolvedCount:
        0,
    };
  }

  try {
    const response =
      await fetch(
        `${LOCAL_RESOLVER_URL}/api/spotify-sync/resolve`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              tracks:
                spotifyTracks,
            }),
        },
      );

    if (!response.ok) {
      throw new Error(
        `Resolver HTTP ${response.status}`,
      );
    }

    const payload =
      await response.json();

    return {
      available:
        true,

      resolvedTracks:
        (
          payload.resolved ??
          []
        ).map(
          (
            item: {
              track: Track;
            },
          ) =>
            item.track,
        ),

      incomplete:
        payload.incomplete ??
        [],

      unknown:
        payload.unknown ??
        [],

      resolvedCount:
        payload.resolvedCount ??
        0,
    };
  } catch {
    return {
      available:
        false,

      resolvedTracks:
        [],

      incomplete:
        [],

      unknown:
        [],

      resolvedCount:
        0,
    };
  }
}
