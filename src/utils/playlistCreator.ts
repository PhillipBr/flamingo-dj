import type { Playlist } from "../types/playlist";
import type { Track } from "../types/track";

export type PlaylistCreatorPhaseId =
  | "warmup"
  | "build"
  | "peak"
  | "reset"
  | "final-peak";

export type PlaylistCreatorPhase = {
  id: PlaylistCreatorPhaseId;
  label: string;
  minutes: number;

  energyMin: number;
  energyMax: number;

  popularityMin: number;

  hitBias: number;
};

export type PlaylistCreatorSource = {
  playlistId: string;
  weight: number;
};

export type PlaylistCreatorConfig = {
  name: string;

  durationMinutes: number;
  playlistSize: number;
  averagePlaySeconds: number;

  globalPopularityMin: number;
  globalEnergyMin: number;
  globalEnergyMax: number;

  releaseYearFrom: number | null;
  releaseYearTo: number | null;

  harmonicPriority:
    | "low"
    | "balanced"
    | "high";

  bpmMovement:
    | "smooth"
    | "dynamic"
    | "free";

  artistSpacing: number;
  maxSameSource: number;

  reserveTopHits: boolean;
  reserveHitCount: number;

  sources: PlaylistCreatorSource[];
  phases: PlaylistCreatorPhase[];
};

export type PlaylistCreatorItem = {
  track: Track;
  phaseId: PlaylistCreatorPhaseId;
  phaseLabel: string;
  sourcePlaylistId: string | null;

  score: number;
  plannedPlaySeconds: number;
};

export type PlaylistCreatorResult = {
  name: string;
  items: PlaylistCreatorItem[];

  targetSeconds: number;
  plannedSeconds: number;

  sourceCounts: Record<string, number>;
};


type PopularityBand =
  | "support"
  | "familiar"
  | "hit"
  | "top";

type PopularityDistribution = Record<
  PopularityBand,
  number
>;

function popularityBand(
  popularity: number,
): PopularityBand {
  if (popularity >= 81) {
    return "top";
  }

  if (popularity >= 75) {
    return "hit";
  }

  if (popularity >= 65) {
    return "familiar";
  }

  return "support";
}

function phasePopularityDistribution(
  phaseId: PlaylistCreatorPhaseId,
): PopularityDistribution {
  switch (phaseId) {
    case "warmup":
      return {
        support: 0.65,
        familiar: 0.30,
        hit: 0.05,
        top: 0,
      };

    case "build":
      return {
        support: 0.25,
        familiar: 0.50,
        hit: 0.20,
        top: 0.05,
      };

    case "peak":
      return {
        support: 0.10,
        familiar: 0.30,
        hit: 0.45,
        top: 0.15,
      };

    case "reset":
      return {
        support: 0.35,
        familiar: 0.45,
        hit: 0.15,
        top: 0.05,
      };

    case "final-peak":
      return {
        support: 0.05,
        familiar: 0.20,
        hit: 0.35,
        top: 0.40,
      };
  }
}

function phasePopularityHardMaximum(
  phaseId: PlaylistCreatorPhaseId,
): number | null {
  switch (phaseId) {
    case "warmup":
      return 80;

    case "build":
      return 85;

    case "peak":
      return 92;

    case "reset":
      return 85;

    case "final-peak":
      return null;
  }
}

const KEY_TO_CAMELOT: Record<string, string> = {
  "G#m": "1A",
  Abm: "1A",
  B: "1B",

  "D#m": "2A",
  Ebm: "2A",
  "F#": "2B",
  Gb: "2B",

  "A#m": "3A",
  Bbm: "3A",
  "C#": "3B",
  Db: "3B",

  Fm: "4A",
  "G#": "4B",
  Ab: "4B",

  Cm: "5A",
  "D#": "5B",
  Eb: "5B",

  Gm: "6A",
  "A#": "6B",
  Bb: "6B",

  Dm: "7A",
  F: "7B",

  Am: "8A",
  C: "8B",

  Em: "9A",
  G: "9B",

  Bm: "10A",
  D: "10B",

  "F#m": "11A",
  Gbm: "11A",
  A: "11B",

  "C#m": "12A",
  Dbm: "12A",
  E: "12B",
};

