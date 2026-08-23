import type {
  DashboardPlaylistCard,
  DashboardSessionSummary,
  DashboardSummary,
  DashboardTrackCard,
} from "../types/dashboard";

import type { Playlist } from "../types/playlist";
import type { Track } from "../types/track";

import {
  loadCurrentSet,
} from "./currentSetStorage";

import {
  loadPlaylists,
} from "./playlistStorage";

import {
  loadTracks,
} from "./trackStorage";

const PINNED_PLAYLISTS_KEY =
  "flamingo-dj-dashboard-pinned-playlists";

const PERFORMANCE_HISTORY_KEY =
  "flamingo-dj-live-performance-history";

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getTrackId(
  track: Track,
): string {
  const record = asRecord(track);

  return (
    readString(
      record,
      [
        "id",
        "songId",
        "song_id",
        "trackId",
      ],
    ) ??
    ""
  );
}

function getTrackTitle(
  track: Track,
): string {
  return (
    readString(
      asRecord(track),
      [
        "title",
        "Title",
      ],
    ) ??
    "Unknown track"
  );
}

function getTrackArtist(
  track: Track,
): string {
  return (
    readString(
      asRecord(track),
      [
        "artist",
        "Artist",
      ],
    ) ??
    "Unknown artist"
  );
}

function getTrackGenre(
  track: Track,
): string | null {
  return readString(
    asRecord(track),
    [
      "genre",
      "Genre",
    ],
  );
}

function getTrackPopularity(
  track: Track,
): number | null {
  return readNumber(
    asRecord(track),
    [
      "popularity",
      "Popularity",
      "spotifyPopularity",
    ],
  );
}

function getTrackReleaseDate(
  track: Track,
): string | null {
  return readString(
    asRecord(track),
    [
      "releaseDate",
      "release_date",
      "ReleaseDate",
      "release",
    ],
  );
}

function getTrackDateAdded(
  track: Track,
): string | null {
  return readString(
    asRecord(track),
    [
      "dateAdded",
      "date_added",
      "Date Added",
      "DateAdded",
    ],
  );
}

function getTrackArtworkUrl(
  track: Track,
): string | null {
  return readString(
    asRecord(track),
    [
      "artworkUrl",
      "artwork",
      "coverImage",
      "CoverImage",
      "cover_image",
      "image",
    ],
  );
}

