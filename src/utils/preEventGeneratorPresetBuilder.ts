import type {
  PreEventGeneratorPreset,
  PreEventPhaseGeneratorPlan,
} from "../types/preEventGeneratorPreset";

import type {
  PreEventIntelligence,
} from "../types/preEventIntelligence";

import type {
  VenuePhaseSummary,
} from "../types/venuePhaseLearning";

import {
  loadLivePerformanceHistory,
} from "./livePerformanceStorage";

import {
  buildVenuePhaseLearning,
} from "./venuePhaseLearningEngine";

function parseBpmRange(
  value: string | null,
): {
  minimum: number;
  maximum: number;
} | null {
  if (!value) {
    return null;
  }

  const numbers =
    value.match(
      /\d+(?:\.\d+)?/g,
    );

  if (
    !numbers ||
    numbers.length < 2
  ) {
    return null;
  }

  const minimum =
    Number(
      numbers[0],
    );

  const maximum =
    Number(
      numbers[1],
    );

  if (
    !Number.isFinite(
      minimum,
    ) ||
    !Number.isFinite(
      maximum,
    )
  ) {
    return null;
  }

  return {
    minimum:
      Math.round(
        Math.min(
          minimum,
          maximum,
        ),
      ),

    maximum:
      Math.round(
        Math.max(
          minimum,
          maximum,
        ),
      ),
  };
}

function phaseName(
  phaseId:
    VenuePhaseSummary["phase"]["id"],
): PreEventPhaseGeneratorPlan["phaseName"] {
  if (
    phaseId === "opening"
  ) {
    return "Opening";
  }

  if (
    phaseId === "warm-up"
  ) {
    return "Warm Up";
  }

  if (
    phaseId === "build"
  ) {
    return "Build";
  }

  if (
    phaseId === "peak"
  ) {
    return "Peak";
  }

  return "Release";
}

function buildPhasePlan(
  phase:
    VenuePhaseSummary,
  fallbackMinimumBpm: number,
  fallbackMaximumBpm: number,
  fallbackGenres:
    readonly string[],
): PreEventPhaseGeneratorPlan {
  const range =
    parseBpmRange(
      phase.strongestBpmRange,
    );

  const averageBpm =
    phase.averageBpm;

  const minimumBpm =
    range?.minimum ??
    (
      averageBpm !==
      null
        ? Math.round(
            averageBpm - 4,
          )
        : fallbackMinimumBpm
    );

  const maximumBpm =
    range?.maximum ??
    (
      averageBpm !==
      null
        ? Math.round(
            averageBpm + 4,
          )
        : fallbackMaximumBpm
    );

  const phaseGenres =
    phase.strongestGenres
      .map(
        (genre) =>
          genre.genre.trim(),
      )
      .filter(Boolean)
      .slice(
        0,
        3,
      );

  return {
    phaseId:
      phase.phase.id,

    phaseName:
      phaseName(
        phase.phase.id,
      ),

    durationRatio:
      Math.max(
        0.05,
        phase.phase.endRatio -
          phase.phase.startRatio,
      ),

    minimumBpm:
      Math.max(
        60,
        minimumBpm,
      ),

    maximumBpm:
      Math.min(
        180,
        Math.max(
          minimumBpm,
          maximumBpm,
        ),
      ),

    genres:
      phaseGenres.length >
      0
        ? phaseGenres
        : [
            ...fallbackGenres,
          ].slice(
            0,
            3,
          ),

    reliableTrackIds:
      phase.reliableTracks
        .map(
          (track) =>
            track.trackId,
        )
        .slice(
          0,
          20,
        ),

    crowdRescueTrackIds:
      phase.crowdRescueTracks
        .map(
          (track) =>
            track.trackId,
        )
        .slice(
          0,
          20,
        ),

    reviewTrackIds:
      phase.tracksToReview
        .map(
          (track) =>
            track.trackId,
        )
        .slice(
          0,
          20,
        ),

    crowdScore:
      phase.crowdScore,

    responseCount:
      phase.responseCount,
  };
}

export function buildPreEventGeneratorPreset(
  intelligence:
    PreEventIntelligence,
): PreEventGeneratorPreset {
  const startingBpm =
    intelligence.recommendedStartingBpm;

  const minimumBpm =
    startingBpm?.minimum ??
    95;

  const maximumBpm =
    startingBpm?.maximum ??
    110;

  const strongGenres =
    intelligence.strongestGenres
      .map(
        (genre) =>
          genre.genre.trim(),
      )
      .filter(Boolean)
      .slice(
        0,
        5,
      );

  const history =
    loadLivePerformanceHistory();

  const phaseLearning =
    buildVenuePhaseLearning(
      history,
      intelligence.profile,
    );

  const phasePlans =
    phaseLearning.phases.map(
      (phase) =>
        buildPhasePlan(
          phase,
          minimumBpm,
          maximumBpm,
          strongGenres,
        ),
    );

  return {
    id:
      `pre-event-preset-${Date.now()}`,

    profileId:
      intelligence.profile?.id ??
      null,

    profileName:
      intelligence.profile?.name ??
      "Global / No Venue",

    createdAt:
      new Date().toISOString(),

    minimumBpm,

    maximumBpm,

    journeyTemplateId:
      intelligence.recommendedJourney,

    strongGenres,

    reliableTrackIds:
      intelligence.reliableTracks
        .map(
          (track) =>
            track.trackId,
        )
        .slice(
          0,
          20,
        ),

    crowdRescueTrackIds:
      intelligence.crowdRescueTracks
        .map(
          (track) =>
            track.trackId,
        )
        .slice(
          0,
          20,
        ),

    reviewTrackIds:
      intelligence.tracksToReview
        .map(
          (track) =>
            track.trackId,
        )
        .slice(
          0,
          20,
        ),

    sourceSessions:
      intelligence.sessionsAnalyzed,

    readinessScore:
      intelligence.readinessScore,

    phasePlans,
  };
}
