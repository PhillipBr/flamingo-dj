import type { Track } from "../types/track";

import type {
  PlaylistRepairIssue,
  PlaylistRepairResult,
  PlaylistRepairSuggestion,
} from "../types/playlistRepair";

import {
  analyzeSet,
  findBridgeTracks,
} from "./analyzeSet";

import {
  scoreSongMatch,
} from "./matchSongs";

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

function normalizeArtist(
  artist: string,
): string {
  return artist
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function issueTitle(
  transition: ReturnType<
    typeof analyzeSet
  >["transitions"][number],
): string {
  if (
    transition.issues.some(
      (issue) =>
        issue.type ===
        "bpm",
    )
  ) {
    return "Abrupt BPM jump";
  }

  if (
    transition.issues.some(
      (issue) =>
        issue.type ===
        "camelot",
    )
  ) {
    return "Weak Key / Camelot transition";
  }

  if (
    transition.issues.some(
      (issue) =>
        issue.type ===
        "energy",
    )
  ) {
    return "Energy jump";
  }

  if (
    transition.issues.some(
      (issue) =>
        issue.type ===
        "genre",
    )
  ) {
    return "Weak genre transition";
  }

  return "Weak transition";
}

function issueDetail(
  transition: ReturnType<
    typeof analyzeSet
  >["transitions"][number],
): string {
  const details =
    transition.issues.map(
      (issue) =>
        issue.detail,
    );

  if (
    details.length ===
    0
  ) {
    return `Transition score: ${transition.percentage}%`;
  }

  return details.join(" · ");
}

function buildTransitionIssues(
  playlistTracks: readonly Track[],
): PlaylistRepairIssue[] {
  const analysis =
    analyzeSet(
      playlistTracks,
    );

  return analysis.transitions
    .filter(
      (transition) =>
        transition.severity ===
          "warning" ||
        transition.severity ===
          "poor",
    )
    .map(
      (transition) => {
        const sourceTrack =
          playlistTracks[
            transition.index
          ];

        const nextTrack =
          playlistTracks[
            transition.index +
              1
          ];

        return {
          id:
            `transition-${transition.index}-${sourceTrack.id}-${nextTrack.id}`,

          type:
            "transition",

          severity:
            transition.severity ===
            "poor"
              ? "poor"
              : "warning",

          position:
            transition.index,

          sourceTrack,
          nextTrack,

          percentage:
            transition.percentage,

          title:
            issueTitle(
              transition,
            ),

          detail:
            issueDetail(
              transition,
            ),
        };
      },
    );
}

function buildArtistIssues(
  playlistTracks: readonly Track[],
): PlaylistRepairIssue[] {
  const issues:
    PlaylistRepairIssue[] = [];

  for (
    let index = 0;
    index <
    playlistTracks.length - 1;
    index += 1
  ) {
    const sourceTrack =
      playlistTracks[index];

    const nextTrack =
      playlistTracks[
        index + 1
      ];

    if (
      normalizeArtist(
        sourceTrack.artist,
      ) ===
      normalizeArtist(
        nextTrack.artist,
      )
    ) {
      issues.push({
        id:
          `artist-${index}-${sourceTrack.id}-${nextTrack.id}`,

        type:
          "artist",

        severity:
          "warning",

        position:
          index,

        sourceTrack,
        nextTrack,

        percentage:
          60,

        title:
          "Same artist back-to-back",

        detail:
          `${sourceTrack.artist} appears on two consecutive tracks.`,
      });
    }
  }

  return issues;
}

function buildBridgeSuggestion(
  issue: PlaylistRepairIssue,
  allTracks: readonly Track[],
  playlistTrackIds:
    ReadonlySet<string>,
): PlaylistRepairSuggestion {
  const excludedIds =
    new Set(
      playlistTrackIds,
    );

  /*
   * A bridge may come from the whole loaded library.
   * Existing playlist tracks are excluded to avoid duplicates.
   */
  const suggestions =
    findBridgeTracks(
      issue.sourceTrack,
      issue.nextTrack,
      allTracks,
      excludedIds,
      1,
    );

  const best =
    suggestions[0] ??
    null;

  return {
    issueId:
      issue.id,

    bridgeTrack:
      best?.track ??
      null,

    bridgePercentage:
      best?.percentage ??
      null,
  };
}

export function analyzePlaylistRepair(
  playlistTracks: readonly Track[],
  allTracks: readonly Track[],
): PlaylistRepairResult {
  const transitionAnalysis =
    analyzeSet(
      playlistTracks,
    );

  const transitionIssues =
    buildTransitionIssues(
      playlistTracks,
    );

  const artistIssues =
    buildArtistIssues(
      playlistTracks,
    );

  const issues = [
    ...transitionIssues,
    ...artistIssues,
  ].sort(
    (
      left,
      right,
    ) =>
      left.position -
      right.position,
  );

  const playlistTrackIds =
    new Set(
      playlistTracks.map(
        (track) =>
          track.id,
      ),
    );

  const suggestions =
    transitionIssues.map(
      (issue) =>
        buildBridgeSuggestion(
          issue,
          allTracks,
          playlistTrackIds,
        ),
    );

  const poorPenalty =
    transitionAnalysis.summary
      .poorCount * 8;

  const warningPenalty =
    transitionAnalysis.summary
      .warningCount * 4;

  const artistPenalty =
    artistIssues.length * 3;

  const healthScore =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            poorPenalty -
            warningPenalty -
            artistPenalty,
        ),
      ),
    );

  const bpmProblems =
    transitionAnalysis.transitions.filter(
      (transition) =>
        transition.issues.some(
          (issue) =>
            issue.type ===
            "bpm",
        ),
    ).length;

  const energyProblems =
    transitionAnalysis.transitions.filter(
      (transition) =>
        transition.issues.some(
          (issue) =>
            issue.type ===
            "energy",
        ),
    ).length;

  const camelotProblems =
    transitionAnalysis.transitions.filter(
      (transition) =>
        transition.issues.some(
          (issue) =>
            issue.type ===
            "camelot",
        ),
    ).length;

  const genreProblems =
    transitionAnalysis.transitions.filter(
      (transition) =>
        transition.issues.some(
          (issue) =>
            issue.type ===
            "genre",
        ),
    ).length;

  return {
    summary: {
      healthScore,

      transitionCount:
        transitionAnalysis.summary
          .transitionCount,

      excellentCount:
        transitionAnalysis.summary
          .excellentCount,

      goodCount:
        transitionAnalysis.summary
          .goodCount,

      warningCount:
        transitionAnalysis.summary
          .warningCount,

      poorCount:
        transitionAnalysis.summary
          .poorCount,

      bpmProblems,
      energyProblems,
      camelotProblems,
      genreProblems,

      artistProblems:
        artistIssues.length,
    },

    issues,
    suggestions,
  };
}

