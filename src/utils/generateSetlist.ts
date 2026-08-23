import type { Track } from "../types/track";

import type {
  GeneratedSetlistResult,
  SetlistEnergyCurve,
  SetlistGeneratorOptions,
  SetlistKeyMode,
} from "../types/setlistGenerator";

import {
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
    Math.max(minimum, value),
  );
}

function toFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed = Number(
      value
        .trim()
        .replace(",", "."),
    );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function getBpm(
  track: Track,
): number | null {
  return toFiniteNumber(
    track.tempo,
  );
}

function getEnergy(
  track: Track,
): number | null {
  return toFiniteNumber(
    track.energy,
  );
}

function getPopularity(
  track: Track,
): number | null {
  return toFiniteNumber(
    track.spotifyPopularity,
  );
}

function getHistoricalTrackScore(
  track: Track,
  options: SetlistGeneratorOptions,
): number {
  if (
    !options.historicalPriorityEnabled
  ) {
    return 0.5;
  }

  if (
    (
      options.reliableTrackIds ??
      []
    ).includes(
      track.id,
    )
  ) {
    return 1;
  }

  if (
    (
      options.crowdRescueTrackIds ??
      []
    ).includes(
      track.id,
    )
  ) {
    return 0.82;
  }

  if (
    (
      options.reviewTrackIds ??
      []
    ).includes(
      track.id,
    )
  ) {
    return 0.15;
  }

  return 0.5;
}

