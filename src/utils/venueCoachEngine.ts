import type {
  EventProfile,
} from "../types/eventProfile";

import type {
  LivePerformanceRecord,
  LivePerformanceTrack,
} from "../types/livePerformance";

import type {
  TrackPerformanceRecord,
} from "../types/trackPerformance";

import type {
  VenueCoachGenreComparison,
  VenueCoachInsight,
  VenueSpecificCoachSummary,
} from "../types/venueCoach";

import {
  filterPerformanceHistoryByProfile,
} from "./eventProfilePerformance";

import {
  buildTrackPerformance,
} from "./trackPerformanceEngine";

function normalize(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );
}

function average(
  values:
    readonly number[],
): number | null {
  if (
    values.length ===
    0
  ) {
    return null;
  }

  return (
    values.reduce(
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
    values.length
  );
}

function findTrack(
  performance:
    LivePerformanceRecord,
  trackId:
    string | null,
): LivePerformanceTrack | null {
  if (!trackId) {
    return null;
  }

  return (
    performance.tracks.find(
      (track) =>
        track.trackId ===
        trackId,
    ) ??
    null
  );
}

function bpmBucket(
  bpm: number,
): string {
  const start =
    Math.floor(
      bpm / 5,
    ) *
    5;

  return `${start}–${start + 4} BPM`;
}

function strongestBpmRange(
  history:
    readonly LivePerformanceRecord[],
): string | null {
  const scores =
    new Map<
      string,
      number
    >();

  history.forEach(
    (performance) => {
      performance.audienceEntries.forEach(
        (entry) => {
          if (
            entry.level !==
              "great" &&
            entry.level !==
              "good"
          ) {
            return;
          }

          const track =
            findTrack(
              performance,
              entry.trackId,
            );

          if (
            !track ||
            track.bpm ===
              null
          ) {
            return;
          }

          const bucket =
            bpmBucket(
              track.bpm,
            );

          const weight =
            entry.level ===
            "great"
              ? 2
              : 1;

          scores.set(
            bucket,
            (
              scores.get(
                bucket,
              ) ??
              0
            ) +
              weight,
          );
        },
      );
    },
  );

  return [
    ...scores.entries(),
  ].sort(
    (
      left,
      right,
    ) =>
      right[1] -
      left[1],
  )[0]?.[0] ??
    null;
}

type GenreStats = {
  positive: number;
  losing: number;
};

function genreStats(
  history:
    readonly LivePerformanceRecord[],
): Map<
  string,
  GenreStats
> {
  const stats =
    new Map<
      string,
      GenreStats
    >();

  history.forEach(
    (performance) => {
      performance.audienceEntries.forEach(
        (entry) => {
          const track =
            findTrack(
              performance,
              entry.trackId,
            );

          const genre =
            track?.genre
              ? normalize(
                  track.genre,
                )
              : "";

          if (!genre) {
            return;
          }

          const current =
            stats.get(
              genre,
            ) ?? {
              positive: 0,
              losing: 0,
            };

          if (
            entry.level ===
              "great"
          ) {
            current.positive +=
              2;
          } else if (
            entry.level ===
              "good"
          ) {
            current.positive +=
              1;
          } else if (
            entry.level ===
              "losing-crowd"
          ) {
            current.losing +=
              1;
          }

          stats.set(
            genre,
            current,
          );
        },
      );
    },
  );

  return stats;
}

function genreScore(
  value:
    GenreStats | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const total =
    value.positive +
    value.losing;

  if (
    total ===
    0
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (
          value.positive /
          total
        ) *
          100,
      ),
    ),
  );
}

function buildGenreComparisons(
  venueHistory:
    readonly LivePerformanceRecord[],
  globalHistory:
    readonly LivePerformanceRecord[],
): VenueCoachGenreComparison[] {
  const venue =
    genreStats(
      venueHistory,
    );

  const global =
    genreStats(
      globalHistory,
    );

  const genres =
    new Set([
      ...venue.keys(),
      ...global.keys(),
    ]);

  return [
    ...genres,
  ]
    .map(
      (
        genre,
      ): VenueCoachGenreComparison => {
        const venueValue =
          venue.get(
            genre,
          );

        const globalValue =
          global.get(
            genre,
          );

        const venueScore =
          genreScore(
            venueValue,
          );

        const globalScore =
          genreScore(
            globalValue,
          );

        return {
          genre,

          venueScore,
          globalScore,

          difference:
            venueScore !==
              null &&
            globalScore !==
              null
              ? venueScore -
                globalScore
              : null,

          venuePositiveResponses:
            venueValue?.positive ??
            0,

          venueLosingResponses:
            venueValue?.losing ??
            0,

          globalPositiveResponses:
            globalValue?.positive ??
            0,

          globalLosingResponses:
            globalValue?.losing ??
            0,
        };
      },
    )
    .sort(
      (
        left,
        right,
      ) => {
        const leftMagnitude =
          Math.abs(
            left.difference ??
              0,
          );

        const rightMagnitude =
          Math.abs(
            right.difference ??
              0,
          );

        if (
          rightMagnitude !==
          leftMagnitude
        ) {
          return (
            rightMagnitude -
            leftMagnitude
          );
        }

        return (
          (
            right.venueScore ??
            -1
          ) -
          (
            left.venueScore ??
            -1
          )
        );
      },
    )
    .slice(
      0,
      8,
    );
}

