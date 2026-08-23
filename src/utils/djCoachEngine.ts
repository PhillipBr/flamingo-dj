import type {
  DJCoachGenrePerformance,
  DJCoachInsight,
  DJCoachSummary,
} from "../types/djCoach";

import type {
  LivePerformanceRecord,
  LivePerformanceTrack,
} from "../types/livePerformance";

import type {
  TrackPerformanceRecord,
} from "../types/trackPerformance";

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
  values: number[],
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

function buildStrongestBpmRange(
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
              ) ?? 0
            ) + weight,
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

function buildGenrePerformance(
  history:
    readonly LivePerformanceRecord[],
): DJCoachGenrePerformance[] {
  const stats =
    new Map<
      string,
      {
        positive: number;
        losing: number;
      }
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
              "great" ||
            entry.level ===
              "good"
          ) {
            current.positive +=
              entry.level ===
              "great"
                ? 2
                : 1;
          }

          if (
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

  return [
    ...stats.entries(),
  ]
    .map(
      ([
        genre,
        value,
      ]) => {
        const total =
          value.positive +
          value.losing;

        const score =
          total === 0
            ? 70
            : Math.max(
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

        return {
          genre,
          positiveResponses:
            value.positive,
          losingCrowdResponses:
            value.losing,
          score,
        };
      },
    )
    .sort(
      (
        left,
        right,
      ) => {
        if (
          right.score !==
          left.score
        ) {
          return (
            right.score -
            left.score
          );
        }

        return (
          right.positiveResponses -
          left.positiveResponses
        );
      },
    )
    .slice(
      0,
      5,
    );
}

function countLargeBpmJumpLosingCrowd(
  history:
    readonly LivePerformanceRecord[],
): number {
  let count =
    0;

  history.forEach(
    (performance) => {
      const losingTrackIds =
        new Set(
          performance.audienceEntries
            .filter(
              (entry) =>
                entry.level ===
                  "losing-crowd" &&
                entry.trackId,
            )
            .map(
              (entry) =>
                entry.trackId as string,
            ),
        );

      for (
        let index = 1;
        index <
        performance.tracks.length;
        index += 1
      ) {
        const previous =
          performance.tracks[
            index - 1
          ];

        const current =
          performance.tracks[
            index
          ];

        if (
          !losingTrackIds.has(
            current.trackId,
          ) ||
          previous.bpm ===
            null ||
          current.bpm ===
            null
        ) {
          continue;
        }

        if (
          Math.abs(
            current.bpm -
              previous.bpm,
          ) >= 8
        ) {
          count +=
            1;
        }
      }
    },
  );

  return count;
}

function countLongSameStyleRuns(
  history:
    readonly LivePerformanceRecord[],
): number {
  let count =
    0;

  history.forEach(
    (performance) => {
      let previousGenre =
        "";

      let runLength =
        0;

      performance.tracks.forEach(
        (track) => {
          const genre =
            track.genre
              ? normalize(
                  track.genre,
                )
              : "";

          if (
            genre &&
            genre ===
              previousGenre
          ) {
            runLength +=
              1;
          } else {
            if (
              runLength >=
              5
            ) {
              count +=
                1;
            }

            previousGenre =
              genre;

            runLength =
              genre
                ? 1
                : 0;
          }
        },
      );

      if (
        runLength >=
        5
      ) {
        count +=
          1;
      }
    },
  );

  return count;
}

function reliableTracks(
  trackPerformance:
    readonly TrackPerformanceRecord[],
): TrackPerformanceRecord[] {
  return trackPerformance
    .filter(
      (track) =>
        (
          track.role ===
            "reliable-hit" ||
          track.role ===
            "crowd-rescue"
        ) &&
        track.crowdResponses >=
          2,
    )
    .slice(
      0,
      8,
    );
}

function tracksToReview(
  trackPerformance:
    readonly TrackPerformanceRecord[],
): TrackPerformanceRecord[] {
  return trackPerformance
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
}

function buildInsights({
  sessionsAnalyzed,
  strongestBpmRange,
  strongestGenres,
  largeBpmJumpLosingCrowdCount,
  sameStyleLongRunCount,
  reliable,
  review,
}: {
  sessionsAnalyzed: number;

  strongestBpmRange:
    string | null;

  strongestGenres:
    DJCoachGenrePerformance[];

  largeBpmJumpLosingCrowdCount:
    number;

  sameStyleLongRunCount:
    number;

  reliable:
    TrackPerformanceRecord[];

  review:
    TrackPerformanceRecord[];
}): DJCoachInsight[] {
  const insights:
    DJCoachInsight[] =
      [];

  if (
    sessionsAnalyzed <
    3
  ) {
    insights.push({
      id:
        "sample-size",
      type:
        "info",
      title:
        "Build more history",
      detail:
        `The coach currently has ${sessionsAnalyzed} session${
          sessionsAnalyzed ===
          1
            ? ""
            : "s"
        }. Patterns become more useful after several events.`,
    });
  }

  if (
    strongestBpmRange
  ) {
    insights.push({
      id:
        "strongest-bpm",
      type:
        "positive",
      title:
        "Strongest BPM zone",
      detail:
        `${strongestBpmRange} has accumulated the strongest GOOD/GREAT crowd response in your saved sessions.`,
    });
  }

  const bestGenre =
    strongestGenres[0];

  if (
    bestGenre &&
    bestGenre.positiveResponses >=
      2
  ) {
    insights.push({
      id:
        "strongest-genre",
      type:
        "positive",
      title:
        "Strong style signal",
      detail:
        `${bestGenre.genre} currently has a ${bestGenre.score}/100 positive crowd score across recorded responses.`,
    });
  }

  if (
    largeBpmJumpLosingCrowdCount >
    0
  ) {
    insights.push({
      id:
        "bpm-jump-warning",
      type:
        "warning",
      title:
        "Watch large BPM jumps",
      detail:
        `${largeBpmJumpLosingCrowdCount} losing-crowd response${
          largeBpmJumpLosingCrowdCount ===
          1
            ? ""
            : "s"
        } occurred on tracks following a BPM jump of 8 or more.`,
    });
  }

  if (
    sameStyleLongRunCount >
    0
  ) {
    insights.push({
      id:
        "style-run-warning",
      type:
        "warning",
      title:
        "Long same-style runs",
      detail:
        `${sameStyleLongRunCount} sequence${
          sameStyleLongRunCount ===
          1
            ? ""
            : "s"
        } contained at least five consecutive tracks with the same primary genre.`,
    });
  }

  if (
    reliable.length >
    0
  ) {
    insights.push({
      id:
        "reliable-tracks",
      type:
        "positive",
      title:
        "Reliable tracks emerging",
      detail:
        `${reliable.length} track${
          reliable.length ===
          1
            ? ""
            : "s"
        } currently qualify as reliable or crowd-rescue options.`,
    });
  }

  if (
    review.length >
    0
  ) {
    insights.push({
      id:
        "review-tracks",
      type:
        "warning",
      title:
        "Tracks to review",
      detail:
        `${review.length} track${
          review.length ===
          1
            ? ""
            : "s"
        } have repeated weak crowd-response signals and should be reviewed in context rather than automatically removed.`,
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "no-patterns",
      type:
        "info",
      title:
        "No strong pattern yet",
      detail:
        "Keep recording Audience Response during Live sessions. Flamingo will surface patterns as the history grows.",
    });
  }

  return insights;
}

export function buildDJCoachSummary(
  history:
    readonly LivePerformanceRecord[],
): DJCoachSummary {
  const trackPerformance =
    buildTrackPerformance(
      history,
    );

  const sessionsAnalyzed =
    history.length;

  const totalPlayedTracks =
    history.reduce(
      (
        total,
        performance,
      ) =>
        total +
        performance.tracks.length,
      0,
    );

  const averagePerformanceScore =
    average(
      history.map(
        (performance) =>
          performance.scores.overall,
      ),
    );

  const strongestBpmRange =
    buildStrongestBpmRange(
      history,
    );

  const strongestGenres =
    buildGenrePerformance(
      history,
    );

  const largeBpmJumpLosingCrowdCount =
    countLargeBpmJumpLosingCrowd(
      history,
    );

  const sameStyleLongRunCount =
    countLongSameStyleRuns(
      history,
    );

  const reliable =
    reliableTracks(
      trackPerformance,
    );

  const review =
    tracksToReview(
      trackPerformance,
    );

  return {
    sessionsAnalyzed,

    totalPlayedTracks,

    averagePerformanceScore,

    strongestBpmRange,

    strongestGenres,

    largeBpmJumpLosingCrowdCount,

    sameStyleLongRunCount,

    reliableTracks:
      reliable,

    tracksToReview:
      review,

    insights:
      buildInsights({
        sessionsAnalyzed,
        strongestBpmRange,
        strongestGenres,
        largeBpmJumpLosingCrowdCount,
        sameStyleLongRunCount,
        reliable,
        review,
      }),
  };
}