function normalizeArtist(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function trackMatchesGenre(
  track: Track,
  requestedGenre: string,
): boolean {
  const normalizedRequested =
    normalizeGenre(
      requestedGenre,
    );

  if (
    !normalizedRequested ||
    normalizedRequested === "all"
  ) {
    return true;
  }

  return getTrackGenres(
    track,
  ).some((genre) => {
    const normalizedTrackGenre =
      normalizeGenre(
        genre,
      );

    return (
      normalizedTrackGenre ===
        normalizedRequested ||
      normalizedTrackGenre.includes(
        normalizedRequested,
      ) ||
      normalizedRequested.includes(
        normalizedTrackGenre,
      )
    );
  });
}

function getEnergyCurveValue(
  curve: SetlistEnergyCurve,
  position: number,
  totalPositions: number,
): number {
  if (totalPositions <= 1) {
    return 0.5;
  }

  const progress =
    clamp(
      position /
        (totalPositions - 1),
    );

  if (curve === "progressive") {
    return (
      0.18 +
      progress * 0.74
    );
  }

  if (
    curve ===
    "warmup-peak-closing"
  ) {
    if (progress <= 0.72) {
      return (
        0.15 +
        (progress / 0.72) *
          0.8
      );
    }

    const closingProgress =
      (progress - 0.72) /
      0.28;

    return (
      0.95 -
      closingProgress * 0.28
    );
  }

  const wave =
    Math.sin(
      progress *
        Math.PI *
        3,
    );

  return clamp(
    0.42 +
      progress * 0.28 +
      wave * 0.08,
  );
}

function getTargetBpm(
  position: number,
  totalPositions: number,
  minimumBpm: number,
  maximumBpm: number,
): number {
  if (totalPositions <= 1) {
    return minimumBpm;
  }

  const progress =
    clamp(
      position /
        (totalPositions - 1),
    );

  return (
    minimumBpm +
    progress *
      (maximumBpm -
        minimumBpm)
  );
}

function getEnergyRange(
  tracks: readonly Track[],
): {
  minimum: number;
  maximum: number;
} {
  const values =
    tracks
      .map(getEnergy)
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  if (values.length === 0) {
    return {
      minimum: 0,
      maximum: 10,
    };
  }

  return {
    minimum:
      Math.min(...values),
    maximum:
      Math.max(...values),
  };
}

function getTargetEnergy(
  curve: SetlistEnergyCurve,
  position: number,
  totalPositions: number,
  minimumEnergy: number,
  maximumEnergy: number,
): number {
  const normalized =
    getEnergyCurveValue(
      curve,
      position,
      totalPositions,
    );

  return (
    minimumEnergy +
    normalized *
      (maximumEnergy -
        minimumEnergy)
  );
}

function getEnergyTargetScore(
  energy: number | null,
  targetEnergy: number,
  energyRange: number,
): number {
  if (energy === null) {
    return 0.45;
  }

  return clamp(
    1 -
      Math.abs(
        energy -
          targetEnergy,
      ) /
        Math.max(
          energyRange,
          1,
        ),
  );
}

function getKeyAcceptance(
  camelotScore: number,
  mode: SetlistKeyMode,
): {
  allowed: boolean;
  score: number;
} {
  if (mode === "ignore") {
    return {
      allowed: true,
      score: 0.5,
    };
  }

  if (mode === "strict") {
    return {
      allowed:
        camelotScore >= 0.9,
      score: camelotScore,
    };
  }

  if (mode === "compatible") {
    return {
      allowed:
        camelotScore >= 0.65,
      score: camelotScore,
    };
  }

  return {
    allowed: true,
    score: camelotScore,
  };
}

function artistWasUsedRecently(
  track: Track,
  selectedTracks: readonly Track[],
  artistSpacing: number,
): boolean {
  if (artistSpacing <= 0) {
    return false;
  }

  const candidateArtist =
    normalizeArtist(
      track.artist,
    );

  return selectedTracks
    .slice(-artistSpacing)
    .some(
      (selectedTrack) =>
        normalizeArtist(
          selectedTrack.artist,
        ) ===
        candidateArtist,
    );
}

function candidateIsEligible(
  track: Track,
  options: SetlistGeneratorOptions,
): boolean {
  const bpm =
    getBpm(track);

  if (
    bpm === null ||
    bpm < options.minimumBpm ||
    bpm > options.maximumBpm
  ) {
    return false;
  }

  if (
    !trackMatchesGenre(
      track,
      options.genre,
    )
  ) {
    return false;
  }

  const popularity =
    getPopularity(track);

  if (
    popularity !== null &&
    (
      popularity <
        options.minimumPopularity ||
      popularity >
        options.maximumPopularity
    )
  ) {
    return false;
  }

  return true;
}

function chooseAutomaticStartTrack(
  candidates: readonly Track[],
  options: SetlistGeneratorOptions,
  minimumEnergy: number,
  maximumEnergy: number,
): Track | null {
  if (candidates.length === 0) {
    return null;
  }

  const targetBpm =
    getTargetBpm(
      0,
      options.trackCount,
      options.minimumBpm,
      options.maximumBpm,
    );

  const targetEnergy =
    getTargetEnergy(
      options.energyCurve,
      0,
      options.trackCount,
      minimumEnergy,
      maximumEnergy,
    );

  const energyRange =
    Math.max(
      maximumEnergy -
        minimumEnergy,
      1,
    );

  return [...candidates]
    .sort((left, right) => {
      const leftBpm =
        getBpm(left) ??
        Number.POSITIVE_INFINITY;

      const rightBpm =
        getBpm(right) ??
        Number.POSITIVE_INFINITY;

      const leftBpmDistance =
        Math.abs(
          leftBpm -
            targetBpm,
        );

      const rightBpmDistance =
        Math.abs(
          rightBpm -
            targetBpm,
        );

      // Priority 1: BPM.
      if (
        leftBpmDistance !==
        rightBpmDistance
      ) {
        return (
          leftBpmDistance -
          rightBpmDistance
        );
      }

      const leftEnergyScore =
        getEnergyTargetScore(
          getEnergy(left),
          targetEnergy,
          energyRange,
        );

      const rightEnergyScore =
        getEnergyTargetScore(
          getEnergy(right),
          targetEnergy,
          energyRange,
        );

      if (
        rightEnergyScore !==
        leftEnergyScore
      ) {
        return (
          rightEnergyScore -
          leftEnergyScore
        );
      }

      const leftHistoricalScore =
        getHistoricalTrackScore(
          left,
          options,
        );

      const rightHistoricalScore =
        getHistoricalTrackScore(
          right,
          options,
        );

      if (
        rightHistoricalScore !==
        leftHistoricalScore
      ) {
        return (
          rightHistoricalScore -
          leftHistoricalScore
        );
      }

      return (
        (getPopularity(right) ??
          -1) -
        (getPopularity(left) ??
          -1)
      );
    })[0] ?? null;
}

export function generateSetlist(
  tracks: readonly Track[],
  options: SetlistGeneratorOptions,
): GeneratedSetlistResult<Track> {
  const requestedCount =
    Math.max(
      1,
      Math.min(
        500,
        Math.round(
          options.trackCount,
        ),
      ),
    );

  const warnings: string[] = [];

  const eligibleTracks =
    tracks.filter(
      (track) =>
        candidateIsEligible(
          track,
          options,
        ),
    );

  if (eligibleTracks.length === 0) {
    return {
      tracks: [],
      requestedCount,
      generatedCount: 0,
      warnings: [
        "No tracks match the selected filters.",
      ],
    };
  }

  const {
    minimum: minimumEnergy,
    maximum: maximumEnergy,
  } =
    getEnergyRange(
      eligibleTracks,
    );

  const energyRange =
    Math.max(
      maximumEnergy -
        minimumEnergy,
      1,
    );

  let startTrack: Track | null =
    null;

  if (
    options.startMode ===
      "selected" &&
    options.startTrackId
  ) {
    startTrack =
      eligibleTracks.find(
        (track) =>
          track.id ===
          options.startTrackId,
      ) ?? null;

    if (!startTrack) {
      warnings.push(
        "The selected starting track does not match the filters. Flamingo selected the starting track automatically.",
      );
    }
  }

  if (!startTrack) {
    startTrack =
      chooseAutomaticStartTrack(
        eligibleTracks,
        options,
        minimumEnergy,
        maximumEnergy,
      );
  }

  if (!startTrack) {
    return {
      tracks: [],
      requestedCount,
      generatedCount: 0,
      warnings: [
        "Flamingo could not choose a starting track.",
      ],
    };
  }

  const selectedTracks: Track[] =
    [startTrack];

  const usedTrackIds =
    new Set<string>([
      startTrack.id,
    ]);

  while (
    selectedTracks.length <
      requestedCount
  ) {
    const previousTrack =
      selectedTracks[
        selectedTracks.length -
          1
      ];

    const targetEnergy =
      getTargetEnergy(
        options.energyCurve,
        selectedTracks.length,
        requestedCount,
        minimumEnergy,
        maximumEnergy,
      );

    const previousBpm =
      getBpm(
        previousTrack,
      );

    const targetBpm =
      getTargetBpm(
        selectedTracks.length,
        requestedCount,
        options.minimumBpm,
        options.maximumBpm,
      );

    const ascendingCandidateFilter = (
      candidate: Track,
    ) => {
      if (
        usedTrackIds.has(
          candidate.id,
        )
      ) {
        return false;
      }

      const candidateBpm =
        getBpm(
          candidate,
        );

      if (
        candidateBpm ===
        null
      ) {
        return false;
      }

      // Hard rule:
      // BPM can stay equal or rise,
      // but never decrease.
      if (
        previousBpm !==
          null &&
        candidateBpm <
          previousBpm
      ) {
        return false;
      }

      return true;
    };

    const strictCandidates =
      eligibleTracks.filter(
        (candidate) =>
          ascendingCandidateFilter(
            candidate,
          ) &&
          !artistWasUsedRecently(
            candidate,
            selectedTracks,
            options.artistSpacing,
          ),
      );

    const relaxedCandidates =
      eligibleTracks.filter(
        ascendingCandidateFilter,
      );

    const candidatePool =
      strictCandidates.length >
      0
        ? strictCandidates
        : relaxedCandidates;

    if (
      candidatePool.length ===
      0
    ) {
      break;
    }

    const scored =
      candidatePool
        .map((candidate) => {
          const candidateBpm =
            getBpm(
              candidate,
            );

          if (
            candidateBpm ===
            null
          ) {
            return null;
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
                  Math.max(
                    8,
                    options.maximumBpm -
                      options.minimumBpm,
                  ),
                maxEnergyDifference:
                  Math.max(
                    2,
                    energyRange,
                  ),
                popularityPreference:
                  "higher",
              },
            );

          if (!match) {
            return null;
          }

          const keyResult =
            getKeyAcceptance(
              match.breakdown
                .camelot,
              options.keyMode,
            );

          if (
            !keyResult.allowed
          ) {
            return null;
          }

          const energyTargetScore =
            getEnergyTargetScore(
              getEnergy(candidate),
              targetEnergy,
              energyRange,
            );

          const popularity =
            getPopularity(
              candidate,
            );

          const popularityScore =
            popularity === null
              ? 0.45
              : clamp(
                  popularity / 100,
                );

          const historicalScore =
            getHistoricalTrackScore(
              candidate,
              options,
            );

          return {
            track:
              candidate,

            candidateBpm,

            bpmDistance:
              Math.abs(
                candidateBpm -
                  targetBpm,
              ),

            camelotScore:
              keyResult.score,

            secondaryScore:
              match.score * 0.45 +
              energyTargetScore * 0.28 +
              popularityScore * 0.17 +
              historicalScore * 0.1,
          };
        })
        .filter(
          (
            item,
          ): item is {
            track: Track;
            candidateBpm: number;
            bpmDistance: number;
            camelotScore: number;
            secondaryScore: number;
          } =>
            item !== null,
        )
        .sort((left, right) => {
          // Priority 1: BPM.
          if (
            left.bpmDistance !==
            right.bpmDistance
          ) {
            return (
              left.bpmDistance -
              right.bpmDistance
            );
          }

          // Priority 2: Camelot.
          if (
            right.camelotScore !==
            left.camelotScore
          ) {
            return (
              right.camelotScore -
              left.camelotScore
            );
          }

          // Priority 3:
          // energy, overall match
          // and popularity.
          if (
            right.secondaryScore !==
            left.secondaryScore
          ) {
            return (
              right.secondaryScore -
              left.secondaryScore
            );
          }

          return (
            left.candidateBpm -
            right.candidateBpm
          );
        });

    const nextTrack =
      scored[0]?.track;

    if (!nextTrack) {
      break;
    }

    selectedTracks.push(
      nextTrack,
    );

    usedTrackIds.add(
      nextTrack.id,
    );
  }

  if (
    selectedTracks.length <
    requestedCount
  ) {
    warnings.push(
      `Only ${selectedTracks.length} of ${requestedCount} requested tracks could be generated while keeping BPM in ascending order and respecting the current filters.`,
    );
  }

  return {
    tracks: selectedTracks,
    requestedCount,
    generatedCount:
      selectedTracks.length,
    warnings,
  };
}
