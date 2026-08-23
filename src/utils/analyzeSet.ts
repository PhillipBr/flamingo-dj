import type { Track } from "../types/track";

import type {
  BridgeTrackSuggestion,
  SetAnalysisResult,
  SetAnalysisSummary,
  SetTransitionAnalysis,
  SetTransitionIssue,
  TransitionSeverity,
} from "../types/setAnalysis";

import {
  scoreSongMatch,
} from "./matchSongs";

function getSeverity(
  score: number,
): TransitionSeverity {
  if (score >= 0.9) {
    return "excellent";
  }

  if (score >= 0.78) {
    return "good";
  }

  if (score >= 0.62) {
    return "warning";
  }

  return "poor";
}

function normalizeArtist(
  artist: string,
): string {
  return artist
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildIssues(
  source: Track,
  candidate: Track,
  transition: Omit<
    SetTransitionAnalysis,
    "issues"
  >,
): SetTransitionIssue[] {
  const issues:
    SetTransitionIssue[] = [];

  if (
    transition.bpmDifference !==
      null &&
    transition.bpmDifference > 8
  ) {
    issues.push({
      type: "bpm",
      label: "Large BPM jump",
      detail: `BPM difference: ${transition.bpmDifference.toFixed(
        1,
      )}`,
    });
  }

  if (
    transition.energyDifference !==
      null &&
    transition.energyDifference > 2
  ) {
    issues.push({
      type: "energy",
      label: "Large energy jump",
      detail: `Energy difference: ${transition.energyDifference.toFixed(
        1,
      )}`,
    });
  }

  if (
    transition.camelotScore <
    0.55
  ) {
    issues.push({
      type: "camelot",
      label: "Weak key compatibility",
      detail: `${
        transition.sourceCamelot ??
        "—"
      } → ${
        transition.candidateCamelot ??
        "—"
      }`,
    });
  }

  if (
    transition.genreScore <
    0.45
  ) {
    issues.push({
      type: "genre",
      label: "Weak genre transition",
      detail:
        "The two tracks do not have a strong same-style or cross-style relationship.",
    });
  }

  if (
    normalizeArtist(
      source.artist,
    ) ===
    normalizeArtist(
      candidate.artist,
    )
  ) {
    issues.push({
      type: "artist",
      label: "Same artist back-to-back",
      detail:
        "Consider spacing tracks from the same artist.",
    });
  }

  if (
    transition.popularityScore <
    0.3
  ) {
    issues.push({
      type: "popularity",
      label: "Large popularity change",
      detail:
        "Popularity changes sharply between these tracks.",
    });
  }

  return issues;
}

function analyzeTransition(
  source: Track,
  candidate: Track,
  index: number,
): SetTransitionAnalysis {
  const match =
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

  if (!match) {
    return {
      index,
      sourceTrackId:
        source.id,
      candidateTrackId:
        candidate.id,
      score: 0,
      percentage: 0,
      severity: "poor",
      bpmDifference: null,
      energyDifference: null,
      sourceCamelot: null,
      candidateCamelot: null,
      genreScore: 0,
      camelotScore: 0,
      bpmScore: 0,
      energyScore: 0,
      popularityScore: 0,
      issues: [
        {
          type: "genre",
          label:
            "Transition could not be scored",
          detail:
            "The match engine could not calculate this transition.",
        },
      ],
    };
  }

  const base:
    Omit<
      SetTransitionAnalysis,
      "issues"
    > = {
    index,

    sourceTrackId:
      source.id,

    candidateTrackId:
      candidate.id,

    score:
      match.score,

    percentage:
      match.percentage,

    severity:
      getSeverity(
        match.score,
      ),

    bpmDifference:
      match.explanation
        .normalizedBpmDifference,

    energyDifference:
      match.explanation
        .energyDifference,

    sourceCamelot:
      match.explanation
        .sourceCamelot,

    candidateCamelot:
      match.explanation
        .candidateCamelot,

    genreScore:
      match.breakdown.genre,

    camelotScore:
      match.breakdown.camelot,

    bpmScore:
      match.breakdown.bpm,

    energyScore:
      match.breakdown.energy,

    popularityScore:
      match.breakdown.popularity,
  };

  return {
    ...base,
    issues:
      buildIssues(
        source,
        candidate,
        base,
      ),
  };
}

function buildSummary(
  transitions:
    SetTransitionAnalysis[],
): SetAnalysisSummary {
  const transitionCount =
    transitions.length;

  const averageScore =
    transitionCount === 0
      ? 0
      : transitions.reduce(
          (
            total,
            transition,
          ) =>
            total +
            transition.score,
          0,
        ) /
        transitionCount;

  const countSeverity = (
    severity: TransitionSeverity,
  ) =>
    transitions.filter(
      (transition) =>
        transition.severity ===
        severity,
    ).length;

  return {
    transitionCount,

    averageScore,

    averagePercentage:
      Math.round(
        averageScore * 100,
      ),

    excellentCount:
      countSeverity(
        "excellent",
      ),

    goodCount:
      countSeverity(
        "good",
      ),

    warningCount:
      countSeverity(
        "warning",
      ),

    poorCount:
      countSeverity(
        "poor",
      ),

    repeatedArtistWarnings:
      transitions.filter(
        (transition) =>
          transition.issues.some(
            (issue) =>
              issue.type ===
              "artist",
          ),
      ).length,

    weakGenreTransitions:
      transitions.filter(
        (transition) =>
          transition.genreScore <
          0.45,
      ).length,

    weakCamelotTransitions:
      transitions.filter(
        (transition) =>
          transition.camelotScore <
          0.55,
      ).length,

    largeBpmJumps:
      transitions.filter(
        (transition) =>
          transition.bpmDifference !==
            null &&
          transition.bpmDifference >
            8,
      ).length,

    largeEnergyJumps:
      transitions.filter(
        (transition) =>
          transition.energyDifference !==
            null &&
          transition.energyDifference >
            2,
      ).length,
  };
}

export function analyzeSet(
  setTracks: readonly Track[],
): SetAnalysisResult {
  const transitions:
    SetTransitionAnalysis[] =
      [];

  for (
    let index = 0;
    index <
    setTracks.length - 1;
    index += 1
  ) {
    transitions.push(
      analyzeTransition(
        setTracks[index],
        setTracks[index + 1],
        index,
      ),
    );
  }

  return {
    transitions,
    summary:
      buildSummary(
        transitions,
      ),
  };
}

export function findBridgeTracks(
  sourceTrack: Track,
  nextTrack: Track,
  candidates: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  limit = 8,
): BridgeTrackSuggestion<Track>[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.id !==
          sourceTrack.id &&
        candidate.id !==
          nextTrack.id &&
        !excludedTrackIds.has(
          candidate.id,
        ),
    )
    .map((candidate) => {
      const first =
        scoreSongMatch(
          sourceTrack,
          candidate,
          {
            mode:
              "cross-style",
            minimumScore: 0,
            requireGenreMatch:
              false,
            maxBpmDifference: 24,
            maxEnergyDifference: 5,
            popularityPreference:
              "similar",
          },
        );

      const second =
        scoreSongMatch(
          candidate,
          nextTrack,
          {
            mode:
              "cross-style",
            minimumScore: 0,
            requireGenreMatch:
              false,
            maxBpmDifference: 24,
            maxEnergyDifference: 5,
            popularityPreference:
              "similar",
          },
        );

      if (
        !first ||
        !second
      ) {
        return null;
      }

      const combinedScore =
        first.score *
        second.score;

      return {
        track: candidate,
        sourceToBridgeScore:
          first.score,
        bridgeToNextScore:
          second.score,
        combinedScore,
        percentage:
          Math.round(
            Math.sqrt(
              combinedScore,
            ) * 100,
          ),
      };
    })
    .filter(
      (
        suggestion,
      ): suggestion is BridgeTrackSuggestion<Track> =>
        suggestion !== null,
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.combinedScore -
        left.combinedScore,
    )
    .slice(
      0,
      Math.max(
        1,
        limit,
      ),
    );
}