function trackMap(
  tracks:
    readonly TrackPerformanceRecord[],
): Map<
  string,
  TrackPerformanceRecord
> {
  return new Map(
    tracks.map(
      (track) => [
        track.trackId,
        track,
      ],
    ),
  );
}

function buildVenueSpecificReliable(
  venueTracks:
    readonly TrackPerformanceRecord[],
  globalTracks:
    readonly TrackPerformanceRecord[],
): TrackPerformanceRecord[] {
  const globalById =
    trackMap(
      globalTracks,
    );

  return venueTracks
    .filter(
      (track) => {
        const global =
          globalById.get(
            track.trackId,
          );

        const venueReliable =
          track.role ===
            "reliable-hit" ||
          track.role ===
            "crowd-rescue";

        if (!venueReliable) {
          return false;
        }

        if (!global) {
          return true;
        }

        return (
          track.crowdScore >=
            global.crowdScore +
              8 ||
          (
            (
              global.role ===
                "steady" ||
              global.role ===
                "needs-review" ||
              global.role ===
                "insufficient-data"
            ) &&
            track.crowdScore >=
              80
          )
        );
      },
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.crowdScore -
        left.crowdScore,
    )
    .slice(
      0,
      8,
    );
}

function buildInsights({
  profile,
  venueSessions,
  venueAveragePerformance,
  globalAveragePerformance,
  venueBpm,
  globalBpm,
  genres,
  venueSpecificReliableTracks,
  venueTracksToReview,
}: {
  profile:
    EventProfile | null;

  venueSessions:
    number;

  venueAveragePerformance:
    number | null;

  globalAveragePerformance:
    number | null;

  venueBpm:
    string | null;

  globalBpm:
    string | null;

  genres:
    readonly VenueCoachGenreComparison[];

  venueSpecificReliableTracks:
    readonly TrackPerformanceRecord[];

  venueTracksToReview:
    readonly TrackPerformanceRecord[];
}): VenueCoachInsight[] {
  const insights:
    VenueCoachInsight[] =
      [];

  if (
    !profile ||
    profile.id ===
      "global"
  ) {
    insights.push({
      id:
        "global-profile",
      type:
        "info",
      title:
        "Select a specific venue",
      detail:
        "Venue Coach comparisons become meaningful when a non-global Event Profile is active.",
    });

    return insights;
  }

  if (
    venueSessions <
    2
  ) {
    insights.push({
      id:
        "venue-sample",
      type:
        "info",
      title:
        "Venue sample is still small",
      detail:
        `${profile.name} currently has ${venueSessions} saved session${
          venueSessions ===
          1
            ? ""
            : "s"
        }. Comparisons become more reliable as more events are recorded.`,
    });
  }

  if (
    venueAveragePerformance !==
      null &&
    globalAveragePerformance !==
      null
  ) {
    const difference =
      Math.round(
        venueAveragePerformance -
        globalAveragePerformance,
      );

    if (
      difference >=
      5
    ) {
      insights.push({
        id:
          "venue-performance-positive",
        type:
          "positive",
        title:
          "Performance is stronger here",
        detail:
          `${profile.name} is averaging ${difference} points above your global Performance Score.`,
      });
    } else if (
      difference <=
      -5
    ) {
      insights.push({
        id:
          "venue-performance-warning",
        type:
          "warning",
        title:
          "This venue needs a different approach",
        detail:
          `${profile.name} is averaging ${Math.abs(
            difference,
          )} points below your global Performance Score.`,
      });
    }
  }

  if (
    venueBpm &&
    globalBpm &&
    venueBpm !==
      globalBpm
  ) {
    insights.push({
      id:
        "venue-bpm",
      type:
        "positive",
      title:
        "Venue-specific BPM signal",
      detail:
        `${profile.name} responds strongest around ${venueBpm}, compared with ${globalBpm} globally.`,
    });
  }

  const strongerGenre =
    genres.find(
      (genre) =>
        genre.difference !==
          null &&
        genre.difference >=
          10 &&
        genre.venuePositiveResponses >=
          2,
    );

  if (strongerGenre) {
    insights.push({
      id:
        "stronger-genre",
      type:
        "positive",
      title:
        "Style performs better here",
      detail:
        `${strongerGenre.genre} is currently ${strongerGenre.difference} points stronger at ${profile.name} than in your global history.`,
    });
  }

  const weakerGenre =
    genres.find(
      (genre) =>
        genre.difference !==
          null &&
        genre.difference <=
          -10 &&
        genre.venueLosingResponses >
          0,
    );

  if (weakerGenre) {
    insights.push({
      id:
        "weaker-genre",
      type:
        "warning",
      title:
        "Style underperforms here",
      detail:
        `${weakerGenre.genre} is currently ${Math.abs(
          weakerGenre.difference ??
            0,
        )} points weaker at ${profile.name} than globally.`,
    });
  }

  if (
    venueSpecificReliableTracks.length >
    0
  ) {
    insights.push({
      id:
        "venue-reliable",
      type:
        "positive",
      title:
        "Venue-specific reliable tracks",
      detail:
        `${venueSpecificReliableTracks.length} track${
          venueSpecificReliableTracks.length ===
          1
            ? ""
            : "s"
        } currently perform notably better here than in global history.`,
    });
  }

  if (
    venueTracksToReview.length >
    0
  ) {
    insights.push({
      id:
        "venue-review",
      type:
        "warning",
      title:
        "Review tracks for this venue",
      detail:
        `${venueTracksToReview.length} track${
          venueTracksToReview.length ===
          1
            ? ""
            : "s"
        } have repeated weaker crowd-response signals in this venue context.`,
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "no-major-difference",
      type:
        "info",
      title:
        "No major venue difference yet",
      detail:
        "Current venue signals remain close to your global history. Keep recording Audience Response to sharpen the comparison.",
    });
  }

  return insights;
}

