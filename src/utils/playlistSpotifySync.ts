import type { Track } from "../types/track";

import {
  getValidSpotifyAccessToken,
  isSpotifyConnected,
} from "./spotifyApi";

const SPOTIFY_API_BASE =
  "https://api.spotify.com/v1";

export type SpotifyPlaylistTrack = {
  position: number;
  spotifyTrackId: string;
  linkedFromTrackId: string | null;
  spotifyUri: string;
  spotifyUrl: string;
  title: string;
  artist: string;
};

export type SpotifyPlaylistSyncComparison = {
  spotifyCount: number;
  flamingoCount: number;

  matchedCount: number;
  onlySpotifyCount: number;
  onlyFlamingoCount: number;
  duplicateSpotifyCount: number;

  orderedTracks: Track[];

  onlySpotify:
    SpotifyPlaylistTrack[];

  onlyFlamingo:
    Track[];
};

export type SpotifyPlaylistIdentity = {
  id: string;
  name: string;
  url: string | null;
};

function spotifyTrackIdFromValue(
  value:
    | string
    | null
    | undefined,
): string | null {
  const raw =
    String(
      value ??
        "",
    ).trim();

  if (!raw) {
    return null;
  }

  const uriMatch =
    raw.match(
      /^spotify:track:([A-Za-z0-9]+)$/i,
    );

  if (
    uriMatch
  ) {
    return uriMatch[1];
  }

  const urlMatch =
    raw.match(
      /open\.spotify\.com\/(?:intl-[^/]+\/)?track\/([A-Za-z0-9]+)/i,
    );

  if (
    urlMatch
  ) {
    return urlMatch[1];
  }

  return null;
}

export function spotifyTrackIdFromTrack(
  track: Track,
): string | null {
  return spotifyTrackIdFromValue(
    track.spotifyUrl,
  );
}

async function spotifyFetch(
  pathOrUrl: string,
  init:
    RequestInit = {},
): Promise<Response> {
  if (
    !isSpotifyConnected()
  ) {
    throw new Error(
      "Spotify is not connected.",
    );
  }

  const token =
    await getValidSpotifyAccessToken();

  const headers =
    new Headers(
      init.headers,
    );

  headers.set(
    "Authorization",
    `Bearer ${token}`,
  );

  if (
    init.body &&
    !headers.has(
      "Content-Type",
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  return fetch(
    pathOrUrl.startsWith(
      "http",
    )
      ? pathOrUrl
      : `${SPOTIFY_API_BASE}${pathOrUrl}`,
    {
      ...init,
      headers,
    },
  );
}

async function spotifyApiError(
  response: Response,
): Promise<Error> {
  let detail =
    `${response.status} ${response.statusText}`;

  try {
    const body =
      await response.json();

    detail =
      body?.error?.message ??
      body?.error_description ??
      body?.error ??
      detail;
  } catch {
    // Keep status.
  }

  return new Error(
    `Spotify API error: ${detail}`,
  );
}

function chunk<T>(
  values: T[],
  size: number,
): T[][] {
  const output:
    T[][] = [];

  for (
    let index =
      0;
    index <
    values.length;
    index +=
      size
  ) {
    output.push(
      values.slice(
        index,
        index +
          size,
      ),
    );
  }

  return output;
}

function tracksToUris(
  tracks: Track[],
): {
  uris: string[];
  missing: Track[];
} {
  const uris:
    string[] = [];

  const missing:
    Track[] = [];

  const seen =
    new Set<string>();

  for (
    const track of
    tracks
  ) {
    const id =
      spotifyTrackIdFromTrack(
        track,
      );

    if (
      !id
    ) {
      missing.push(
        track,
      );

      continue;
    }

    if (
      seen.has(
        id,
      )
    ) {
      continue;
    }

    seen.add(
      id,
    );

    uris.push(
      `spotify:track:${id}`,
    );
  }

  return {
    uris,
    missing,
  };
}

export async function createSpotifyPlaylistFromFlamingo(
  name: string,
  tracks: Track[],
): Promise<{
  playlist:
    SpotifyPlaylistIdentity;
  resolved: number;
  missing: Track[];
}> {
  const {
    uris,
    missing,
  } =
    tracksToUris(
      tracks,
    );

  if (
    uris.length ===
    0
  ) {
    throw new Error(
      "No Flamingo track has a valid Spotify URL.",
    );
  }

  const response =
    await spotifyFetch(
      "/me/playlists",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            name,

            public:
              false,

            collaborative:
              false,

            description:
              "Synced from Flamingo DJ.",
          }),
      },
    );

  if (
    !response.ok
  ) {
    throw await spotifyApiError(
      response,
    );
  }

  const created =
    await response.json();

  const playlistId =
    String(
      created.id ??
        "",
    );

  if (
    !playlistId
  ) {
    throw new Error(
      "Spotify created the playlist but did not return an ID.",
    );
  }

  for (
    const batch of
    chunk(
      uris,
      100,
    )
  ) {
    const addResponse =
      await spotifyFetch(
        `/playlists/${encodeURIComponent(
          playlistId,
        )}/items`,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              uris:
                batch,
            }),
        },
      );

    if (
      !addResponse.ok
    ) {
      throw await spotifyApiError(
        addResponse,
      );
    }
  }

  return {
    playlist: {
      id:
        playlistId,

      name:
        String(
          created.name ??
            name,
        ),

      url:
        created.external_urls
          ?.spotify ??
        null,
    },

    resolved:
      uris.length,

    missing,
  };
}