function candidateScore(
  previousTrack: Track,
  candidate: Track,
): number {
  const previousBpm =
    getBpm(
      previousTrack,
    );

  const candidateBpm =
    getBpm(
      candidate,
    );

  if (
    previousBpm !== null &&
    candidateBpm !== null &&
    candidateBpm <
      previousBpm
  ) {
    return -1;
  }

  const match =
    scoreSongMatch(
      previousTrack,
      candidate,
      {
        mode:
          "same-style",

        minimumScore: 0,

        requireGenreMatch:
          false,

        maxBpmDifference:
          30,

        maxEnergyDifference:
          5,

        popularityPreference:
          "similar",
      },
    );

  if (!match) {
    return -1;
  }

  const bpmDifference =
    previousBpm !== null &&
    candidateBpm !== null
      ? Math.abs(
          candidateBpm -
            previousBpm,
        )
      : 12;

  const bpmPriority =
    Math.max(
      0,
      1 -
        bpmDifference /
          16,
    );

  return (
    bpmPriority * 0.44 +
    match.breakdown.camelot *
      0.23 +
    match.breakdown.energy *
      0.14 +
    match.breakdown.genre *
      0.11 +
    match.breakdown.popularity *
      0.08
  );
}

/*
 * Creates a non-destructive AUTO REPAIR PREVIEW.
 *
 * Rule:
 * - Lowest BPM first.
 * - BPM never decreases.
 * - Among nearby BPM tracks, Key/Camelot is second priority.
 * - Energy, genre and popularity follow.
 */
export function buildAutoRepairOrder(
  playlistTracks: readonly Track[],
): Track[] {
  if (
    playlistTracks.length <=
    1
  ) {
    return [
      ...playlistTracks,
    ];
  }

  const remaining = [
    ...playlistTracks,
  ];

  remaining.sort(
    (
      left,
      right,
    ) => {
      const leftBpm =
        getBpm(left) ??
        Number.POSITIVE_INFINITY;

      const rightBpm =
        getBpm(right) ??
        Number.POSITIVE_INFINITY;

      return (
        leftBpm -
        rightBpm
      );
    },
  );

  const first =
    remaining.shift();

  if (!first) {
    return [];
  }

  const result:
    Track[] = [
      first,
    ];

  while (
    remaining.length >
    0
  ) {
    const previousTrack =
      result[
        result.length - 1
      ];

    const previousBpm =
      getBpm(
        previousTrack,
      );

    const eligible =
      remaining
        .map(
          (
            candidate,
            index,
          ) => ({
            candidate,
            index,
            bpm:
              getBpm(
                candidate,
              ),
            score:
              candidateScore(
                previousTrack,
                candidate,
              ),
          }),
        )
        .filter(
          (item) =>
            item.score >= 0 &&
            (
              previousBpm ===
                null ||
              item.bpm ===
                null ||
              item.bpm >=
                previousBpm
            ),
        )
        .sort(
          (
            left,
            right,
          ) => {
            const leftBpm =
              left.bpm ??
              Number.POSITIVE_INFINITY;

            const rightBpm =
              right.bpm ??
              Number.POSITIVE_INFINITY;

            const leftDistance =
              previousBpm ===
              null
                ? leftBpm
                : Math.abs(
                    leftBpm -
                      previousBpm,
                  );

            const rightDistance =
              previousBpm ===
              null
                ? rightBpm
                : Math.abs(
                    rightBpm -
                      previousBpm,
                  );

            if (
              leftDistance !==
              rightDistance
            ) {
              return (
                leftDistance -
                rightDistance
              );
            }

            return (
              right.score -
              left.score
            );
          },
        );

    const best =
      eligible[0];

    if (!best) {
      remaining.sort(
        (
          left,
          right,
        ) =>
          (
            getBpm(
              left,
            ) ??
            Number.POSITIVE_INFINITY
          ) -
          (
            getBpm(
              right,
            ) ??
            Number.POSITIVE_INFINITY
          ),
      );

      result.push(
        ...remaining,
      );

      break;
    }

    const [
      selected,
    ] =
      remaining.splice(
        best.index,
        1,
      );

    result.push(
      selected,
    );
  }

  return result;
}
