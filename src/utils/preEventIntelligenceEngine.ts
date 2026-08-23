import type {
  EventProfile,
} from "../types/eventProfile";

import type {
  LivePerformanceRecord,
  LivePerformanceTrack,
} from "../types/livePerformance";

import type {
  PreEventGenreSignal,
  PreEventIntelligence,
  PreEventJourneyRecommendation,
} from "../types/preEventIntelligence";

import {
  filterPerformanceHistoryByProfile,
} from "./eventProfilePerformance";

import {
  buildTrackPerformance,
} from "./trackPerformanceEngine";

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function average(
  values: readonly number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  return (
    values.reduce(
      (total, value) => total + value,
      0,
    ) / values.length
  );
}

function findTrack(
  performance: LivePerformanceRecord,
  trackId: string | null,
): LivePerformanceTrack | null {
  if (!trackId) {
    return null;
  }

  return (
    performance.tracks.find(
      (track) => track.trackId === trackId,
    ) ?? null
  );
}

function buildStartingBpm(
  history: readonly LivePerformanceRecord[],
): {
  minimum: number;
  maximum: number;
} | null {
  const weightedBpms: number[] = [];

  history.forEach((performance) => {
    performance.audienceEntries.forEach(
      (entry) => {
        if (
          entry.level !== "great" &&
          entry.level !== "good"
        ) {
          return;
        }

        const track = findTrack(
          performance,
          entry.trackId,
        );

        if (
          !track ||
          track.bpm === null
        ) {
          return;
        }

        const repeats =
          entry.level === "great"
            ? 2
            : 1;

        for (
          let index = 0;
          index < repeats;
          index += 1
        ) {
          weightedBpms.push(
            track.bpm,
          );
        }
      },
    );
  });

  if (weightedBpms.length === 0) {
    return null;
  }

  const center = average(
    weightedBpms,
  );

  if (center === null) {
    return null;
  }

  return {
    minimum: Math.max(
      60,
      Math.round(center - 4),
    ),
    maximum: Math.min(
      180,
      Math.round(center + 4),
    ),
  };
}

function buildGenreSignals(
  history: readonly LivePerformanceRecord[],
): PreEventGenreSignal[] {
  const stats = new Map<
    string,
    {
      positive: number;
      losing: number;
    }
  >();

  history.forEach((performance) => {
    performance.audienceEntries.forEach(
      (entry) => {
        const track = findTrack(
          performance,
          entry.trackId,
        );

        if (!track?.genre) {
          return;
        }

        const genre = normalize(
          track.genre,
        );

        if (!genre) {
          return;
        }

        const current =
          stats.get(genre) ?? {
            positive: 0,
            losing: 0,
          };

        if (entry.level === "great") {
          current.positive += 2;
        } else if (
          entry.level === "good"
        ) {
          current.positive += 1;
        } else if (
          entry.level ===
          "losing-crowd"
        ) {
          current.losing += 1;
        }

        stats.set(
          genre,
          current,
        );
      },
    );
  });

  return [...stats.entries()]
    .map(
      ([genre, value]): PreEventGenreSignal => {
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
                      (value.positive /
                        total) *
                        100,
                    ),
                  ),
                ),
        };
      },
    )
    .sort((left, right) => {
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
    })
    .slice(0, 5);
}

function recommendJourney(
  profile: EventProfile | null,
): PreEventJourneyRecommendation {
  if (!profile) {
    return "warmup-peak-release";
  }

  if (
    profile.type === "bar" ||
    profile.type === "restaurant"
  ) {
    return "long-warmup";
  }

  if (
    profile.type === "club" ||
    profile.type === "festival"
  ) {
    return "peak-heavy";
  }

  if (
    profile.type === "wedding" ||
    profile.type ===
      "private-party"
  ) {
    return "smooth-wave";
  }

  if (
    profile.type ===
    "beach-event"
  ) {
    return "progressive-build";
  }

  return "warmup-peak-release";
}

function readinessScore(
  sessions: number,
  responses: number,
  reliableTracks: number,
): number {
  const sessionScore =
    Math.min(
      40,
      sessions * 10,
    );

  const responseScore =
    Math.min(
      35,
      responses * 2,
    );

  const reliableScore =
    Math.min(
      25,
      reliableTracks * 5,
    );

  return Math.min(
    100,
    sessionScore +
      responseScore +
      reliableScore,
  );
}

export function buildPreEventIntelligence(
  history: readonly LivePerformanceRecord[],
  profile: EventProfile | null,
): PreEventIntelligence {
  const contextHistory =
    filterPerformanceHistoryByProfile(
      history,
      profile?.id ?? "global",
    );

  const trackPerformance =
    buildTrackPerformance(
      contextHistory,
    );

  const reliableTracks =
    trackPerformance
      .filter(
        (track) =>
          track.role ===
          "reliable-hit",
      )
      .slice(0, 8);

  const crowdRescueTracks =
    trackPerformance
      .filter(
        (track) =>
          track.role ===
          "crowd-rescue",
      )
      .slice(0, 8);

  const tracksToReview =
    trackPerformance
      .filter(
        (track) =>
          track.role ===
          "needs-review",
      )
      .sort(
        (left, right) =>
          left.crowdScore -
          right.crowdScore,
      )
      .slice(0, 8);

  const scores =
    contextHistory.map(
      (record) =>
        record.scores.overall,
    );

  const responseCount =
    contextHistory.reduce(
      (total, record) =>
        total +
        record.audienceEntries.length,
      0,
    );

  const notes: string[] = [];

  if (contextHistory.length === 0) {
    notes.push(
      "No historical sessions exist for this profile yet. Recommendations are using profile type defaults.",
    );
  }

  const startingBpm =
    buildStartingBpm(
      contextHistory,
    );

  if (startingBpm) {
    notes.push(
      `Positive crowd responses cluster around approximately ${startingBpm.minimum}–${startingBpm.maximum} BPM.`,
    );
  }

  if (reliableTracks.length > 0) {
    notes.push(
      `${reliableTracks.length} reliable historical track${
        reliableTracks.length === 1
          ? ""
          : "s"
      } are available for this context.`,
    );
  }

  if (
    crowdRescueTracks.length > 0
  ) {
    notes.push(
      `${crowdRescueTracks.length} crowd-rescue track${
        crowdRescueTracks.length === 1
          ? ""
          : "s"
      } have been identified.`,
    );
  }

  if (tracksToReview.length > 0) {
    notes.push(
      `${tracksToReview.length} track${
        tracksToReview.length === 1
          ? ""
          : "s"
      } have weaker repeated crowd-response signals and may deserve extra context review.`,
    );
  }

  return {
    profile,
    sessionsAnalyzed:
      contextHistory.length,
    totalTracksPlayed:
      contextHistory.reduce(
        (total, record) =>
          total +
          record.tracks.length,
        0,
      ),
    averagePerformanceScore:
      average(scores),
    recommendedStartingBpm:
      startingBpm,
    strongestGenres:
      buildGenreSignals(
        contextHistory,
      ),
    reliableTracks,
    crowdRescueTracks,
    tracksToReview,
    recommendedJourney:
      recommendJourney(profile),
    readinessScore:
      readinessScore(
        contextHistory.length,
        responseCount,
        reliableTracks.length +
          crowdRescueTracks.length,
      ),
    notes,
  };
}
