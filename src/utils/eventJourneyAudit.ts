import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

import type {
  SetJourneyAnalysis,
  SetJourneyPoint,
} from "../types/setJourney";

import {
  getTrackGenres,
  normalizeGenre,
} from "./matchSongs";

export type EventPlanTrackAudit = {
  point:
    SetJourneyPoint;

  phaseIndex: number;
  phaseName: string;

  genreMatch: boolean;
  bpmMatch: boolean;

  score: number;
};

export type EventPlanPhaseAudit = {
  phaseIndex: number;
  phaseName: string;

  plannedGenres: string[];

  minimumBpm: number;
  maximumBpm: number;

  trackCount: number;

  genreMatchCount: number;
  bpmMatchCount: number;

  percentage: number;
};

export type EventPlanAudit = {
  percentage: number;

  trackAudits:
    EventPlanTrackAudit[];

  phaseAudits:
    EventPlanPhaseAudit[];
};

function trackMatchesGenres(
  point: SetJourneyPoint,
  genres: readonly string[],
): boolean {
  const cleaned =
    genres
      .map(
        normalizeGenre,
      )
      .filter(Boolean);

  if (
    cleaned.length ===
    0 ||
    cleaned.includes(
      "all",
    )
  ) {
    return true;
  }

  const trackGenres =
    getTrackGenres(
      point.track,
    ).map(
      normalizeGenre,
    );

  return cleaned.some(
    (requested) =>
      trackGenres.some(
        (genre) =>
          genre ===
            requested ||
          genre.includes(
            requested,
          ) ||
          requested.includes(
            genre,
          ),
      ),
  );
}

function getPhaseBoundaries(
  plan: SetlistEventPlan,
): Array<{
  startSeconds: number;
  endSeconds: number;
}> {
  let cursor =
    0;

  return plan.phases.map(
    (phase) => {
      const startSeconds =
        cursor;

      const endSeconds =
        startSeconds +
        Math.max(
          1,
          phase.durationMinutes,
        ) *
          60;

      cursor =
        endSeconds;

      return {
        startSeconds,
        endSeconds,
      };
    },
  );
}

function resolvePhaseIndex(
  point: SetJourneyPoint,
  boundaries:
    ReturnType<
      typeof getPhaseBoundaries
    >,
): number {
  const midpoint =
    point.startSeconds +
    (
      point.endSeconds -
      point.startSeconds
    ) /
      2;

  const found =
    boundaries.findIndex(
      (boundary) =>
        midpoint >=
          boundary.startSeconds &&
        midpoint <
          boundary.endSeconds,
    );

  if (found >= 0) {
    return found;
  }

  return Math.max(
    0,
    boundaries.length - 1,
  );
}

export function auditEventPlan(
  journey: SetJourneyAnalysis,
  plan: SetlistEventPlan | null,
): EventPlanAudit | null {
  if (
    !plan ||
    plan.phases.length ===
      0 ||
    journey.points.length ===
      0
  ) {
    return null;
  }

  const boundaries =
    getPhaseBoundaries(
      plan,
    );

  const trackAudits =
    journey.points.map(
      (point) => {
        const phaseIndex =
          resolvePhaseIndex(
            point,
            boundaries,
          );

        const phase =
          plan.phases[
            phaseIndex
          ];

        const genreMatch =
          trackMatchesGenres(
            point,
            phase.genres,
          );

        const bpmMatch =
          point.bpm ===
            null ||
          (
            point.bpm >=
              phase.minimumBpm &&
            point.bpm <=
              phase.maximumBpm
          );

        const score =
          (
            (
              genreMatch
                ? 1
                : 0
            ) *
              0.55 +
            (
              bpmMatch
                ? 1
                : 0
            ) *
              0.45
          );

        return {
          point,
          phaseIndex,
          phaseName:
            phase.name,
          genreMatch,
          bpmMatch,
          score,
        };
      },
    );

  const phaseAudits =
    plan.phases.map(
      (
        phase,
        phaseIndex,
      ) => {
        const tracks =
          trackAudits.filter(
            (audit) =>
              audit.phaseIndex ===
              phaseIndex,
          );

        const genreMatchCount =
          tracks.filter(
            (audit) =>
              audit.genreMatch,
          ).length;

        const bpmMatchCount =
          tracks.filter(
            (audit) =>
              audit.bpmMatch,
          ).length;

        const percentage =
          tracks.length ===
            0
            ? 0
            : Math.round(
                (
                  tracks.reduce(
                    (
                      total,
                      audit,
                    ) =>
                      total +
                      audit.score,
                    0,
                  ) /
                  tracks.length
                ) *
                  100,
              );

        return {
          phaseIndex,
          phaseName:
            phase.name,

          plannedGenres:
            [...phase.genres],

          minimumBpm:
            phase.minimumBpm,

          maximumBpm:
            phase.maximumBpm,

          trackCount:
            tracks.length,

          genreMatchCount,
          bpmMatchCount,

          percentage,
        };
      },
    );

  const percentage =
    trackAudits.length ===
      0
      ? 0
      : Math.round(
          (
            trackAudits.reduce(
              (
                total,
                audit,
              ) =>
                total +
                audit.score,
              0,
            ) /
            trackAudits.length
          ) *
            100,
        );

  return {
    percentage,
    trackAudits,
    phaseAudits,
  };
}