export function buildVenueSpecificCoach(
  history:
    readonly LivePerformanceRecord[],
  profile:
    EventProfile | null,
): VenueSpecificCoachSummary {
  const globalHistory = [
    ...history,
  ];

  const venueHistory =
    filterPerformanceHistoryByProfile(
      history,
      profile?.id ??
        "global",
    );

  const venueTrackPerformance =
    buildTrackPerformance(
      venueHistory,
    );

  const globalTrackPerformance =
    buildTrackPerformance(
      globalHistory,
    );

  const venueReliableTracks =
    venueTrackPerformance
      .filter(
        (track) =>
          track.role ===
            "reliable-hit",
      )
      .slice(
        0,
        8,
      );

  const venueCrowdRescueTracks =
    venueTrackPerformance
      .filter(
        (track) =>
          track.role ===
            "crowd-rescue",
      )
      .slice(
        0,
        8,
      );

  const venueTracksToReview =
    venueTrackPerformance
      .filter(
        (track) =>
          track.role ===
            "needs-review",
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.crowdScore -
          right.crowdScore,
      )
      .slice(
        0,
        8,
      );

  const venueSpecificReliableTracks =
    buildVenueSpecificReliable(
      venueTrackPerformance,
      globalTrackPerformance,
    );

  const genreComparisons =
    buildGenreComparisons(
      venueHistory,
      globalHistory,
    );

  const venueAveragePerformance =
    average(
      venueHistory.map(
        (record) =>
          record.scores.overall,
      ),
    );

  const globalAveragePerformance =
    average(
      globalHistory.map(
        (record) =>
          record.scores.overall,
      ),
    );

  const venueBpm =
    strongestBpmRange(
      venueHistory,
    );

  const globalBpm =
    strongestBpmRange(
      globalHistory,
    );

  return {
    profile,

    venueSessions:
      venueHistory.length,

    globalSessions:
      globalHistory.length,

    venueAveragePerformance,

    globalAveragePerformance,

    bpmComparison: {
      venueRange:
        venueBpm,

      globalRange:
        globalBpm,
    },

    genreComparisons,

    venueReliableTracks,

    venueCrowdRescueTracks,

    venueTracksToReview,

    venueSpecificReliableTracks,

    insights:
      buildInsights({
        profile,
        venueSessions:
          venueHistory.length,
        venueAveragePerformance,
        globalAveragePerformance,
        venueBpm,
        globalBpm,
        genres:
          genreComparisons,
        venueSpecificReliableTracks,
        venueTracksToReview,
      }),
  };
}
