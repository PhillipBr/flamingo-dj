import type {
  LivePerformanceAudienceEntry,
  LivePerformanceRecord,
  LivePerformanceTrack,
} from "../types/livePerformance";

import type {
  TrackPerformanceRecord,
  TrackPerformanceRole,
} from "../types/trackPerformance";

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

function responseWeight(
  level:
    LivePerformanceAudienceEntry["level"],
): number {
  if (
    level ===
    "great"
  ) {
    return 100;
  }

  if (
    level ===
    "good"
  ) {
    return 78;
  }

  if (
    level ===
    "neutral"
  ) {
    return 52;
  }

  return 18;
}

function resolveRole(
  plays: number,
  crowdResponses: number,
  crowdScore: number,
  rescueCount: number,
  losingCrowd: number,
): TrackPerformanceRole {
  if (
    rescueCount >=
    2
  ) {
    return "crowd-rescue";
  }

  if (
    plays >=
      2 &&
    crowdResponses >=
      2 &&
    crowdScore >=
      82 &&
    losingCrowd ===
      0
  ) {
    return "reliable-hit";
  }

  if (
    crowdResponses >=
      2 &&
    (
      crowdScore <
        48 ||
      losingCrowd >=
        2
    )
  ) {
    return "needs-review";
  }

  if (
    crowdResponses >=
    1
  ) {
    return "steady";
  }

  return "insufficient-data";
}

type Aggregate = {
  trackId: string;

  title: string;
  artist: string;

  plays: number;

  great: number;
  good: number;
  neutral: number;
  losingCrowd: number;

  rescueCount: number;

  responseWeights:
    number[];

  bpms:
    number[];

  energies:
    number[];

  popularities:
    number[];
};

function createAggregate(
  track:
    LivePerformanceTrack,
): Aggregate {
  return {
    trackId:
      track.trackId,

    title:
      track.title,

    artist:
      track.artist,

    plays: 0,

    great: 0,
    good: 0,
    neutral: 0,
    losingCrowd: 0,

    rescueCount: 0,

    responseWeights: [],

    bpms: [],
    energies: [],
    popularities: [],
  };
}

function addTrackMetrics(
  aggregate:
    Aggregate,
  track:
    LivePerformanceTrack,
): void {
  aggregate.plays +=
    1;

  if (
    track.bpm !==
    null
  ) {
    aggregate.bpms.push(
      track.bpm,
    );
  }

  if (
    track.energy !==
    null
  ) {
    aggregate.energies.push(
      track.energy,
    );
  }

  if (
    track.popularity !==
    null
  ) {
    aggregate.popularities.push(
      track.popularity,
    );
  }
}

function addAudienceResponse(
  aggregate:
    Aggregate,
  entry:
    LivePerformanceAudienceEntry,
): void {
  if (
    entry.level ===
    "great"
  ) {
    aggregate.great +=
      1;
  } else if (
    entry.level ===
    "good"
  ) {
    aggregate.good +=
      1;
  } else if (
    entry.level ===
    "neutral"
  ) {
    aggregate.neutral +=
      1;
  } else {
    aggregate.losingCrowd +=
      1;
  }

  aggregate.responseWeights.push(
    responseWeight(
      entry.level,
    ),
  );
}

function registerRescues(
  performance:
    LivePerformanceRecord,
  aggregateByTrackId:
    Map<string, Aggregate>,
): void {
  const responses =
    performance.audienceEntries;

  for (
    let index = 0;
    index <
    responses.length - 1;
    index += 1
  ) {
    const current =
      responses[index];

    const next =
      responses[
        index + 1
      ];

    if (
      current.level !==
        "losing-crowd" ||
      (
        next.level !==
          "great" &&
        next.level !==
          "good"
      ) ||
      !next.trackId
    ) {
      continue;
    }

    const aggregate =
      aggregateByTrackId.get(
        next.trackId,
      );

    if (aggregate) {
      aggregate.rescueCount +=
        1;
    }
  }
}

export function buildTrackPerformance(
  history:
    readonly LivePerformanceRecord[],
): TrackPerformanceRecord[] {
  const aggregateByTrackId =
    new Map<
      string,
      Aggregate
    >();

  history.forEach(
    (performance) => {
      performance.tracks.forEach(
        (track) => {
          const aggregate =
            aggregateByTrackId.get(
              track.trackId,
            ) ??
            createAggregate(
              track,
            );

          addTrackMetrics(
            aggregate,
            track,
          );

          aggregateByTrackId.set(
            track.trackId,
            aggregate,
          );
        },
      );

      performance.audienceEntries.forEach(
        (entry) => {
          if (!entry.trackId) {
            return;
          }

          const aggregate =
            aggregateByTrackId.get(
              entry.trackId,
            );

          if (!aggregate) {
            return;
          }

          addAudienceResponse(
            aggregate,
            entry,
          );
        },
      );

      registerRescues(
        performance,
        aggregateByTrackId,
      );
    },
  );

  return [
    ...aggregateByTrackId.values(),
  ]
    .map(
      (
        aggregate,
      ): TrackPerformanceRecord => {
        const crowdResponses =
          aggregate.responseWeights.length;

        const crowdScore =
          crowdResponses ===
          0
            ? 70
            : Math.round(
                aggregate.responseWeights.reduce(
                  (
                    total,
                    value,
                  ) =>
                    total +
                    value,
                  0,
                ) /
                  crowdResponses,
              );

        return {
          trackId:
            aggregate.trackId,

          title:
            aggregate.title,

          artist:
            aggregate.artist,

          plays:
            aggregate.plays,

          great:
            aggregate.great,

          good:
            aggregate.good,

          neutral:
            aggregate.neutral,

          losingCrowd:
            aggregate.losingCrowd,

          crowdResponses,

          crowdScore,

          rescueCount:
            aggregate.rescueCount,

          averageBpm:
            average(
              aggregate.bpms,
            ),

          averageEnergy:
            average(
              aggregate.energies,
            ),

          averagePopularity:
            average(
              aggregate.popularities,
            ),

          role:
            resolveRole(
              aggregate.plays,
              crowdResponses,
              crowdScore,
              aggregate.rescueCount,
              aggregate.losingCrowd,
            ),
        };
      },
    )
    .sort(
      (
        left,
        right,
      ) => {
        if (
          right.crowdScore !==
          left.crowdScore
        ) {
          return (
            right.crowdScore -
            left.crowdScore
          );
        }

        return (
          right.plays -
          left.plays
        );
      },
    );
}