function normalizeText(
  value: string | null | undefined,
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

function releaseYear(
  track: Track,
): number | null {
  const match =
    String(track.releaseDate ?? "").match(
      /\b(?:19|20)\d{2}\b/,
    );

  return match
    ? Number(match[0])
    : null;
}

function camelot(
  track: Track | null,
): string | null {
  if (!track?.musicalKey) {
    return null;
  }

  return (
    KEY_TO_CAMELOT[
      track.musicalKey
    ] ?? null
  );
}

function harmonicScore(
  previous: Track | null,
  next: Track,
): number {
  const previousCamelot =
    camelot(previous);

  const nextCamelot =
    camelot(next);

  if (
    !previousCamelot ||
    !nextCamelot
  ) {
    return 0.55;
  }

  if (
    previousCamelot ===
    nextCamelot
  ) {
    return 1;
  }

  const previousMatch =
    previousCamelot.match(
      /^(\d{1,2})([AB])$/,
    );

  const nextMatch =
    nextCamelot.match(
      /^(\d{1,2})([AB])$/,
    );

  if (
    !previousMatch ||
    !nextMatch
  ) {
    return 0.45;
  }

  const previousNumber =
    Number(
      previousMatch[1],
    );

  const nextNumber =
    Number(
      nextMatch[1],
    );

  const previousMode =
    previousMatch[2];

  const nextMode =
    nextMatch[2];

  const previousNeighbor =
    previousNumber === 1
      ? 12
      : previousNumber - 1;

  const nextNeighbor =
    previousNumber === 12
      ? 1
      : previousNumber + 1;

  if (
    previousMode ===
      nextMode &&
    (
      nextNumber ===
        previousNeighbor ||
      nextNumber ===
        nextNeighbor
    )
  ) {
    return 0.95;
  }

  if (
    previousNumber ===
      nextNumber &&
    previousMode !==
      nextMode
  ) {
    return 0.92;
  }

  return 0.28;
}

function effectiveBpmDifference(
  previous: Track | null,
  next: Track,
): number | null {
  if (
    previous?.tempo == null ||
    next.tempo == null
  ) {
    return null;
  }

  return Math.min(
    Math.abs(
      previous.tempo -
        next.tempo,
    ),
    Math.abs(
      previous.tempo -
        next.tempo * 2,
    ),
    Math.abs(
      previous.tempo * 2 -
        next.tempo,
    ),
  );
}

function phaseBpmLimit(
  phaseId: PlaylistCreatorPhaseId,
  movement:
    PlaylistCreatorConfig["bpmMovement"],
): number {
  const base =
    phaseId === "warmup"
      ? 6
      : phaseId === "build"
        ? 7
        : phaseId === "peak"
          ? 9
          : phaseId === "reset"
            ? 7
            : 9;

  if (movement === "smooth") {
    return Math.max(
      4,
      base - 2,
    );
  }

  if (movement === "free") {
    /*
     * Free still must feel like a DJ journey.
     * It relaxes the limit, but does not allow arbitrary
     * 90 -> 155 -> 88 jumps inside a single phase.
     */
    return base + 5;
  }

  return base;
}

function isBpmTransitionAllowed(
  previous: Track | null,
  next: Track,
  phaseId: PlaylistCreatorPhaseId,
  movement:
    PlaylistCreatorConfig["bpmMovement"],
  isPhaseBoundary: boolean,
): boolean {
  const diff =
    effectiveBpmDifference(
      previous,
      next,
    );

  if (diff === null) {
    return true;
  }

  /*
   * A true BPM reset is intentionally allowed when entering
   * the Reset / Intermission phase.
   */
  if (
    isPhaseBoundary &&
    phaseId === "reset"
  ) {
    return true;
  }

  /*
   * Other phase boundaries get extra room, but not unlimited room.
   */
  if (isPhaseBoundary) {
    return (
      diff <=
      phaseBpmLimit(
        phaseId,
        movement,
      ) +
        8
    );
  }

  return (
    diff <=
    phaseBpmLimit(
      phaseId,
      movement,
    )
  );
}

function bpmScore(
  previous: Track | null,
  next: Track,
  movement:
    PlaylistCreatorConfig["bpmMovement"],
  phaseId: PlaylistCreatorPhaseId,
  isPhaseBoundary: boolean,
): number {
  const diff =
    effectiveBpmDifference(
      previous,
      next,
    );

  if (diff === null) {
    return 0.55;
  }

  if (
    isPhaseBoundary &&
    phaseId === "reset"
  ) {
    if (diff <= 4) {
      return 1;
    }

    if (diff <= 12) {
      return 0.86;
    }

    if (diff <= 24) {
      return 0.62;
    }

    return 0.42;
  }

  const limit =
    phaseBpmLimit(
      phaseId,
      movement,
    );

  if (diff <= 2) {
    return 1;
  }

  if (diff <= 4) {
    return 0.96;
  }

  if (diff <= limit) {
    return 0.82;
  }

  if (
    isPhaseBoundary &&
    diff <= limit + 8
  ) {
    return 0.5;
  }

  return 0.05;
}

function energyScore(
  track: Track,
  phase: PlaylistCreatorPhase,
): number {
  if (
    track.energy == null
  ) {
    return 0.4;
  }

  const middle =
    (
      phase.energyMin +
      phase.energyMax
    ) /
    2;

  if (
    track.energy >=
      phase.energyMin &&
    track.energy <=
      phase.energyMax
  ) {
    const halfRange =
      Math.max(
        1,
        (
          phase.energyMax -
          phase.energyMin
        ) /
          2,
      );

    return Math.max(
      0.75,
      1 -
        Math.abs(
          track.energy -
            middle,
        ) /
          (
            halfRange *
            4
          ),
    );
  }

  const distance =
    track.energy <
    phase.energyMin
      ? phase.energyMin -
        track.energy
      : track.energy -
        phase.energyMax;

  return Math.max(
    0,
    0.6 -
      distance * 0.18,
  );
}

function phasePopularityFitScore(
  track: Track,
  phase: PlaylistCreatorPhase,
  alreadySelectedInPhase:
    PlaylistCreatorItem[],
  phaseTarget: number,
  phaseProgress: number,
): number {
  const popularity =
    track.spotifyPopularity ??
    0;

  if (
    popularity <
    phase.popularityMin
  ) {
    return 0.05;
  }

  const band =
    popularityBand(
      popularity,
    );

  const target =
    phasePopularityDistribution(
      phase.id,
    );

  const counts:
    PopularityDistribution = {
      support: 0,
      familiar: 0,
      hit: 0,
      top: 0,
    };

  for (
    const item of
    alreadySelectedInPhase
  ) {
    const itemBand =
      popularityBand(
        item.track
          .spotifyPopularity ??
          0,
      );

    counts[itemBand] += 1;
  }

  const desiredCount =
    target[band] *
    Math.max(
      1,
      phaseTarget,
    );

  const currentCount =
    counts[band];

  const deficit =
    desiredCount -
    currentCount;

  /*
   * Reward under-filled bands and penalize over-filled bands.
   * This is a target distribution, not an absolute quota.
   */
  let distributionScore =
    0.55 +
    Math.max(
      -0.45,
      Math.min(
        0.35,
        deficit /
          Math.max(
            1,
            phaseTarget,
          ) *
          3.2,
      ),
    );

  /*
   * Warm Up should not burn top hits.
   * Final Peak progressively becomes more popularity-driven,
   * especially in its final third.
   */
  if (
    phase.id === "warmup"
  ) {
    if (band === "top") {
      distributionScore -= 0.75;
    } else if (
      band === "hit" &&
      currentCount >=
        Math.ceil(
          target.hit *
            phaseTarget,
        )
    ) {
      distributionScore -= 0.3;
    }
  }

  if (
    phase.id === "build" &&
    band === "top"
  ) {
    distributionScore -= 0.28;
  }

  if (
    phase.id === "peak" &&
    band === "top"
  ) {
    distributionScore += 0.08;
  }

  if (
    phase.id ===
    "final-peak"
  ) {
    const lateBoost =
      Math.max(
        0,
        phaseProgress -
          0.45,
      ) *
      0.9;

    if (band === "top") {
      distributionScore +=
        0.18 +
        lateBoost;
    } else if (
      band === "hit"
    ) {
      distributionScore +=
        0.12;
    } else if (
      band === "support"
    ) {
      distributionScore -=
        0.15 +
        lateBoost * 0.6;
    }
  }

  const rawPopularity =
    Math.max(
      0,
      Math.min(
        1,
        popularity /
          100,
      ),
    );

  /*
   * Distribution matters more than raw popularity until Final Peak.
   */
  const rawWeight =
    phase.id ===
    "final-peak"
      ? 0.5 +
        phaseProgress *
          0.22
      : phase.id ===
          "peak"
        ? 0.32
        : 0.18;

  return Math.max(
    0,
    Math.min(
      1.35,
      distributionScore *
        (
          1 -
          rawWeight
        ) +
        rawPopularity *
          rawWeight,
    ),
  );
}

function plannedSeconds(
  track: Track,
  averagePlaySeconds: number,
): number {
  const desired =
    Math.max(
      60,
      Math.round(
        averagePlaySeconds,
      ),
    );

  if (
    track.durationSeconds ==
      null ||
    track.durationSeconds <= 0
  ) {
    return desired;
  }

  return Math.max(
    60,
    Math.min(
      desired,
      track.durationSeconds,
    ),
  );
}

function buildTrackSources(
  playlists: Playlist[],
  sources:
    PlaylistCreatorSource[],
): Map<string, string[]> {
  const selectedIds =
    new Set(
      sources
        .filter(
          (source) =>
            source.weight >
            0,
        )
        .map(
          (source) =>
            source.playlistId,
        ),
    );

  const result =
    new Map<
      string,
      string[]
    >();

  for (
    const playlist of
    playlists
  ) {
    if (
      !selectedIds.has(
        playlist.id,
      )
    ) {
      continue;
    }

    for (
      const trackId of
      playlist.trackIds
    ) {
      result.set(
        trackId,
        [
          ...(
            result.get(
              trackId,
            ) ?? []
          ),
          playlist.id,
        ],
      );
    }
  }

  return result;
}

function artistRecentlyUsed(
  track: Track,
  selected:
    PlaylistCreatorItem[],
  spacing: number,
): boolean {
  if (spacing <= 0) {
    return false;
  }

  const artist =
    normalizeText(
      track.artist,
    );

  if (!artist) {
    return false;
  }

  return selected
    .slice(
      -spacing,
    )
    .some(
      (item) =>
        normalizeText(
          item.track.artist,
        ) === artist,
    );
}

function consecutiveSourceCount(
  selected:
    PlaylistCreatorItem[],
  sourceId: string | null,
): number {
  if (!sourceId) {
    return 0;
  }

  let count = 0;

  for (
    let index =
      selected.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      selected[index]
        .sourcePlaylistId !==
      sourceId
    ) {
      break;
    }

    count += 1;
  }

  return count;
}