function parseDate(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function normalizeGenre(
  value: string | null,
): string {
  return (
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}

function loadPinnedPlaylistIds(): string[] {
  try {
    const raw =
      localStorage.getItem(
        PINNED_PLAYLISTS_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (
            value,
          ): value is string =>
            typeof value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function savePinnedPlaylistIds(
  ids: readonly string[],
): void {
  localStorage.setItem(
    PINNED_PLAYLISTS_KEY,
    JSON.stringify(
      Array.from(
        new Set(ids),
      ),
    ),
  );
}

function getPlaylistId(
  playlist: Playlist,
): string {
  return (
    readString(
      asRecord(playlist),
      [
        "id",
      ],
    ) ??
    ""
  );
}

function getPlaylistTrackCount(
  playlist: Playlist,
): number {
  const record =
    asRecord(playlist);

  return Array.isArray(
    record.trackIds,
  )
    ? record.trackIds.length
    : 0;
}

function getPlaylistTrackIds(
  playlist: Playlist,
): string[] {
  const record =
    asRecord(playlist);

  if (
    !Array.isArray(
      record.trackIds,
    )
  ) {
    return [];
  }

  return record.trackIds.filter(
    (
      value,
    ): value is string =>
      typeof value === "string",
  );
}

function buildPlayCounts(): Map<string, number> {
  const result =
    new Map<string, number>();

  try {
    const raw =
      localStorage.getItem(
        PERFORMANCE_HISTORY_KEY,
      );

    if (!raw) {
      return result;
    }

    const history: unknown =
      JSON.parse(raw);

    if (!Array.isArray(history)) {
      return result;
    }

    history.forEach(
      (session) => {
        const sessionRecord =
          asRecord(session);

        const tracks =
          sessionRecord.tracks;

        if (!Array.isArray(tracks)) {
          return;
        }

        tracks.forEach(
          (rawTrack) => {
            const record =
              asRecord(rawTrack);

            const trackId =
              readString(
                record,
                [
                  "trackId",
                  "id",
                ],
              );

            if (!trackId) {
              return;
            }

            result.set(
              trackId,
              (
                result.get(
                  trackId,
                ) ??
                0
              ) +
                1,
            );
          },
        );
      },
    );
  } catch {
    return result;
  }

  return result;
}

function buildLastSession(): DashboardSessionSummary | null {
  try {
    const raw =
      localStorage.getItem(
        PERFORMANCE_HISTORY_KEY,
      );

    if (!raw) {
      return null;
    }

    const history: unknown =
      JSON.parse(raw);

    if (
      !Array.isArray(history) ||
      history.length === 0
    ) {
      return null;
    }

    const sessions =
      history
        .map(
          (item) =>
            asRecord(item),
        )
        .sort(
          (
            left,
            right,
          ) => {
            const leftDate =
              parseDate(
                readString(
                  left,
                  [
                    "endedAt",
                    "startedAt",
                  ],
                ),
              ) ??
              0;

            const rightDate =
              parseDate(
                readString(
                  right,
                  [
                    "endedAt",
                    "startedAt",
                  ],
                ),
              ) ??
              0;

            return (
              rightDate -
              leftDate
            );
          },
        );

    const session =
      sessions[0];

    const scores =
      asRecord(
        session.scores,
      );

    return {
      id:
        readString(
          session,
          [
            "id",
          ],
        ) ??
        "last-session",

      eventProfileName:
        readString(
          session,
          [
            "eventProfileName",
          ],
        ),

      currentSetName:
        readString(
          session,
          [
            "currentSetName",
          ],
        ),

      endedAt:
        readString(
          session,
          [
            "endedAt",
            "startedAt",
          ],
        ),

      tracksPlayed:
        Array.isArray(
          session.tracks,
        )
          ? session.tracks.length
          : 0,

      overallScore:
        readNumber(
          scores,
          [
            "overall",
          ],
        ),
    };
  } catch {
    return null;
  }
}

function toTrackCard(
  track: Track,
  playCount: number,
): DashboardTrackCard {
  return {
    track,
    title:
      getTrackTitle(track),
    artist:
      getTrackArtist(track),
    genre:
      getTrackGenre(track),
    popularity:
      getTrackPopularity(track),
    releaseDate:
      getTrackReleaseDate(track),
    playCount,
  };
}

export function buildDashboardSummary(): DashboardSummary {
  const tracks =
    loadTracks();

  const playlists =
    loadPlaylists();

  const currentSet =
    loadCurrentSet();

  const pinnedIds =
    new Set(
      loadPinnedPlaylistIds(),
    );

  const playCounts =
    buildPlayCounts();

  const trackCards =
    tracks.map(
      (track) =>
        toTrackCard(
          track,
          playCounts.get(
            getTrackId(track),
          ) ??
            0,
        ),
    );

  const trackById =
    new Map(
      tracks
        .map(
          (track) => [
            getTrackId(track),
            track,
          ] as const,
        )
        .filter(
          (
            entry,
          ) =>
            Boolean(
              entry[0],
            ),
        ),
    );

  function recentTracksForPlaylist(
    playlist: Playlist,
  ) {
    const ids =
      getPlaylistTrackIds(
        playlist,
      );

    const playlistTracks =
      ids
        .map(
          (
            id,
            index,
          ) => {
            const track =
              trackById.get(
                id,
              );

            if (!track) {
              return null;
            }

            const dateAdded =
              getTrackDateAdded(
                track,
              );

            return {
              track,
              index,
              title:
                getTrackTitle(
                  track,
                ),
              artist:
                getTrackArtist(
                  track,
                ),
              artworkUrl:
                getTrackArtworkUrl(
                  track,
                ),
              dateAdded,
              dateAddedTimestamp:
                parseDate(
                  dateAdded,
                ),
            };
          },
        )
        .filter(
          (
            item,
          ): item is NonNullable<
            typeof item
          > =>
            item !==
            null,
        );

    playlistTracks.sort(
      (
        left,
        right,
      ) => {
        const leftDate =
          left.dateAddedTimestamp;

        const rightDate =
          right.dateAddedTimestamp;

        if (
          leftDate !== null ||
          rightDate !== null
        ) {
          return (
            (
              rightDate ??
              -1
            ) -
            (
              leftDate ??
              -1
            )
          );
        }

        /*
         * Fallback when Date Added is unavailable:
         * later position in playlist = more recently added.
         */
        return (
          right.index -
          left.index
        );
      },
    );

    return playlistTracks
      .slice(
        0,
        3,
      )
      .map(
        (item) => ({
          track:
            item.track,
          title:
            item.title,
          artist:
            item.artist,
          artworkUrl:
            item.artworkUrl,
          dateAdded:
            item.dateAdded,
        }),
      );
  }

  const quickPlaylists:
    DashboardPlaylistCard[] =
    playlists
      .map(
        (playlist) => ({
          playlist,
          trackCount:
            getPlaylistTrackCount(
              playlist,
            ),
          pinned:
            pinnedIds.has(
              getPlaylistId(
                playlist,
              ),
            ),
          recentTracks:
            recentTracksForPlaylist(
              playlist,
            ),
        }),
      )
      .sort(
        (
          left,
          right,
        ) => {
          if (
            left.pinned !==
            right.pinned
          ) {
            return left.pinned
              ? -1
              : 1;
          }

          return (
            right.trackCount -
            left.trackCount
          );
        },
      )
      .slice(
        0,
        6,
      );

  const mostPlayedTracks =
    trackCards
      .filter(
        (track) =>
          track.playCount >
          0,
      )
      .sort(
        (
          left,
          right,
        ) => {
          if (
            right.playCount !==
            left.playCount
          ) {
            return (
              right.playCount -
              left.playCount
            );
          }

          return (
            (
              right.popularity ??
              -1
            ) -
            (
              left.popularity ??
              -1
            )
          );
        },
      )
      .slice(
        0,
        6,
      );

  const now =
    Date.now();

  const recentCutoff =
    now -
    60 *
      24 *
      60 *
      60 *
      1000;

  const newTracks =
    trackCards
      .filter(
        (track) => {
          const released =
            parseDate(
              track.releaseDate,
            );

          return (
            released !==
              null &&
            released >=
              recentCutoff &&
            released <=
              now
          );
        },
      )
      .sort(
        (
          left,
          right,
        ) => {
          const dateDifference =
            (
              parseDate(
                right.releaseDate,
              ) ??
              0
            ) -
            (
              parseDate(
                left.releaseDate,
              ) ??
              0
            );

          if (
            dateDifference !==
            0
          ) {
            return dateDifference;
          }

          return (
            (
              right.popularity ??
              -1
            ) -
            (
              left.popularity ??
              -1
            )
          );
        },
      )
      .slice(
        0,
        8,
      );

  const historicalGenres =
    new Map<string, number>();

  mostPlayedTracks.forEach(
    (track) => {
      const genre =
        normalizeGenre(
          track.genre,
        );

      if (!genre) {
        return;
      }

      historicalGenres.set(
        genre,
        (
          historicalGenres.get(
            genre,
          ) ??
          0
        ) +
          track.playCount,
      );
    },
  );

  const suggestedTracks =
    newTracks
      .filter(
        (track) =>
          track.playCount ===
          0,
      )
      .map(
        (track) => {
          const genre =
            normalizeGenre(
              track.genre,
            );

          const affinity =
            historicalGenres.get(
              genre,
            ) ??
            0;

          return {
            track,
            affinity,
          };
        },
      )
      .sort(
        (
          left,
          right,
        ) => {
          if (
            right.affinity !==
            left.affinity
          ) {
            return (
              right.affinity -
              left.affinity
            );
          }

          return (
            (
              right.track.popularity ??
              -1
            ) -
            (
              left.track.popularity ??
              -1
            )
          );
        },
      )
      .map(
        (item) =>
          item.track,
      )
      .slice(
        0,
        6,
      );

  return {
    totalTracks:
      tracks.length,

    totalPlaylists:
      playlists.length,

    currentSetTracks:
      currentSet.items.length,

    currentSetName:
      currentSet.name,

    quickPlaylists,

    mostPlayedTracks,

    newTracks,

    suggestedTracks,

    lastSession:
      buildLastSession(),
  };
}
