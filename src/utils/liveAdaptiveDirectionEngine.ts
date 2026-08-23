import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

import type {
  CurrentSet,
} from "../types/setlist";

import type {
  LiveAdaptiveAction,
  LiveAdaptiveCandidate,
  LiveAdaptiveDirection,
  LiveAdaptivePhase,
} from "../types/liveAdaptiveDirection";

import type {
  Track,
} from "../types/track";

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

function normalizeGenres(
  genres: readonly string[],
): string[] {
  return genres
    .map(
      normalizeGenre,
    )
    .filter(Boolean);
}

function trackMatchesGenres(
  track: Track,
  genres: readonly string[],
): boolean {
  const requested =
    normalizeGenres(
      genres,
    );

  if (
    requested.length ===
      0 ||
    requested.includes(
      "all",
    )
  ) {
    return true;
  }

  const trackGenres =
    getTrackGenres(
      track,
    ).map(
      normalizeGenre,
    );

  return requested.some(
    (target) =>
      trackGenres.some(
        (genre) =>
          genre ===
            target ||
          genre.includes(
            target,
          ) ||
          target.includes(
            genre,
          ),
      ),
  );
}

function getElapsedSetSeconds(
  currentSet: CurrentSet,
  currentIndex: number,
): number {
  return currentSet.items
    .slice(
      0,
      Math.max(
        0,
        currentIndex,
      ),
    )
    .reduce(
      (
        total,
        item,
      ) =>
        total +
        Math.max(
          10,
          Math.round(
            item.plannedPlaySeconds ||
              60,
          ),
        ),
      0,
    );
}

function resolvePhase(
  eventPlan: SetlistEventPlan | null,
  currentSet: CurrentSet,
  currentIndex: number,
): LiveAdaptivePhase | null {
  if (
    !eventPlan ||
    eventPlan.phases.length ===
      0
  ) {
    return null;
  }

  const elapsedSeconds =
    getElapsedSetSeconds(
      currentSet,
      currentIndex,
    );

  let cursor =
    0;

  for (
    let index = 0;
    index <
    eventPlan.phases.length;
    index += 1
  ) {
    const phase =
      eventPlan.phases[
        index
      ];

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

    const isLast =
      index ===
      eventPlan.phases.length -
        1;

    if (
      elapsedSeconds <
        endSeconds ||
      isLast
    ) {
      const duration =
        Math.max(
          1,
          endSeconds -
            startSeconds,
        );

      return {
        index,
        name:
          phase.name,

        elapsedSeconds,
        startSeconds,
        endSeconds,

        progress:
          clamp(
            (
              elapsedSeconds -
              startSeconds
            ) /
              duration,
          ),

        targetGenres:
          [...phase.genres],

        minimumBpm:
          phase.minimumBpm,

        maximumBpm:
          phase.maximumBpm,
      };
    }
  }

  return null;
}

function currentBpmMatches(
  track: Track | null,
  phase: LiveAdaptivePhase | null,
): boolean {
  if (
    !track ||
    !phase
  ) {
    return true;
  }

  const bpm =
    getBpm(
      track,
    );

  return (
    bpm === null ||
    (
      bpm >=
        phase.minimumBpm &&
      bpm <=
        phase.maximumBpm
    )
  );
}

function currentGenreMatches(
  track: Track | null,
  phase: LiveAdaptivePhase | null,
): boolean {
  if (
    !track ||
    !phase
  ) {
    return true;
  }

  return trackMatchesGenres(
    track,
    phase.targetGenres,
  );
}

