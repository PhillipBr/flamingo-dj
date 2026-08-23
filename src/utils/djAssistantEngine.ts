import type { Track } from "../types/track";

import type {
  DjAssistantInsight,
  DjAssistantRecommendation,
} from "../types/djAssistant";

import {
  getTrackCamelot,
  getTrackGenres,
  normalizeGenre,
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

function getEnergy(
  track: Track,
): number | null {
  return (
    typeof track.energy ===
      "number" &&
    Number.isFinite(
      track.energy,
    )
      ? track.energy
      : null
  );
}

function average(
  values: Array<number | null>,
): number | null {
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
    return null;
  }

  return (
    available.reduce(
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
    available.length
  );
}

function getDominantGenres(
  tracks: readonly Track[],
): string[] {
  const counts =
    new Map<string, number>();

  tracks.forEach(
    (track) => {
      getTrackGenres(
        track,
      ).forEach(
        (genre) => {
          const normalized =
            normalizeGenre(
              genre,
            );

          if (!normalized) {
            return;
          }

          counts.set(
            normalized,
            (
              counts.get(
                normalized,
              ) ?? 0
            ) + 1,
          );
        },
      );
    },
  );

  return [
    ...counts.entries(),
  ]
    .sort(
      (
        left,
        right,
      ) =>
        right[1] -
        left[1],
    )
    .slice(0, 3)
    .map(
      ([genre]) =>
        genre,
    );
}

function estimateGenreMinutes(
  recentTracks: readonly Track[],
  averagePlaySeconds: number,
): number {
  if (
    recentTracks.length ===
    0
  ) {
    return 0;
  }

  const dominant =
    getDominantGenres(
      recentTracks,
    )[0];

  if (!dominant) {
    return 0;
  }

  const matchingCount =
    recentTracks.filter(
      (track) =>
        getTrackGenres(
          track,
        ).some(
          (genre) =>
            normalizeGenre(
              genre,
            ) ===
            dominant,
        ),
    ).length;

  return Math.round(
    (
      matchingCount *
      averagePlaySeconds
    ) / 60,
  );
}

function getCamelotNeighbors(
  camelot: string | null,
): string[] {
  if (!camelot) {
    return [];
  }

  const match =
    camelot.match(
      /^(\d{1,2})([AB])$/,
    );

  if (!match) {
    return [camelot];
  }

  const number =
    Number(
      match[1],
    );

  const letter =
    match[2];

  const previous =
    number === 1
      ? 12
      : number - 1;

  const next =
    number === 12
      ? 1
      : number + 1;

  const opposite =
    letter === "A"
      ? "B"
      : "A";

  return [
    `${number}${letter}`,
    `${previous}${letter}`,
    `${next}${letter}`,
    `${number}${opposite}`,
  ];
}

function buildCandidateTracks(
  currentTrack: Track | null,
  libraryTracks: readonly Track[],
  excludedTrackIds: ReadonlySet<string>,
  preferredGenres: readonly string[],
  energyDirection:
    | "up"
    | "down"
    | "stable",
  limit = 5,
): Track[] {
  if (!currentTrack) {
    return [];
  }

  return libraryTracks
    .filter(
      (track) =>
        !excludedTrackIds.has(
          track.id,
        ),
    )
    .map(
      (candidate) => {
        const match =
          scoreSongMatch(
            currentTrack,
            candidate,
            {
              mode:
                preferredGenres.length >
                0
                  ? "cross-style"
                  : "same-style",
              minimumScore: 0,
              requireGenreMatch:
                false,
              maxBpmDifference: 24,
              maxEnergyDifference: 5,
              popularityPreference:
                "higher",
            },
          );

        if (!match) {
          return null;
        }

        const candidateEnergy =
          getEnergy(
            candidate,
          );

        const currentEnergy =
          getEnergy(
            currentTrack,
          );

        let directionScore =
          0.5;

        if (
          candidateEnergy !==
            null &&
          currentEnergy !==
            null
        ) {
          if (
            energyDirection ===
            "up"
          ) {
            directionScore =
              candidateEnergy >=
              currentEnergy
                ? 1
                : 0.2;
          } else if (
            energyDirection ===
            "down"
          ) {
            directionScore =
              candidateEnergy <=
              currentEnergy
                ? 1
                : 0.2;
          } else {
            directionScore =
              clamp(
                1 -
                  Math.abs(
                    candidateEnergy -
                      currentEnergy,
                  ) /
                    4,
              );
          }
        }

        const genreScore =
          preferredGenres.length ===
          0
            ? 0.5
            : getTrackGenres(
                candidate,
              ).some(
                (genre) =>
                  preferredGenres.includes(
                    normalizeGenre(
                      genre,
                    ),
                  ),
              )
              ? 1
              : 0.15;

        return {
          track:
            candidate,
          score:
            match.score *
              0.55 +
            match.breakdown.bpm *
              0.2 +
            match.breakdown.camelot *
              0.15 +
            directionScore *
              0.07 +
            genreScore *
              0.03,
        };
      },
    )
    .filter(
      (
        item,
      ): item is {
        track: Track;
        score: number;
      } =>
        item !== null,
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.score -
        left.score,
    )
    .slice(
      0,
      Math.max(
        1,
        limit,
      ),
    )
    .map(
      (item) =>
        item.track,
    );
}

function buildRecommendation(
  currentTrack: Track | null,
  recentTracks: readonly Track[],
  libraryTracks: readonly Track[],
  excludedTrackIds: ReadonlySet<string>,
): DjAssistantRecommendation {
  if (!currentTrack) {
    return {
      direction:
        "stay-style",
      title:
        "Start with a stable track",
      explanation:
        "No current track is available yet. Start the set and Flamingo will analyze the recent sequence.",
      recommendedBpmMin:
        null,
      recommendedBpmMax:
        null,
      recommendedKeys: [],
      recommendedCamelot: [],
      preferredGenres: [],
      avoidGenres: [],
      confidence: 45,
      candidateTracks: [],
    };
  }

  const currentBpm =
    getBpm(
      currentTrack,
    );

  const currentEnergy =
    getEnergy(
      currentTrack,
    );

  const recentEnergy =
    average(
      recentTracks.map(
        getEnergy,
      ),
    );

  const dominantGenres =
    getDominantGenres(
      recentTracks,
    );

  const genreMinutes =
    estimateGenreMinutes(
      recentTracks,
      60,
    );

  let direction:
    DjAssistantRecommendation["direction"] =
      "stay-style";

  let title =
    "Stay in the current style";

  let explanation =
    "The current sequence is stable. Keep BPM changes small and prioritize tracks with compatible key and similar energy.";

  let energyDirection:
    | "up"
    | "down"
    | "stable" =
      "stable";

  let preferredGenres =
    dominantGenres.slice(
      0,
      1,
    );

  let avoidGenres:
    string[] = [];

  let confidence =
    78;

  if (
    currentEnergy !==
      null &&
    recentEnergy !==
      null &&
    currentEnergy <
      recentEnergy - 1
  ) {
    direction =
      "increase-energy";

    title =
      "Increase energy gradually";

    explanation =
      "The current track sits below the recent energy average. Choose a nearby BPM with slightly higher energy to recover momentum without a harsh jump.";

    energyDirection =
      "up";

    confidence =
      87;
  } else if (
    currentEnergy !==
      null &&
    recentEnergy !==
      null &&
    currentEnergy >
      recentEnergy + 1.5
  ) {
    direction =
      "decrease-energy";

    title =
      "Hold or reduce energy";

    explanation =
      "The set has reached a stronger energy point. A controlled reduction can preserve the peak and prevent fatigue.";

    energyDirection =
      "down";

    confidence =
      82;
  } else if (
    genreMinutes >= 5 &&
    recentTracks.length >= 5
  ) {
    direction =
      "change-style";

    title =
      "Consider changing direction";

    explanation =
      "The recent sequence is dominated by the same style. A compatible cross-style transition can refresh the set while preserving BPM continuity.";

    preferredGenres = [];

    avoidGenres =
      dominantGenres.slice(
        0,
        1,
      );

    confidence =
      84;
  } else if (
    currentBpm !==
      null &&
    recentTracks.length >= 3
  ) {
    direction =
      "hold-bpm";

    title =
      "Hold the BPM zone";

    explanation =
      "The current pace is coherent with the recent sequence. Stay within a narrow BPM window and let Key/Camelot decide between close candidates.";

    confidence =
      86;
  }

  const camelot =
    getTrackCamelot(
      currentTrack,
    );

  const recommendedCamelot =
    getCamelotNeighbors(
      camelot,
    );

  const recommendedKeys =
    currentTrack.musicalKey
      ? [
          currentTrack.musicalKey,
        ]
      : [];

  const recommendedBpmMin =
    currentBpm ===
    null
      ? null
      : Math.max(
          0,
          Math.round(
            currentBpm - 2,
          ),
        );

  const recommendedBpmMax =
    currentBpm ===
    null
      ? null
      : Math.round(
          currentBpm + 3,
        );

  const candidateTracks =
    buildCandidateTracks(
      currentTrack,
      libraryTracks,
      excludedTrackIds,
      preferredGenres,
      energyDirection,
      5,
    );

  return {
    direction,
    title,
    explanation,
    recommendedBpmMin,
    recommendedBpmMax,
    recommendedKeys,
    recommendedCamelot,
    preferredGenres,
    avoidGenres,
    confidence,
    candidateTracks,
  };
}

export function buildDjAssistantInsight(
  currentTrack: Track | null,
  recentTracks: readonly Track[],
  libraryTracks: readonly Track[],
  excludedTrackIds: ReadonlySet<string>,
): DjAssistantInsight {
  const currentEnergy =
    currentTrack
      ? getEnergy(
          currentTrack,
        )
      : null;

  const currentBpm =
    currentTrack
      ? getBpm(
          currentTrack,
        )
      : null;

  const averageRecentEnergy =
    average(
      recentTracks.map(
        getEnergy,
      ),
    );

  const averageRecentBpm =
    average(
      recentTracks.map(
        getBpm,
      ),
    );

  const dominantRecentGenres =
    getDominantGenres(
      recentTracks,
    );

  return {
    currentTrack,
    recentTracks:
      [...recentTracks],
    currentEnergy,
    averageRecentEnergy,
    currentBpm,
    averageRecentBpm,
    repeatedGenreMinutesEstimate:
      estimateGenreMinutes(
        recentTracks,
        60,
      ),
    dominantRecentGenres,
    recommendation:
      buildRecommendation(
        currentTrack,
        recentTracks,
        libraryTracks,
        excludedTrackIds,
      ),
  };
}
