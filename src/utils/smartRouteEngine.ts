import type { Track } from "../types/track";

import type {
  SmartRoute,
  SmartRoutePlan,
  SmartRouteStep,
  SmartRouteStrategy,
} from "../types/smartRoute";

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

function getPopularity(
  track: Track,
): number | null {
  return (
    typeof track.spotifyPopularity ===
      "number" &&
    Number.isFinite(
      track.spotifyPopularity,
    )
      ? track.spotifyPopularity
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

function artistRecentlyUsed(
  candidate: Track,
  routeTracks: readonly Track[],
  spacing = 3,
): boolean {
  const artist =
    normalizeArtist(
      candidate.artist,
    );

  if (!artist) {
    return false;
  }

  return routeTracks
    .slice(
      -Math.max(
        1,
        spacing,
      ),
    )
    .some(
      (track) =>
        normalizeArtist(
          track.artist,
        ) === artist,
    );
}

function getPrimaryGenre(
  track: Track,
): string | null {
  const genres =
    getTrackGenres(
      track,
    );

  const normalized =
    normalizeGenre(
      genres[0] ??
        track.genre ??
        "",
    );

  return normalized ||
    null;
}

function sameGenreFamily(
  source: Track,
  candidate: Track,
): boolean {
  const sourceGenres =
    getTrackGenres(
      source,
    ).map(
      normalizeGenre,
    );

  const candidateGenres =
    getTrackGenres(
      candidate,
    ).map(
      normalizeGenre,
    );

  return sourceGenres.some(
    (genre) =>
      candidateGenres.includes(
        genre,
      ),
  );
}

function bpmDirectionScore(
  previousTrack: Track,
  candidate: Track,
  strategy: SmartRouteStrategy,
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
    previousBpm === null ||
    candidateBpm === null
  ) {
    return 0.35;
  }

  const difference =
    candidateBpm -
    previousBpm;

  /*
   * Flamingo's route priority is BPM first.
   * We prefer small non-negative BPM movement.
   */
  if (difference < 0) {
    return clamp(
      0.45 -
        Math.abs(
          difference,
        ) /
          16,
    );
  }

  const preferredRise =
    strategy ===
    "increase-energy"
      ? 3
      : strategy ===
          "cross-style"
        ? 2
        : 1.5;

  return clamp(
    1 -
      Math.abs(
        difference -
          preferredRise,
      ) /
        12,
  );
}

function energyDirectionScore(
  previousTrack: Track,
  candidate: Track,
  strategy: SmartRouteStrategy,
): number {
  const previousEnergy =
    getEnergy(
      previousTrack,
    );

  const candidateEnergy =
    getEnergy(
      candidate,
    );

  if (
    previousEnergy === null ||
    candidateEnergy === null
  ) {
    return 0.45;
  }

  const difference =
    candidateEnergy -
    previousEnergy;

  if (
    strategy ===
    "increase-energy"
  ) {
    if (difference >= 0) {
      return clamp(
        1 -
          Math.abs(
            difference - 0.7,
          ) /
            3,
      );
    }

    return clamp(
      0.4 -
        Math.abs(
          difference,
        ) /
          4,
    );
  }

  return clamp(
    1 -
      Math.abs(
        difference,
      ) /
        4,
  );
}

function popularityDirectionScore(
  previousTrack: Track,
  candidate: Track,
  strategy: SmartRouteStrategy,
): number {
  const previousPopularity =
    getPopularity(
      previousTrack,
    );

  const candidatePopularity =
    getPopularity(
      candidate,
    );

  if (
    previousPopularity === null ||
    candidatePopularity === null
  ) {
    return 0.45;
  }

  if (
    strategy ===
    "increase-energy"
  ) {
    return clamp(
      0.65 +
        (
          candidatePopularity -
          previousPopularity
        ) /
          100,
    );
  }

  return clamp(
    1 -
      Math.abs(
        candidatePopularity -
          previousPopularity,
      ) /
        100,
  );
}

function chooseCrossStyleTarget(
  currentTrack: Track,
  libraryTracks: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
): string | null {
  const sourceGenre =
    getPrimaryGenre(
      currentTrack,
    );

  const scores =
    new Map<
      string,
      {
        count: number;
        score: number;
      }
    >();

  libraryTracks
    .filter(
      (track) =>
        !excludedTrackIds.has(
          track.id,
        ) &&
        track.id !==
          currentTrack.id,
    )
    .forEach(
      (candidate) => {
        const genre =
          getPrimaryGenre(
            candidate,
          );

        if (
          !genre ||
          genre === sourceGenre
        ) {
          return;
        }

        const match =
          scoreSongMatch(
            currentTrack,
            candidate,
            {
              mode:
                "cross-style",
              minimumScore: 0,
              requireGenreMatch:
                false,
              maxBpmDifference:
                24,
              maxEnergyDifference:
                5,
              popularityPreference:
                "similar",
            },
          );

        if (!match) {
          return;
        }

        const current =
          scores.get(
            genre,
          ) ?? {
            count: 0,
            score: 0,
          };

        current.count += 1;
        current.score +=
          match.score;

        scores.set(
          genre,
          current,
        );
      },
    );

  return [
    ...scores.entries(),
  ]
    .filter(
      ([
        ,
        value,
      ]) =>
        value.count >= 2,
    )
    .sort(
      (
        left,
        right,
      ) => {
        const leftAverage =
          left[1].score /
          left[1].count;

        const rightAverage =
          right[1].score /
          right[1].count;

        if (
          rightAverage !==
          leftAverage
        ) {
          return (
            rightAverage -
            leftAverage
          );
        }

        return (
          right[1].count -
          left[1].count
        );
      },
    )[0]?.[0] ??
    null;
}

type CandidateScore = {
  track: Track;

  score: number;

  bpmScore: number;
  camelotScore: number;
  energyScore: number;
  genreScore: number;
  popularityScore: number;
};

function scoreCandidate(
  previousTrack: Track,
  candidate: Track,
  strategy: SmartRouteStrategy,
  targetGenre: string | null,
): CandidateScore | null {
  const match =
    scoreSongMatch(
      previousTrack,
      candidate,
      {
        mode:
          strategy ===
          "cross-style"
            ? "cross-style"
            : "same-style",

        minimumScore: 0,
        requireGenreMatch:
          false,

        maxBpmDifference:
          26,

        maxEnergyDifference:
          5,

        popularityPreference:
          strategy ===
          "increase-energy"
            ? "higher"
            : "similar",
      },
    );

  if (!match) {
    return null;
  }

  const bpmScore =
    bpmDirectionScore(
      previousTrack,
      candidate,
      strategy,
    );

  const camelotScore =
    match.breakdown
      .camelot;

  const energyScore =
    energyDirectionScore(
      previousTrack,
      candidate,
      strategy,
    );

  let genreScore =
    match.breakdown.genre;

  if (
    strategy ===
      "stay-style" &&
    sameGenreFamily(
      previousTrack,
      candidate,
    )
  ) {
    genreScore =
      Math.max(
        genreScore,
        0.9,
      );
  }

  if (
    strategy ===
      "cross-style" &&
    targetGenre
  ) {
    const candidateGenre =
      getPrimaryGenre(
        candidate,
      );

    if (
      candidateGenre ===
      targetGenre
    ) {
      genreScore =
        Math.max(
          genreScore,
          0.95,
        );
    } else {
      genreScore *=
        0.35;
    }
  }

  const popularityScore =
    popularityDirectionScore(
      previousTrack,
      candidate,
      strategy,
    );

  /*
   * Priority hierarchy:
   * 1. BPM
   * 2. Camelot / Key compatibility
   * 3. Energy
   * 4. Genre
   * 5. Popularity
   */
  const score =
    bpmScore * 0.38 +
    camelotScore * 0.24 +
    energyScore * 0.17 +
    genreScore * 0.13 +
    popularityScore * 0.08;

  return {
    track:
      candidate,
    score,
    bpmScore,
    camelotScore,
    energyScore,
    genreScore,
    popularityScore,
  };
}

function createRoute(
  strategy: SmartRouteStrategy,
  currentTrack: Track,
  libraryTracks: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  routeLength: number,
): SmartRoute {
  const usedTrackIds =
    new Set<string>(
      excludedTrackIds,
    );

  usedTrackIds.add(
    currentTrack.id,
  );

  const targetGenre =
    strategy ===
    "cross-style"
      ? chooseCrossStyleTarget(
          currentTrack,
          libraryTracks,
          excludedTrackIds,
        )
      : null;

  const routeTracks:
    Track[] = [];

  const steps:
    SmartRouteStep[] = [];

  let previousTrack =
    currentTrack;

  for (
    let position = 0;
    position <
    routeLength;
    position += 1
  ) {
    const candidates =
      libraryTracks
        .filter(
          (candidate) =>
            !usedTrackIds.has(
              candidate.id,
            ) &&
            !artistRecentlyUsed(
              candidate,
              [
                currentTrack,
                ...routeTracks,
              ],
              3,
            ),
        )
        .map(
          (candidate) =>
            scoreCandidate(
              previousTrack,
              candidate,
              strategy,
              targetGenre,
            ),
        )
        .filter(
          (
            item,
          ): item is CandidateScore =>
            item !== null,
        )
        .sort(
          (
            left,
            right,
          ) => {
            /*
             * Keep BPM priority explicit
             * in route selection.
             */
            if (
              right.bpmScore !==
              left.bpmScore
            ) {
              return (
                right.bpmScore -
                left.bpmScore
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

            return (
              right.score -
              left.score
            );
          },
        );

    const best =
      candidates[0];

    if (!best) {
      break;
    }

    routeTracks.push(
      best.track,
    );

    usedTrackIds.add(
      best.track.id,
    );

    steps.push({
      position:
        position + 1,

      track:
        best.track,

      transitionScore:
        best.score,

      transitionPercentage:
        Math.round(
          best.score * 100,
        ),

      bpmScore:
        best.bpmScore,

      camelotScore:
        best.camelotScore,

      energyScore:
        best.energyScore,

      genreScore:
        best.genreScore,

      popularityScore:
        best.popularityScore,
    });

    previousTrack =
      best.track;
  }

  const score =
    steps.length ===
    0
      ? 0
      : steps.reduce(
          (
            total,
            step,
          ) =>
            total +
            step.transitionScore,
          0,
        ) /
        steps.length;

  const startBpm =
    getBpm(
      currentTrack,
    );

  const endTrack =
    routeTracks[
      routeTracks.length - 1
    ] ?? null;

  const endBpm =
    endTrack
      ? getBpm(
          endTrack,
        )
      : startBpm;

  const startEnergy =
    getEnergy(
      currentTrack,
    );

  const endEnergy =
    endTrack
      ? getEnergy(
          endTrack,
        )
      : startEnergy;

  const title =
    strategy ===
    "stay-style"
      ? "Stay in Style"
      : strategy ===
          "increase-energy"
        ? "Build Energy"
        : targetGenre
          ? `Cross Style → ${targetGenre}`
          : "Cross Style";

  const description =
    strategy ===
    "stay-style"
      ? "Keep the current genre direction while moving through compatible BPM, Key/Camelot and Energy."
      : strategy ===
          "increase-energy"
        ? "Raise BPM and Energy progressively while keeping harmonic compatibility under control."
        : targetGenre
          ? `Move toward ${targetGenre} through a compatible route instead of making a single abrupt genre jump.`
          : "Explore a compatible genre change while preserving BPM and harmonic continuity.";

  return {
    id:
      `smart-route-${strategy}`,

    strategy,
    title,
    description,

    score,
    percentage:
      Math.round(
        score * 100,
      ),

    tracks:
      routeTracks,

    steps,

    startBpm,
    endBpm,

    startEnergy,
    endEnergy,

    targetGenre,
  };
}

export function buildSmartRoutePlan(
  currentTrack: Track | null,
  libraryTracks: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  routeLength = 5,
): SmartRoutePlan {
  const safeLength =
    Math.max(
      3,
      Math.min(
        10,
        Math.round(
          routeLength,
        ),
      ),
    );

  if (!currentTrack) {
    return {
      currentTrack:
        null,
      routeLength:
        safeLength,
      routes: [],
    };
  }

  const routes = [
    createRoute(
      "stay-style",
      currentTrack,
      libraryTracks,
      excludedTrackIds,
      safeLength,
    ),

    createRoute(
      "increase-energy",
      currentTrack,
      libraryTracks,
      excludedTrackIds,
      safeLength,
    ),

    createRoute(
      "cross-style",
      currentTrack,
      libraryTracks,
      excludedTrackIds,
      safeLength,
    ),
  ]
    .filter(
      (route) =>
        route.tracks.length >
        0,
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.score -
        left.score,
    );

  return {
    currentTrack,
    routeLength:
      safeLength,
    routes,
  };
}
