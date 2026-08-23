import type {
  EventProfile,
} from "../types/eventProfile";

import type {
  LivePerformanceAudienceEntry,
  LivePerformanceRecord,
  LivePerformanceTrack,
} from "../types/livePerformance";

import type {
  TrackPerformanceRecord,
} from "../types/trackPerformance";

import type {
  VenuePhaseDefinition,
  VenuePhaseGenreSignal,
  VenuePhaseId,
  VenuePhaseLearningInsight,
  VenuePhaseLearningSummary,
  VenuePhaseSummary,
} from "../types/venuePhaseLearning";

import {
  filterPerformanceHistoryByProfile,
} from "./eventProfilePerformance";

import {
  buildTrackPerformance,
} from "./trackPerformanceEngine";

export const VENUE_PHASES: VenuePhaseDefinition[] = [
  {
    id: "opening",
    label: "Opening",
    startRatio: 0,
    endRatio: 0.2,
  },
  {
    id: "warm-up",
    label: "Warm Up",
    startRatio: 0.2,
    endRatio: 0.4,
  },
  {
    id: "build",
    label: "Build",
    startRatio: 0.4,
    endRatio: 0.6,
  },
  {
    id: "peak",
    label: "Peak",
    startRatio: 0.6,
    endRatio: 0.85,
  },
  {
    id: "release",
    label: "Release / Late",
    startRatio: 0.85,
    endRatio: 1.01,
  },
];

type PhaseTrackRef = {
  performance:
    LivePerformanceRecord;

  track:
    LivePerformanceTrack;

  phase:
    VenuePhaseDefinition;
};

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
    values.length === 0
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

function phaseForPosition(
  position: number,
  totalTracks: number,
): VenuePhaseDefinition {
  if (
    totalTracks <= 1
  ) {
    return VENUE_PHASES[0];
  }

  const ratio =
    (
      position - 1
    ) /
    Math.max(
      1,
      totalTracks - 1,
    );

  return (
    VENUE_PHASES.find(
      (phase) =>
        ratio >=
          phase.startRatio &&
        ratio <
          phase.endRatio,
    ) ??
    VENUE_PHASES[
      VENUE_PHASES.length - 1
    ]
  );
}

function refsForHistory(
  history:
    readonly LivePerformanceRecord[],
): PhaseTrackRef[] {
  return history.flatMap(
    (performance) => {
      const totalTracks =
        performance.tracks.length;

      return performance.tracks.map(
        (track) => ({
          performance,
          track,
          phase:
            phaseForPosition(
              track.position,
              totalTracks,
            ),
        }),
      );
    },
  );
}