export async function pushFlamingoPlaylistToSpotify(
  playlistId: string,
  tracks: Track[],
): Promise<{
  requested: number;
  resolved: number;
  missing: Track[];
}> {
  const {
    uris,
    missing,
  } =
    tracksToUris(
      tracks,
    );

  if (
    uris.length ===
    0
  ) {
    throw new Error(
      "No Flamingo track has a Spotify URL.",
    );
  }

  const batches =
    chunk(
      uris,
      100,
    );

  const firstResponse =
    await spotifyFetch(
      `/playlists/${encodeURIComponent(
        playlistId,
      )}/items`,
      {
        method:
          "PUT",

        body:
          JSON.stringify({
            uris:
              batches[0] ??
              [],
          }),
      },
    );

  if (
    !firstResponse.ok
  ) {
    throw await spotifyApiError(
      firstResponse,
    );
  }

  for (
    const batch of
    batches.slice(
      1,
    )
  ) {
    const response =
      await spotifyFetch(
        `/playlists/${encodeURIComponent(
          playlistId,
        )}/items`,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              uris:
                batch,
            }),
        },
      );

    if (
      !response.ok
    ) {
      throw await spotifyApiError(
        response,
      );
    }
  }

  return {
    requested:
      tracks.length,

    resolved:
      uris.length,

    missing,
  };
}

export async function readSpotifyPlaylistTracks(
  playlistId: string,
): Promise<SpotifyPlaylistTrack[]> {
  const output:
    SpotifyPlaylistTrack[] =
      [];

  let url =
    `${SPOTIFY_API_BASE}/playlists/${encodeURIComponent(
      playlistId,
    )}/items?limit=50&additional_types=track`;

  while (
    url
  ) {
    const response =
      await spotifyFetch(
        url,
      );

    if (
      !response.ok
    ) {
      throw await spotifyApiError(
        response,
      );
    }

    const payload =
      await response.json();

    for (
      const item of
      payload.items ??
      []
    ) {
      const track =
        item.item ??
        item.track;

      if (
        !track ||
        track.type !==
          "track" ||
        !track.id
      ) {
        continue;
      }

      const artists =
        (
          track.artists ??
          []
        )
          .map(
            (
              artist: {
                name?: string;
              },
            ) =>
              String(
                artist.name ??
                  "",
              ).trim(),
          )
          .filter(Boolean);

      output.push({
        position:
          output.length +
          1,

        spotifyTrackId:
          String(
            track.id,
          ),

        linkedFromTrackId:
          track.linked_from
            ?.id
            ? String(
                track
                  .linked_from
                  .id,
              )
            : null,

        spotifyUri:
          track.uri ??
          `spotify:track:${track.id}`,

        spotifyUrl:
          track.external_urls
            ?.spotify ??
          `https://open.spotify.com/track/${track.id}`,

        title:
          track.name ??
          "",

        artist:
          artists.join(
            ", ",
          ),
      });
    }

    url =
      payload.next ??
      "";
  }

  return output;
}