function chooseSource(
  trackId: string,
  sourceMap: Map<
    string,
    string[]
  >,
  sourceDeficits: Map<
    string,
    number
  >,
): string | null {
  const sourceIds =
    sourceMap.get(
      trackId,
    ) ?? [];

  if (
    sourceIds.length ===
    0
  ) {
    return null;
  }

  return [...sourceIds].sort(
    (
      first,
      second,
    ) =>
      (
        sourceDeficits.get(
          second,
        ) ?? 0
      ) -
      (
        sourceDeficits.get(
          first,
        ) ?? 0
      ),
  )[0];
}

function getPhaseTrackTargets(
  phases: PlaylistCreatorPhase[],
  playlistSize: number,
): Map<PlaylistCreatorPhaseId, number> {
  const safeTarget = Math.max(
    1,
    Math.round(playlistSize),
  );

  const totalMinutes =
    phases.reduce(
      (total, phase) =>
        total +
        Math.max(0, phase.minutes),
      0,
    ) || 1;

  const rawTargets = phases.map(
    (phase) => {
      const raw =
        (Math.max(0, phase.minutes) /
          totalMinutes) *
        safeTarget;

      return {
        id: phase.id,
        floor: Math.floor(raw),
        fraction:
          raw - Math.floor(raw),
      };
    },
  );

  let assigned = rawTargets.reduce(
    (total, item) =>
      total + item.floor,
    0,
  );

  const byFraction = [...rawTargets].sort(
    (first, second) =>
      second.fraction -
      first.fraction,
  );

  let index = 0;

  while (assigned < safeTarget) {
    byFraction[
      index % byFraction.length
    ].floor += 1;
    assigned += 1;
    index += 1;
  }

  return new Map(
    rawTargets.map((item) => [
      item.id,
      item.floor,
    ]),
  );
}

