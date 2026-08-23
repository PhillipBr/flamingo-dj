import type { Track } from "../types/track";

import type {
  LiveCrossStyleGroup,
  LiveTransition,
} from "../types/liveSession";

import {
  getTrackGenres,
  matchCrossStyle,
  matchSameStyle,
  normalizeGenre,
  scoreSongMatch,
  type SongMatch,
} from "./matchSongs";

function getTransitionLabel(
  score: number,
): LiveTransition["label"] {
  if (score >= 0.9) {
    return "Excellent";
  }

  if (score >= 0.78) {
    return "Good";
  }

  if (score >= 0.62) {
    return "Warning";
  }

  return "Poor";
}

export function analyzeLiveTransition(
  source: Track | null,
  candidate: Track | null,
): LiveTransition | null {
  if (
    !source ||
    !candidate
  ) {
    return null;
  }

  const match =
    scoreSongMatch(
      source,
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

  if (!match) {
    return {
      score: 0,
      percentage: 0,
      bpmDifference: null,
      energyDifference: null,
      sourceCamelot: null,
      candidateCamelot: null,
      genreScore: 0,
      camelotScore: 0,
      bpmScore: 0,
      energyScore: 0,
      label: "Poor",
    };
  }

  return {
    score:
      match.score,

    percentage:
      match.percentage,

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

    label:
      getTransitionLabel(
        match.score,
      ),
  };
}

function getBpm(
  track: Track,
): number {
  return (
    typeof track.tempo ===
      "number" &&
    Number.isFinite(
      track.tempo,
    )
      ? track.tempo
      : Number.POSITIVE_INFINITY
  );
}

function bpmFirstSort(
  left: SongMatch<Track>,
  right: SongMatch<Track>,
  sourceTrack: Track,
): number {
  const sourceBpm =
    getBpm(
      sourceTrack,
    );

  const leftDistance =
    Math.abs(
      getBpm(
        left.track,
      ) -
        sourceBpm,
    );

  const rightDistance =
    Math.abs(
      getBpm(
        right.track,
      ) -
        sourceBpm,
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

  if (
    right.breakdown.camelot !==
    left.breakdown.camelot
  ) {
    return (
      right.breakdown.camelot -
      left.breakdown.camelot
    );
  }

  if (
    right.breakdown.energy !==
    left.breakdown.energy
  ) {
    return (
      right.breakdown.energy -
      left.breakdown.energy
    );
  }

  return (
    right.score -
    left.score
  );
}

export function getLiveSuggestions(
  currentTrack: Track | null,
  tracks: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  limit = 5,
): SongMatch<Track>[] {
  if (!currentTrack) {
    return [];
  }

  return matchSameStyle(
    currentTrack,
    tracks.filter(
      (track) =>
        !excludedTrackIds.has(
          track.id,
        ),
    ),
    {
      limit: 40,
      minimumScore: 0.3,
      requireGenreMatch:
        false,
      maxBpmDifference: 18,
      popularityPreference:
        "higher",
    },
  )
    .sort(
      (
        left,
        right,
      ) =>
        bpmFirstSort(
          left,
          right,
          currentTrack,
        ),
    )
    .slice(
      0,
      Math.max(
        1,
        limit,
      ),
    );
}

function getCrossStyleName(
  result: SongMatch<Track>,
): string {
  const pair =
    result.explanation
      .matchedGenrePair;

  if (
    pair?.[1]
  ) {
    return normalizeGenre(
      pair[1],
    );
  }

  const genres =
    getTrackGenres(
      result.track,
    );

  return normalizeGenre(
    genres[0] ??
      result.track.genre ??
      "other",
  );
}

export function getLiveCrossStyleGroups(
  currentTrack: Track | null,
  tracks: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  groupLimit = 3,
  tracksPerGroup = 5,
): LiveCrossStyleGroup<Track>[] {
  if (!currentTrack) {
    return [];
  }

  const results =
    matchCrossStyle(
      currentTrack,
      tracks.filter(
        (track) =>
          !excludedTrackIds.has(
            track.id,
          ),
      ),
      {
        limit: 150,
        minimumScore: 0.25,
        requireGenreMatch:
          false,
        maxBpmDifference: 26,
        popularityPreference:
          "higher",
      },
    );

  const grouped =
    new Map<
      string,
      SongMatch<Track>[]
    >();

  results.forEach(
    (result) => {
      const style =
        getCrossStyleName(
          result,
        );

      if (
        !style ||
        style === "other"
      ) {
        return;
      }

      const current =
        grouped.get(style) ??
        [];

      current.push(
        result,
      );

      grouped.set(
        style,
        current,
      );
    },
  );

  return [
    ...grouped.entries(),
  ]
    .map(
      ([
        style,
        matches,
      ]) => {
        const sorted =
          [...matches]
            .sort(
              (
                left,
                right,
              ) =>
                bpmFirstSort(
                  left,
                  right,
                  currentTrack,
                ),
            )
            .slice(
              0,
              tracksPerGroup,
            );

        return {
          style,
          tracks:
            sorted.map(
              (match) => ({
                track:
                  match.track,
                percentage:
                  match.percentage,
                score:
                  match.score,
              }),
            ),
          bestScore:
            sorted[0]
              ?.score ?? 0,
        };
      },
    )
    .filter(
      (group) =>
        group.tracks
          .length > 0,
    )
    .sort(
      (
        left,
        right,
      ) => {
        if (
          right.tracks.length !==
          left.tracks.length
        ) {
          return (
            right.tracks.length -
            left.tracks.length
          );
        }

        return (
          right.bestScore -
          left.bestScore
        );
      },
    )
    .slice(
      0,
      groupLimit,
    )
    .map(
      ({
        style,
        tracks:
          groupTracks,
      }) => ({
        style,
        tracks:
          groupTracks,
      }),
    );
}
