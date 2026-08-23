import type { Track } from "../types/track";

import type {
  SetEditorMode,
  SetEditorSuggestion,
} from "../types/setEditor";

import {
  getTrackCamelot,
  scoreSongMatch,
} from "./matchSongs";

function clamp(
  value: number,
  minimum = 0,
  maximum = 1,
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

function getBpm(
  track: Track,
): number | null {
  return (
    typeof track.tempo ===
      "number" &&
    Number.isFinite(
      track.tempo,
    )
      ? track.tempo
      : null
  );
}


function getSideScore(
  source: Track | null,
  candidate: Track,
): {
  score: number | null;
  camelotScore: number | null;
  energyScore: number | null;
} {
  if (!source) {
    return {
      score: null,
      camelotScore: null,
      energyScore: null,
    };
  }

  const result =
    scoreSongMatch(
      source,
      candidate,
      {
        mode: "cross-style",
        minimumScore: 0,
        requireGenreMatch: false,
        maxBpmDifference: 24,
        maxEnergyDifference: 5,
        popularityPreference:
          "similar",
      },
    );

  if (!result) {
    return {
      score: 0,
      camelotScore: 0,
      energyScore: 0,
    };
  }

  return {
    score:
      result.score,

    camelotScore:
      result.breakdown
        .camelot,

    energyScore:
      result.breakdown
        .energy,
  };
}

function getBpmPriorityScore(
  previousTrack: Track | null,
  nextTrack: Track | null,
  candidate: Track,
): number {
  const candidateBpm =
    getBpm(candidate);

  if (
    candidateBpm === null
  ) {
    return 0;
  }

  const previousBpm =
    previousTrack
      ? getBpm(
          previousTrack,
        )
      : null;

  const nextBpm =
    nextTrack
      ? getBpm(
          nextTrack,
        )
      : null;

  if (
    previousBpm !== null &&
    nextBpm !== null
  ) {
    const minimum =
      Math.min(
        previousBpm,
        nextBpm,
      );

    const maximum =
      Math.max(
        previousBpm,
        nextBpm,
      );

    /*
     * Strong preference for BPM values that
     * keep the current set in ascending order.
     */
    if (
      candidateBpm >=
        minimum &&
      candidateBpm <=
        maximum
    ) {
      const midpoint =
        (
          minimum +
          maximum
        ) / 2;

      const halfRange =
        Math.max(
          (
            maximum -
            minimum
          ) / 2,
          1,
        );

      return (
        0.9 +
        clamp(
          1 -
            Math.abs(
              candidateBpm -
                midpoint,
            ) /
              halfRange,
        ) *
          0.1
      );
    }

    const distance =
      candidateBpm <
      minimum
        ? minimum -
          candidateBpm
        : candidateBpm -
          maximum;

    return clamp(
      0.75 -
        distance /
          24,
    );
  }

  if (
    previousBpm !== null
  ) {
    if (
      candidateBpm >=
      previousBpm
    ) {
      return clamp(
        1 -
          (
            candidateBpm -
            previousBpm
          ) /
            18,
      );
    }

    return clamp(
      0.55 -
        (
          previousBpm -
          candidateBpm
        ) /
          18,
    );
  }

  if (
    nextBpm !== null
  ) {
    if (
      candidateBpm <=
      nextBpm
    ) {
      return clamp(
        1 -
          (
            nextBpm -
            candidateBpm
          ) /
            18,
      );
    }

    return clamp(
      0.55 -
        (
          candidateBpm -
          nextBpm
        ) /
          18,
    );
  }

  return 0.5;
}

function averageAvailable(
  values:
    Array<number | null>,
  fallback = 0.5,
): number {
  const available =
    values.filter(
      (
        value,
      ): value is number =>
        value !== null,
    );

  if (
    available.length ===
    0
  ) {
    return fallback;
  }

  return (
    available.reduce(
      (
        total,
        value,
      ) =>
        total +
        value,
      0,
    ) /
    available.length
  );
}

export function getSetEditorSuggestions(
  mode: SetEditorMode,
  previousTrack: Track | null,
  nextTrack: Track | null,
  candidates: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  limit = 12,
): SetEditorSuggestion<Track>[] {
  return candidates
    .filter(
      (candidate) =>
        !excludedTrackIds.has(
          candidate.id,
        ),
    )
    .map(
      (candidate) => {
        const previous =
          getSideScore(
            previousTrack,
            candidate,
          );

        /*
         * scoreSongMatch is directional enough for our
         * use here: candidate becomes the source when
         * evaluating the following track.
         */
        const next =
          nextTrack
            ? getSideScore(
                candidate,
                nextTrack,
              )
            : {
                score: null,
                camelotScore:
                  null,
                energyScore:
                  null,
              };

        const bpmPriorityScore =
          getBpmPriorityScore(
            previousTrack,
            nextTrack,
            candidate,
          );

        const camelotScore =
          averageAvailable(
            [
              previous.camelotScore,
              next.camelotScore,
            ],
          );

        const energyScore =
          averageAvailable(
            [
              previous.energyScore,
              next.energyScore,
            ],
          );

        const compatibilityScore =
          averageAvailable(
            [
              previous.score,
              next.score,
            ],
          );

        /*
         * Current Flamingo priority:
         * 1. BPM
         * 2. Camelot / key compatibility
         * 3. Energy / general compatibility
         *
         * Replacement is slightly stricter because the
         * candidate must work with both neighbours.
         */
        const bpmWeight =
          mode === "replace"
            ? 0.5
            : 0.54;

        const camelotWeight =
          0.24;

        const energyWeight =
          0.1;

        const compatibilityWeight =
          1 -
          bpmWeight -
          camelotWeight -
          energyWeight;

        const finalScore =
          bpmPriorityScore *
            bpmWeight +
          camelotScore *
            camelotWeight +
          energyScore *
            energyWeight +
          compatibilityScore *
            compatibilityWeight;

        return {
          track:
            candidate,

          percentage:
            Math.round(
              finalScore *
                100,
            ),

          bpmPriorityScore,

          camelotScore,
          energyScore,
          compatibilityScore,

          previousScore:
            previous.score,

          nextScore:
            next.score,

          bpm:
            getBpm(
              candidate,
            ),

          musicalKey:
            candidate.musicalKey ??
            null,

          camelot:
            getTrackCamelot(
              candidate,
            ),
        };
      },
    )
    .sort(
      (
        left,
        right,
      ) => {
        /*
         * Explicit sort hierarchy:
         * BPM first, Camelot second,
         * then final score.
         */
        if (
          right.bpmPriorityScore !==
          left.bpmPriorityScore
        ) {
          return (
            right.bpmPriorityScore -
            left.bpmPriorityScore
          );
        }

        if (
          right.camelotScore !==
          left.camelotScore
        ) {
          return (
            right.camelotScore -
            left.camelotScore
          );
        }

        if (
          right.percentage !==
          left.percentage
        ) {
          return (
            right.percentage -
            left.percentage
          );
        }

        return (
          (left.bpm ??
            Number.POSITIVE_INFINITY) -
          (right.bpm ??
            Number.POSITIVE_INFINITY)
        );
      },
    )
    .slice(
      0,
      Math.max(
        1,
        limit,
      ),
    );
}