function phaseWeights(
  phase:
    PlaylistCreatorPhase,
): {
  harmonic: number;
  bpm: number;
  energy: number;
  popularity: number;
} {
  if (
    phase.id ===
    "final-peak"
  ) {
    return {
      harmonic: 12,
      bpm: 24,
      energy: 28,
      popularity: 36,
    };
  }

  if (
    phase.id ===
    "peak"
  ) {
    return {
      harmonic: 17,
      bpm: 28,
      energy: 30,
      popularity: 25,
    };
  }

  if (
    phase.id ===
    "reset"
  ) {
    return {
      harmonic: 22,
      bpm: 25,
      energy: 34,
      popularity: 19,
    };
  }

  if (
    phase.id ===
    "build"
  ) {
    return {
      harmonic: 21,
      bpm: 32,
      energy: 30,
      popularity: 17,
    };
  }

  return {
    harmonic: 20,
    bpm: 35,
    energy: 32,
    popularity: 13,
  };
}

function harmonicMultiplier(
  priority:
    PlaylistCreatorConfig["harmonicPriority"],
): number {
  if (
    priority ===
    "high"
  ) {
    return 1.35;
  }

  if (
    priority ===
    "low"
  ) {
    return 0.65;
  }

  return 1;
}

export function createPlaylistFromPlan(
  tracks: Track[],
  playlists: Playlist[],
  config:
    PlaylistCreatorConfig,
): PlaylistCreatorResult {
  const sourceMap =
    buildTrackSources(
      playlists,
      config.sources,
    );

  const trackById =
    new Map(
      tracks.map(
        (track) => [
          track.id,
          track,
        ],
      ),
    );

  let candidates =
    Array.from(
      sourceMap.keys(),
    )
      .map(
        (trackId) =>
          trackById.get(
            trackId,
          ) ?? null,
      )
      .filter(
        (
          track,
        ): track is Track =>
          track !== null,
      )
      .filter(
        (track) => {
          const popularity =
            track.spotifyPopularity ??
            0;

          if (
            popularity <
            config.globalPopularityMin
          ) {
            return false;
          }

          if (
            track.energy != null &&
            (
              track.energy <
                config.globalEnergyMin ||
              track.energy >
                config.globalEnergyMax
            )
          ) {
            return false;
          }

          const year =
            releaseYear(
              track,
            );

          if (
            config.releaseYearFrom !==
              null &&
            year !== null &&
            year <
              config.releaseYearFrom
          ) {
            return false;
          }

          if (
            config.releaseYearTo !==
              null &&
            year !== null &&
            year >
              config.releaseYearTo
          ) {
            return false;
          }

          return true;
        },
      );

  const totalSourceWeight =
    config.sources.reduce(
      (
        total,
        source,
      ) =>
        total +
        Math.max(
          0,
          source.weight,
        ),
      0,
    ) || 1;

  const targetShare =
    new Map(
      config.sources.map(
        (source) => [
          source.playlistId,
          Math.max(
            0,
            source.weight,
          ) /
            totalSourceWeight,
        ],
      ),
    );

  const selected:
    PlaylistCreatorItem[] =
      [];

  const sourceCounts =
    new Map<
      string,
      number
    >();

  /*
   * Reserve strongest hit candidates for Final Peak.
   * They remain unavailable in earlier phases unless there
   * are not enough alternatives.
   */
  const reservedHitIds =
    new Set<string>();

  if (
    config.reserveTopHits
  ) {
    const sortedHits =
      [...candidates]
        .sort(
          (
            first,
            second,
          ) => {
            const firstScore =
              (
                first.spotifyPopularity ??
                0
              ) *
                0.65 +
              (
                first.energy ??
                0
              ) *
                3.5;

            const secondScore =
              (
                second.spotifyPopularity ??
                0
              ) *
                0.65 +
              (
                second.energy ??
                0
              ) *
                3.5;

            return (
              secondScore -
              firstScore
            );
          },
        )
        .slice(
          0,
          Math.max(
            0,
            config.reserveHitCount,
            Math.round(
              config.playlistSize *
                0.10,
            ),
          ),
        );

    for (
      const track of
      sortedHits
    ) {
      reservedHitIds.add(
        track.id,
      );
    }
  }

  const phaseTrackTargets =
    getPhaseTrackTargets(
      config.phases,
      config.playlistSize,
    );

  for (
    const phase of
    config.phases
  ) {
    const phaseTarget =
      phaseTrackTargets.get(
        phase.id,
      ) ?? 0;

    let addedInPhase = 0;

    while (
      candidates.length >
        0 &&
      addedInPhase <
        phaseTarget
    ) {
      const previous =
        selected.length > 0
          ? selected[
              selected.length -
                1
            ].track
          : null;

      const isPhaseBoundary =
        addedInPhase === 0;

      const alreadySelectedInPhase =
        selected.filter(
          (item) =>
            item.phaseId ===
            phase.id,
        );

      const phaseProgress =
        phaseTarget > 1
          ? addedInPhase /
            (
              phaseTarget -
              1
            )
          : 1;

      const sourceDeficits =
        new Map<
          string,
          number
        >();

      for (
        const source of
        config.sources
      ) {
        const desired =
          (
            targetShare.get(
              source.playlistId,
            ) ?? 0
          ) *
          Math.max(
            1,
            selected.length +
              1,
          );

        const actual =
          sourceCounts.get(
            source.playlistId,
          ) ?? 0;

        sourceDeficits.set(
          source.playlistId,
          desired - actual,
        );
      }

      let best:
        | {
            track: Track;
            sourcePlaylistId:
              | string
              | null;
            score: number;
          }
        | null = null;

      for (
        const track of
        candidates
      ) {
        if (
          phase.id !==
            "final-peak" &&
          reservedHitIds.has(
            track.id,
          )
        ) {
          continue;
        }

        const sourcePlaylistId =
          chooseSource(
            track.id,
            sourceMap,
            sourceDeficits,
          );

        if (
          sourcePlaylistId &&
          consecutiveSourceCount(
            selected,
            sourcePlaylistId,
          ) >=
            config.maxSameSource
        ) {
          continue;
        }

        const popularity =
          track.spotifyPopularity ??
          0;

        if (
          popularity <
          phase.popularityMin
        ) {
          continue;
        }

        const popularityMaximum =
          phasePopularityHardMaximum(
            phase.id,
          );

        if (
          popularityMaximum !==
            null &&
          popularity >
            popularityMaximum
        ) {
          continue;
        }

        if (
          track.energy != null &&
          (
            track.energy <
              phase.energyMin ||
            track.energy >
              phase.energyMax
          )
        ) {
          continue;
        }

        if (
          !isBpmTransitionAllowed(
            previous,
            track,
            phase.id,
            config.bpmMovement,
            isPhaseBoundary,
          )
        ) {
          continue;
        }

        const weights =
          phaseWeights(
            phase,
          );

        const harmonic =
          harmonicScore(
            previous,
            track,
          );

        const bpm =
          bpmScore(
            previous,
            track,
            config.bpmMovement,
            phase.id,
            isPhaseBoundary,
          );

        const energy =
          energyScore(
            track,
            phase,
          );

        const popularityValue =
          phasePopularityFitScore(
            track,
            phase,
            alreadySelectedInPhase,
            phaseTarget,
            phaseProgress,
          );

        const adjustedHarmonicWeight =
          weights.harmonic *
          harmonicMultiplier(
            config.harmonicPriority,
          );

        const totalWeight =
          adjustedHarmonicWeight +
          weights.bpm +
          weights.energy +
          weights.popularity;

        let score =
          (
            harmonic *
              adjustedHarmonicWeight +
            bpm *
              weights.bpm +
            energy *
              weights.energy +
            popularityValue *
              weights.popularity
          ) /
          Math.max(
            1,
            totalWeight,
          );

        const sourceDeficit =
          sourcePlaylistId
            ? sourceDeficits.get(
                sourcePlaylistId,
              ) ?? 0
            : 0;

        score +=
          Math.max(
            0,
            Math.min(
              0.18,
              sourceDeficit *
                0.08,
            ),
          );

        if (
          artistRecentlyUsed(
            track,
            selected,
            config.artistSpacing,
          )
        ) {
          score -= 0.42;
        }

        if (
          reservedHitIds.has(
            track.id,
          ) &&
          phase.id ===
            "final-peak"
        ) {
          score += 0.22;
        }

        score +=
          phase.hitBias *
          popularityValue *
          0.08;

        if (
          !best ||
          score >
            best.score
        ) {
          best = {
            track,
            sourcePlaylistId,
            score,
          };
        }
      }

      /*
       * If a phase is too restrictive to fill its share of the
       * requested pool, relax PHASE constraints while keeping the
       * global filters. This is intentional: a 240-track preparation
       * pool should stay large even when Final Peak (for example) does
       * not contain 50 tracks at Popularity 75+ / Energy 7+.
       *
       * Strict matches are always selected first. Relaxed tracks are
       * ranked by closeness to the phase plus popularity/energy, so
       * they remain useful alternatives instead of stopping generation.
       */
      if (!best) {
        const phaseEnergyCenter =
          (phase.energyMin +
            phase.energyMax) /
          2;

        const relaxed =
          [...candidates]
            .filter(
              (track) =>
                isBpmTransitionAllowed(
                  previous,
                  track,
                  phase.id,
                  config.bpmMovement,
                  isPhaseBoundary,
                ),
            )
            .map((track) => {
              const sourcePlaylistId =
                chooseSource(
                  track.id,
                  sourceMap,
                  sourceDeficits,
                );

              const popularity =
                track.spotifyPopularity ??
                config.globalPopularityMin;

              const energy =
                track.energy ??
                phaseEnergyCenter;

              const popularityGap =
                Math.max(
                  0,
                  phase.popularityMin -
                    popularity,
                );

              const energyGap =
                energy < phase.energyMin
                  ? phase.energyMin - energy
                  : energy > phase.energyMax
                    ? energy - phase.energyMax
                    : 0;

              const popularityFit =
                phasePopularityFitScore(
                  track,
                  phase,
                  alreadySelectedInPhase,
                  phaseTarget,
                  phaseProgress,
                );

              const transitionBpm =
                bpmScore(
                  previous,
                  track,
                  config.bpmMovement,
                  phase.id,
                  isPhaseBoundary,
                );

              let score =
                popularityFit * 0.34 +
                transitionBpm * 0.32 +
                popularity * 0.0025 +
                energy * 0.018 -
                popularityGap * 0.012 -
                energyGap * 0.08;

              if (
                sourcePlaylistId &&
                consecutiveSourceCount(
                  selected,
                  sourcePlaylistId,
                ) >=
                  config.maxSameSource
              ) {
                score -= 0.3;
              }

              if (
                artistRecentlyUsed(
                  track,
                  selected,
                  config.artistSpacing,
                )
              ) {
                score -= 0.25;
              }

              if (
                phase.id ===
                  "final-peak" &&
                reservedHitIds.has(
                  track.id,
                )
              ) {
                score += 0.3;
              }

              return {
                track,
                sourcePlaylistId,
                score,
              };
            })
            .sort(
              (first, second) =>
                second.score -
                first.score,
            )[0];

        if (relaxed) {
          best = relaxed;
        }
      }

      if (!best) {
        break;
      }

      const seconds =
        plannedSeconds(
          best.track,
          config.averagePlaySeconds,
        );

      selected.push({
        track:
          best.track,

        phaseId:
          phase.id,

        phaseLabel:
          phase.label,

        sourcePlaylistId:
          best.sourcePlaylistId,

        score:
          best.score,

        plannedPlaySeconds:
          seconds,
      });

      if (
        best.sourcePlaylistId
      ) {
        sourceCounts.set(
          best.sourcePlaylistId,
          (
            sourceCounts.get(
              best.sourcePlaylistId,
            ) ?? 0
          ) + 1,
        );
      }

      candidates =
        candidates.filter(
          (track) =>
            track.id !==
            best!.track.id,
        );

      addedInPhase += 1;
    }
  }

  const sourceCountObject:
    Record<
      string,
      number
    > = {};

  for (
    const [
      sourceId,
      count,
    ] of sourceCounts
  ) {
    sourceCountObject[
      sourceId
    ] = count;
  }

  return {
    name:
      config.name.trim() ||
      "Flamingo Generated Set",

    items:
      selected,

    targetSeconds:
      config.durationMinutes *
      60,

    plannedSeconds:
      selected.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.plannedPlaySeconds,
        0,
      ),

    sourceCounts:
      sourceCountObject,
  };
}