function determineAction(
  currentTrack: Track | null,
  recentTracks: readonly Track[],
  phase: LiveAdaptivePhase | null,
): {
  action: LiveAdaptiveAction;
  title: string;
  explanation: string;
  confidence: number;
} {
  if (!currentTrack) {
    return {
      action:
        "stay-bpm",

      title:
        "Start the live set",

      explanation:
        "Flamingo needs a current track before it can calculate an adaptive direction.",

      confidence:
        45,
    };
  }

  const bpmMatches =
    currentBpmMatches(
      currentTrack,
      phase,
    );

  const genreMatches =
    currentGenreMatches(
      currentTrack,
      phase,
    );

  if (
    phase &&
    (
      !bpmMatches ||
      !genreMatches
    )
  ) {
    const reasons: string[] =
      [];

    if (!bpmMatches) {
      reasons.push(
        `BPM is outside ${phase.minimumBpm}–${phase.maximumBpm}`,
      );
    }

    if (!genreMatches) {
      reasons.push(
        "style does not match the current phase",
      );
    }

    return {
      action:
        "return-to-plan",

      title:
        `Return to ${phase.name}`,

      explanation:
        `The Current Set is drifting from the Event Plan: ${reasons.join(
          " and ",
        )}.`,

      confidence:
        94,
    };
  }

  const recent =
    recentTracks.slice(
      -4,
    );

  const energies =
    recent
      .map(
        getEnergy,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const currentEnergy =
    getEnergy(
      currentTrack,
    );

  const averageEnergy =
    energies.length >
    0
      ? energies.reduce(
          (
            total,
            value,
          ) =>
            total + value,
          0,
        ) /
        energies.length
      : currentEnergy;

  if (
    phase &&
    (
      phase.name
        .toLowerCase()
        .includes(
          "peak",
        ) ||
      phase.progress >
        0.65
    ) &&
    currentEnergy !==
      null &&
    averageEnergy !==
      null &&
    currentEnergy <
      averageEnergy - 0.7
  ) {
    return {
      action:
        "more-energy",

      title:
        "Increase energy",

      explanation:
        "The current phase is moving toward its stronger section, but the current track sits below the recent Energy level.",

      confidence:
        88,
    };
  }

  if (
    currentEnergy !==
      null &&
    averageEnergy !==
      null &&
    currentEnergy >
      averageEnergy + 1.4
  ) {
    return {
      action:
        "less-energy",

      title:
        "Reduce energy slightly",

      explanation:
        "The current track is significantly above the recent Energy average. A controlled step down can preserve the peak longer.",

      confidence:
        82,
    };
  }

  const recentGenres =
    recent.flatMap(
      (track) =>
        getTrackGenres(
          track,
        ).map(
          normalizeGenre,
        ),
    );

  const uniqueGenres =
    new Set(
      recentGenres.filter(
        Boolean,
      ),
    );

  if (
    recent.length >=
      4 &&
    uniqueGenres.size <=
      1 &&
    (
      !phase ||
      phase.targetGenres.length >
        1
    )
  ) {
    return {
      action:
        "change-style",

      title:
        "Change style direction",

      explanation:
        "The recent sequence has stayed in one style. Use another compatible style from the current Event Plan phase.",

      confidence:
        84,
    };
  }

  const popularity =
    getPopularity(
      currentTrack,
    );

  if (
    popularity !==
      null &&
    popularity < 55 &&
    recent.length >= 3
  ) {
    return {
      action:
        "play-a-hit",

      title:
        "Play a familiar track",

      explanation:
        "The current track has lower Spotify Popularity. A recognizable track can stabilize the room without abandoning the current BPM zone.",

      confidence:
        77,
    };
  }

  return {
    action:
      "stay-bpm",

    title:
      "Stay in the BPM zone",

    explanation:
      phase
        ? `The current track follows the ${phase.name} plan. Keep BPM within ${phase.minimumBpm}–${phase.maximumBpm} and use Key/Camelot to choose the next move.`
        : "The current sequence is stable. Keep BPM changes small and prioritize harmonic compatibility.",

    confidence:
      phase
        ? 91
        : 79,
  };
}

function scoreCandidate(
  source: Track,
  candidate: Track,
  action: LiveAdaptiveAction,
  phase: LiveAdaptivePhase | null,
): LiveAdaptiveCandidate | null {
  const match =
    scoreSongMatch(
      source,
      candidate,
      {
        mode:
          action ===
          "change-style"
            ? "cross-style"
            : "same-style",

        minimumScore: 0,
        requireGenreMatch:
          false,

        maxBpmDifference:
          30,

        maxEnergyDifference:
          5,

        popularityPreference:
          action ===
          "play-a-hit"
            ? "higher"
            : "similar",
      },
    );

  if (!match) {
    return null;
  }

  const sourceBpm =
    getBpm(
      source,
    );

  const candidateBpm =
    getBpm(
      candidate,
    );

  const sourceEnergy =
    getEnergy(
      source,
    );

  const candidateEnergy =
    getEnergy(
      candidate,
    );

  const candidatePopularity =
    getPopularity(
      candidate,
    );

  const genreMatch =
    phase
      ? trackMatchesGenres(
          candidate,
          phase.targetGenres,
        )
      : true;

  const bpmMatch =
    !phase ||
    candidateBpm ===
      null ||
    (
      candidateBpm >=
        phase.minimumBpm &&
      candidateBpm <=
        phase.maximumBpm
    );

  const popularityMatch =
    candidatePopularity ===
      null ||
    candidatePopularity >=
      65;

  let directionScore =
    0.5;

  if (
    sourceEnergy !==
      null &&
    candidateEnergy !==
      null
  ) {
    const difference =
      candidateEnergy -
      sourceEnergy;

    if (
      action ===
      "more-energy"
    ) {
      directionScore =
        difference >=
        0
          ? clamp(
              1 -
                Math.abs(
                  difference -
                    0.8,
                ) /
                  3,
            )
          : 0.15;
    } else if (
      action ===
      "less-energy"
    ) {
      directionScore =
        difference <=
        0
          ? clamp(
              1 -
                Math.abs(
                  difference +
                    0.7,
                ) /
                  3,
            )
          : 0.15;
    } else {
      directionScore =
        clamp(
          1 -
            Math.abs(
              difference,
            ) /
              4,
        );
    }
  }

  if (
    action ===
      "play-a-hit"
  ) {
    directionScore =
      candidatePopularity ===
      null
        ? 0.25
        : clamp(
            candidatePopularity /
              100,
          );
  }

  const planScore =
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

  const score =
    (
      match.breakdown.bpm *
        0.3 +
      match.breakdown.camelot *
        0.22 +
      match.breakdown.energy *
        0.12 +
      match.breakdown.genre *
        0.08 +
      match.breakdown.popularity *
        0.08 +
      directionScore *
        0.1 +
      planScore *
        0.1
    );

  return {
    track:
      candidate,

    score,

    percentage:
      Math.round(
        score * 100,
      ),

    bpmDifference:
      sourceBpm !==
        null &&
      candidateBpm !==
        null
        ? Number(
            Math.abs(
              candidateBpm -
                sourceBpm,
            ).toFixed(
              1,
            ),
          )
        : null,

    energyDifference:
      sourceEnergy !==
        null &&
      candidateEnergy !==
        null
        ? Number(
            (
              candidateEnergy -
              sourceEnergy
            ).toFixed(
              1,
            ),
          )
        : null,

    genreMatch,
    bpmMatch,
    popularityMatch,
  };
}

export function buildLiveAdaptiveDirection(
  currentTrack: Track | null,
  recentTracks: readonly Track[],
  libraryTracks: readonly Track[],
  excludedTrackIds:
    ReadonlySet<string>,
  currentSet: CurrentSet,
  currentIndex: number,
  eventPlan: SetlistEventPlan | null,
): LiveAdaptiveDirection {
  const phase =
    resolvePhase(
      eventPlan,
      currentSet,
      currentIndex,
    );

  const decision =
    determineAction(
      currentTrack,
      recentTracks,
      phase,
    );

  const currentBpmInPlan =
    currentBpmMatches(
      currentTrack,
      phase,
    );

  const currentGenreInPlan =
    currentGenreMatches(
      currentTrack,
      phase,
    );

  const candidates =
    currentTrack
      ? libraryTracks
          .filter(
            (track) =>
              track.id !==
                currentTrack.id &&
              !excludedTrackIds.has(
                track.id,
              ),
          )
          .map(
            (candidate) =>
              scoreCandidate(
                currentTrack,
                candidate,
                decision.action,
                phase,
              ),
          )
          .filter(
            (
              candidate,
            ): candidate is LiveAdaptiveCandidate =>
              candidate !==
              null,
          )
          .filter(
            (candidate) => {
              if (
                decision.action ===
                "return-to-plan"
              ) {
                return (
                  candidate.genreMatch &&
                  candidate.bpmMatch
                );
              }

              if (
                decision.action ===
                "play-a-hit"
              ) {
                return (
                  candidate.popularityMatch &&
                  candidate.bpmMatch
                );
              }

              if (
                decision.action ===
                "change-style" &&
                phase &&
                phase.targetGenres.length >
                  0
              ) {
                return (
                  candidate.genreMatch &&
                  candidate.bpmMatch
                );
              }

              return true;
            },
          )
          .sort(
            (
              left,
              right,
            ) => {
              if (
                left.bpmMatch !==
                right.bpmMatch
              ) {
                return left.bpmMatch
                  ? -1
                  : 1;
              }

              if (
                left.genreMatch !==
                right.genreMatch
              ) {
                return left.genreMatch
                  ? -1
                  : 1;
              }

              return (
                right.score -
                left.score
              );
            },
          )
          .slice(
            0,
            5,
          )
      : [];

  return {
    action:
      decision.action,

    title:
      decision.title,

    explanation:
      decision.explanation,

    confidence:
      decision.confidence,

    targetBpmMin:
      phase?.minimumBpm ??
      null,

    targetBpmMax:
      phase?.maximumBpm ??
      null,

    targetGenres:
      phase?.targetGenres ??
      [],

    currentTrackInPlan:
      currentBpmInPlan &&
      currentGenreInPlan,

    currentBpmInPlan,
    currentGenreInPlan,

    phase,

    candidates,
  };
}