export function compareSpotifyAndFlamingoPlaylist(
  spotifyTracks:
    SpotifyPlaylistTrack[],
  flamingoTracks:
    Track[],
  allCatalogTracks:
    Track[],
): SpotifyPlaylistSyncComparison {
  const playlistBySpotifyId =
    new Map<
      string,
      Track
    >();

  const globalBySpotifyId =
    new Map<
      string,
      Track
    >();

  for (
    const track of
    flamingoTracks
  ) {
    const spotifyId =
      spotifyTrackIdFromTrack(
        track,
      );

    if (
      spotifyId &&
      !playlistBySpotifyId.has(
        spotifyId,
      )
    ) {
      playlistBySpotifyId.set(
        spotifyId,
        track,
      );
    }
  }

  for (
    const track of
    allCatalogTracks
  ) {
    const spotifyId =
      spotifyTrackIdFromTrack(
        track,
      );

    if (
      spotifyId &&
      !globalBySpotifyId.has(
        spotifyId,
      )
    ) {
      globalBySpotifyId.set(
        spotifyId,
        track,
      );
    }
  }

  const orderedTracks:
    Track[] = [];

  const onlySpotify:
    SpotifyPlaylistTrack[] =
      [];

  const duplicateSpotify:
    SpotifyPlaylistTrack[] =
      [];

  const seenSongIds =
    new Set<string>();

  const matchedSongIds =
    new Set<string>();

  for (
    const spotifyTrack of
    spotifyTracks
  ) {
    const candidates =
      [
        spotifyTrack.spotifyTrackId,
        spotifyTrack.linkedFromTrackId,
      ].filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      );

    let match:
      Track | undefined;

    for (
      const candidate of
      candidates
    ) {
      match =
        playlistBySpotifyId.get(
          candidate,
        );

      if (
        match
      ) {
        break;
      }
    }

    if (
      !match
    ) {
      for (
        const candidate of
        candidates
      ) {
        match =
          globalBySpotifyId.get(
            candidate,
          );

        if (
          match
        ) {
          break;
        }
      }
    }

    if (
      !match
    ) {
      onlySpotify.push(
        spotifyTrack,
      );

      continue;
    }

    const songId =
      String(
        match.id,
      );

    if (
      seenSongIds.has(
        songId,
      )
    ) {
      duplicateSpotify.push(
        spotifyTrack,
      );

      continue;
    }

    seenSongIds.add(
      songId,
    );

    matchedSongIds.add(
      songId,
    );

    orderedTracks.push(
      match,
    );
  }

  const onlyFlamingo =
    flamingoTracks.filter(
      (track) =>
        !matchedSongIds.has(
          String(
            track.id,
          ),
        ),
    );

  return {
    spotifyCount:
      spotifyTracks.length,

    flamingoCount:
      flamingoTracks.length,

    matchedCount:
      orderedTracks.length,

    onlySpotifyCount:
      onlySpotify.length,

    onlyFlamingoCount:
      onlyFlamingo.length,

    duplicateSpotifyCount:
      duplicateSpotify.length,

    orderedTracks,

    onlySpotify,

    onlyFlamingo,
  };
}