function crowdWeight(
  level:
    LivePerformanceAudienceEntry["level"],
): number {
  if (
    level === "great"
  ) {
    return 100;
  }

  if (
    level === "good"
  ) {
    return 78;
  }

  if (
    level === "neutral"
  ) {
    return 52;
  }

  return 18;
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
  refs:
    readonly PhaseTrackRef[],
): string | null {
  const counts =
    new Map<
      string,
      number
    >();

  refs.forEach(
    (ref) => {
      if (
        ref.track.bpm ===
        null
      ) {
        return;
      }

      const bucket =
        bpmBucket(
          ref.track.bpm,
        );

      counts.set(
        bucket,
        (
          counts.get(
            bucket,
          ) ??
          0
        ) +
          1,
      );
    },
  );

  return [
    ...counts.entries(),
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

function responseEntriesForPhase(
  history:
    readonly LivePerformanceRecord[],
  phase:
    VenuePhaseDefinition,
): Array<{
  entry:
    LivePerformanceAudienceEntry;
  track:
    LivePerformanceTrack;
}> {
  const result: Array<{
    entry:
      LivePerformanceAudienceEntry;
    track:
      LivePerformanceTrack;
  }> = [];

  history.forEach(
    (performance) => {
      const totalTracks =
        performance.tracks.length;

      performance.audienceEntries.forEach(
        (entry) => {
          if (!entry.trackId) {
            return;
          }

          const track =
            performance.tracks.find(
              (item) =>
                item.trackId ===
                entry.trackId,
            );

          if (!track) {
            return;
          }

          const trackPhase =
            phaseForPosition(
              track.position,
              totalTracks,
            );

          if (
            trackPhase.id !==
            phase.id
          ) {
            return;
          }

          result.push({
            entry,
            track,
          });
        },
      );
    },
  );

  return result;
}

function buildGenreSignals(
  responses:
    readonly {
      entry:
        LivePerformanceAudienceEntry;
      track:
        LivePerformanceTrack;
    }[],
): VenuePhaseGenreSignal[] {
  const stats =
    new Map<
      string,
      {
        positive: number;
        losing: number;
      }
    >();

  responses.forEach(
    ({
      entry,
      track,
    }) => {
      if (!track.genre) {
        return;
      }

      const genre =
        normalize(
          track.genre,
        );

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
        entry.level === "great"
      ) {
        current.positive +=
          2;
      } else if (
        entry.level === "good"
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

  return [
    ...stats.entries(),
  ]
    .map(
      ([
        genre,
        value,
      ]): VenuePhaseGenreSignal => {
        const total =
          value.positive +
          value.losing;

        return {
          genre,

          positiveResponses:
            value.positive,

          losingCrowdResponses:
            value.losing,

          score:
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
      4,
    );
}

function phaseTrackPerformance(
  history:
    readonly LivePerformanceRecord[],
  phase:
    VenuePhaseDefinition,
): TrackPerformanceRecord[] {
  const phaseHistory =
    history.map(
      (
        performance,
      ): LivePerformanceRecord => {
        const totalTracks =
          performance.tracks.length;

        const tracks =
          performance.tracks.filter(
            (track) =>
              phaseForPosition(
                track.position,
                totalTracks,
              ).id ===
              phase.id,
          );

        const trackIds =
          new Set(
            tracks.map(
              (track) =>
                track.trackId,
            ),
          );

        const audienceEntries =
          performance.audienceEntries.filter(
            (entry) =>
              entry.trackId !==
                null &&
              trackIds.has(
                entry.trackId,
              ),
          );

        return {
          ...performance,
          tracks,
          audienceEntries,
        };
      },
    )
    .filter(
      (performance) =>
        performance.tracks.length >
        0,
    );

  return buildTrackPerformance(
    phaseHistory,
  );
}

function summarizePhase(
  history:
    readonly LivePerformanceRecord[],
  allRefs:
    readonly PhaseTrackRef[],
  phase:
    VenuePhaseDefinition,
): VenuePhaseSummary {
  const refs =
    allRefs.filter(
      (ref) =>
        ref.phase.id ===
        phase.id,
    );

  const responses =
    responseEntriesForPhase(
      history,
      phase,
    );

  const performance =
    phaseTrackPerformance(
      history,
      phase,
    );

  const responseScores =
    responses.map(
      ({
        entry,
      }) =>
        crowdWeight(
          entry.level,
        ),
    );

  return {
    phase,

    trackCount:
      refs.length,

    responseCount:
      responses.length,

    averageBpm:
      average(
        refs
          .map(
            (ref) =>
              ref.track.bpm,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          ),
      ),

    averageEnergy:
      average(
        refs
          .map(
            (ref) =>
              ref.track.energy,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          ),
      ),

    averagePopularity:
      average(
        refs
          .map(
            (ref) =>
              ref.track.popularity,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          ),
      ),

    strongestBpmRange:
      strongestBpmRange(
        refs,
      ),

    crowdScore:
      responseScores.length ===
      0
        ? null
        : Math.round(
            responseScores.reduce(
              (
                total,
                value,
              ) =>
                total + value,
              0,
            ) /
              responseScores.length,
          ),

    strongestGenres:
      buildGenreSignals(
        responses,
      ),

    reliableTracks:
      performance
        .filter(
          (track) =>
            track.role ===
            "reliable-hit",
        )
        .slice(
          0,
          5,
        ),

    crowdRescueTracks:
      performance
        .filter(
          (track) =>
            track.role ===
            "crowd-rescue",
        )
        .slice(
          0,
          5,
        ),

    tracksToReview:
      performance
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
          5,
        ),
  };
}

function strongestPhase(
  phases:
    readonly VenuePhaseSummary[],
): VenuePhaseId | null {
  return phases
    .filter(
      (phase) =>
        phase.crowdScore !==
        null,
    )
    .sort(
      (
        left,
        right,
      ) =>
        (
          right.crowdScore ??
          -1
        ) -
        (
          left.crowdScore ??
          -1
        ),
    )[0]?.phase.id ??
    null;
}

function weakestPhase(
  phases:
    readonly VenuePhaseSummary[],
): VenuePhaseId | null {
  return phases
    .filter(
      (phase) =>
        phase.crowdScore !==
        null,
    )
    .sort(
      (
        left,
        right,
      ) =>
        (
          left.crowdScore ??
          101
        ) -
        (
          right.crowdScore ??
          101
        ),
    )[0]?.phase.id ??
    null;
}

function buildInsights(
  profile:
    EventProfile | null,
  phases:
    readonly VenuePhaseSummary[],
  sessions:
    number,
): VenuePhaseLearningInsight[] {
  const insights:
    VenuePhaseLearningInsight[] =
      [];

  if (
    !profile ||
    profile.id === "global"
  ) {
    insights.push({
      id:
        "global-phase-context",
      type:
        "info",
      title:
        "Global phase learning",
      detail:
        "This view currently uses all saved sessions. Select a specific Event Profile to isolate venue-specific phase patterns.",
    });
  }

  if (
    sessions < 2
  ) {
    insights.push({
      id:
        "phase-sample",
      type:
        "info",
      title:
        "More sessions will improve phase learning",
      detail:
        `${sessions} saved session${
          sessions === 1
            ? ""
            : "s"
        } are available for this context.`,
    });
  }

  const best =
    phases
      .filter(
        (phase) =>
          phase.crowdScore !==
          null,
      )
      .sort(
        (
          left,
          right,
        ) =>
          (
            right.crowdScore ??
            0
          ) -
          (
            left.crowdScore ??
            0
          ),
      )[0];

  if (
    best &&
    best.crowdScore !==
      null
  ) {
    const genre =
      best.strongestGenres[0]?.genre;

    insights.push({
      id:
        "best-phase",
      type:
        "positive",
      title:
        `${best.phase.label} is currently strongest`,
      detail:
        `${best.phase.label} has a ${best.crowdScore}/100 crowd score${
          genre
            ? `, with ${genre} as its strongest recorded style`
            : ""
        }.`,
    });
  }

  const weak =
    phases
      .filter(
        (phase) =>
          phase.crowdScore !==
          null,
      )
      .sort(
        (
          left,
          right,
        ) =>
          (
            left.crowdScore ??
            101
          ) -
          (
            right.crowdScore ??
            101
          ),
      )[0];

  if (
    weak &&
    weak.crowdScore !==
      null &&
    weak.crowdScore <
      60
  ) {
    insights.push({
      id:
        "weak-phase",
      type:
        "warning",
      title:
        `${weak.phase.label} needs review`,
      detail:
        `${weak.phase.label} has a ${weak.crowdScore}/100 crowd score. Review BPM, Energy, style, and track choices in this section.`,
    });
  }

  const peak =
    phases.find(
      (phase) =>
        phase.phase.id ===
        "peak",
    );

  if (
    peak?.strongestBpmRange
  ) {
    insights.push({
      id:
        "peak-bpm",
      type:
        "positive",
      title:
        "Peak BPM signal",
      detail:
        `The most common recorded Peak BPM zone is ${peak.strongestBpmRange}.`,
    });
  }

  const opening =
    phases.find(
      (phase) =>
        phase.phase.id ===
        "opening",
    );

  if (
    opening &&
    opening.reliableTracks.length >
      0
  ) {
    insights.push({
      id:
        "opening-reliable",
      type:
        "positive",
      title:
        "Reliable opening tracks identified",
      detail:
        `${opening.reliableTracks.length} track${
          opening.reliableTracks.length ===
          1
            ? ""
            : "s"
        } currently show reliable Opening performance.`,
    });
  }

  const release =
    phases.find(
      (phase) =>
        phase.phase.id ===
        "release",
    );

  if (
    release &&
    release.crowdRescueTracks.length >
      0
  ) {
    insights.push({
      id:
        "late-rescue",
      type:
        "positive",
      title:
        "Late-set rescue options identified",
      detail:
        `${release.crowdRescueTracks.length} Crowd Rescue track${
          release.crowdRescueTracks.length ===
          1
            ? ""
            : "s"
        } appear in the Release / Late phase history.`,
    });
  }

  return insights;
}

export function buildVenuePhaseLearning(
  history:
    readonly LivePerformanceRecord[],
  profile:
    EventProfile | null,
): VenuePhaseLearningSummary {
  const contextHistory =
    filterPerformanceHistoryByProfile(
      history,
      profile?.id ??
        "global",
    );

  const refs =
    refsForHistory(
      contextHistory,
    );

  const phases =
    VENUE_PHASES.map(
      (phase) =>
        summarizePhase(
          contextHistory,
          refs,
          phase,
        ),
    );

  return {
    profile,

    sessionsAnalyzed:
      contextHistory.length,

    phases,

    strongestPhase:
      strongestPhase(
        phases,
      ),

    weakestPhase:
      weakestPhase(
        phases,
      ),

    insights:
      buildInsights(
        profile,
        phases,
        contextHistory.length,
      ),
  };
}
