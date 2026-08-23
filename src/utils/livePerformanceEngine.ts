import type {
  AudienceResponseEntry,
} from "../types/audienceResponse";

import type {
  CurrentSet,
} from "../types/setlist";

import type {
  EventProfile,
} from "../types/eventProfile";

import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

import type {
  LivePerformanceAudienceSummary,
  LivePerformanceObservation,
  LivePerformanceRecord,
  LivePerformanceTrack,
} from "../types/livePerformance";

import type {
  LiveSession,
} from "../types/liveSession";

import type {
  Track,
} from "../types/track";

import {
  getTrackGenres,
  normalizeGenre,
  scoreSongMatch,
} from "./matchSongs";

function clampScore(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        value,
      ),
    ),
  );
}

function numberValue(
  value: unknown,
): number | null {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
      ? value
      : null
  );
}

function average(
  values:
    Array<number | null>,
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

function calculateDurationSeconds(
  session: LiveSession,
  endedAt: string,
): number {
  if (!session.startedAt) {
    return 0;
  }

  const startedMs =
    new Date(
      session.startedAt,
    ).getTime();

  const endedMs =
    new Date(
      endedAt,
    ).getTime();

  if (
    !Number.isFinite(
      startedMs,
    ) ||
    !Number.isFinite(
      endedMs,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      (
        endedMs -
        startedMs -
        session.accumulatedPausedMs
      ) /
        1000,
    ),
  );
}

function buildPlayedTracks(
  session: LiveSession,
  currentTrack: Track | null,
  trackById:
    ReadonlyMap<string, Track>,
): Track[] {
  const ids = [
    ...session.playedTrackIds,
  ];

  if (
    currentTrack &&
    !ids.includes(
      currentTrack.id,
    )
  ) {
    ids.push(
      currentTrack.id,
    );
  }

  return ids
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
    );
}

function summarizeTracks(
  tracks:
    readonly Track[],
): LivePerformanceTrack[] {
  return tracks.map(
    (
      track,
      index,
    ) => ({
      position:
        index + 1,

      trackId:
        track.id,

      title:
        track.title,

      artist:
        track.artist,

      bpm:
        numberValue(
          track.tempo,
        ),

      energy:
        numberValue(
          track.energy,
        ),

      popularity:
        numberValue(
          track.spotifyPopularity,
        ),

      genre:
        getTrackGenres(
          track,
        )[0] ??
        track.genre ??
        null,
    }),
  );
}

function buildAudienceSummary(
  entries:
    readonly AudienceResponseEntry[],
): LivePerformanceAudienceSummary {
  const great =
    entries.filter(
      (entry) =>
        entry.level ===
        "great",
    ).length;

  const good =
    entries.filter(
      (entry) =>
        entry.level ===
        "good",
    ).length;

  const neutral =
    entries.filter(
      (entry) =>
        entry.level ===
        "neutral",
    ).length;

  const losingCrowd =
    entries.filter(
      (entry) =>
        entry.level ===
        "losing-crowd",
    ).length;

  const total =
    entries.length;

  const weighted =
    great * 100 +
    good * 78 +
    neutral * 52 +
    losingCrowd * 18;

  return {
    great,
    good,
    neutral,
    losingCrowd,
    total,

    score:
      total === 0
        ? 70
        : clampScore(
            weighted /
              total,
          ),
  };
}

function transitionFlowScore(
  tracks:
    readonly Track[],
): number {
  if (
    tracks.length <=
    1
  ) {
    return 70;
  }

  const scores: number[] =
    [];

  for (
    let index = 0;
    index <
    tracks.length - 1;
    index += 1
  ) {
    const match =
      scoreSongMatch(
        tracks[index],
        tracks[
          index + 1
        ],
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

    scores.push(
      match
        ? match.score * 100
        : 35,
    );
  }

  return clampScore(
    scores.reduce(
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
      scores.length,
  );
}

function energyJourneyScore(
  tracks:
    readonly Track[],
): number {
  const energies =
    tracks
      .map(
        (track) =>
          numberValue(
            track.energy,
          ),
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  if (
    energies.length <=
    1
  ) {
    return 70;
  }

  let penalty =
    0;

  for (
    let index = 0;
    index <
    energies.length - 1;
    index += 1
  ) {
    const difference =
      Math.abs(
        energies[
          index + 1
        ] -
        energies[index],
      );

    if (
      difference >
      2.5
    ) {
      penalty +=
        difference >= 4
          ? 12
          : 6;
    }
  }

  const range =
    Math.max(
      ...energies,
    ) -
    Math.min(
      ...energies,
    );

  const shapeBonus =
    range >= 2
      ? 8
      : 0;

  return clampScore(
    88 -
      penalty +
      shapeBonus,
  );
}

function trackMatchesGenres(
  track: Track,
  genres:
    readonly string[],
): boolean {
  const requested =
    genres
      .map(
        normalizeGenre,
      )
      .filter(Boolean);

  if (
    requested.length ===
      0 ||
    requested.includes(
      "all",
    )
  ) {
    return true;
  }

  const actual =
    getTrackGenres(
      track,
    ).map(
      normalizeGenre,
    );

  return requested.some(
    (target) =>
      actual.some(
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

function eventPlanScore(
  tracks:
    readonly Track[],
  currentSet: CurrentSet,
  eventPlan:
    SetlistEventPlan | null,
): number | null {
  if (
    !eventPlan ||
    eventPlan.phases.length ===
      0 ||
    tracks.length ===
      0
  ) {
    return null;
  }

  const itemByTrackId =
    new Map(
      currentSet.items.map(
        (item) => [
          item.trackId,
          item,
        ],
      ),
    );

  const boundaries: Array<{
    start: number;
    end: number;
  }> = [];

  let phaseCursor =
    0;

  eventPlan.phases.forEach(
    (phase) => {
      const start =
        phaseCursor;

      const end =
        start +
        Math.max(
          1,
          phase.durationMinutes,
        ) *
          60;

      boundaries.push({
        start,
        end,
      });

      phaseCursor =
        end;
    },
  );

  let trackCursor =
    0;

  const scores =
    tracks.map(
      (
        track,
        index,
      ) => {
        const item =
          itemByTrackId.get(
            track.id,
          );

        const playSeconds =
          Math.max(
            10,
            Math.round(
              item?.plannedPlaySeconds ??
                eventPlan.averagePlaySeconds ??
                60,
            ),
          );

        const midpoint =
          trackCursor +
          playSeconds / 2;

        trackCursor +=
          playSeconds;

        let phaseIndex =
          boundaries.findIndex(
            (boundary) =>
              midpoint >=
                boundary.start &&
              midpoint <
                boundary.end,
          );

        if (
          phaseIndex < 0
        ) {
          phaseIndex =
            Math.min(
              index,
              eventPlan.phases.length -
                1,
            );
        }

        const phase =
          eventPlan.phases[
            phaseIndex
          ];

        const bpm =
          numberValue(
            track.tempo,
          );

        const bpmMatch =
          bpm === null ||
          (
            bpm >=
              phase.minimumBpm &&
            bpm <=
              phase.maximumBpm
          );

        const genreMatch =
          trackMatchesGenres(
            track,
            phase.genres,
          );

        return (
          (
            bpmMatch
              ? 1
              : 0
          ) *
            0.45 +
          (
            genreMatch
              ? 1
              : 0
          ) *
            0.55
        ) *
          100;
      },
    );

  return clampScore(
    scores.reduce(
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
      scores.length,
  );
}

function styleVarietyScore(
  tracks:
    readonly Track[],
): number {
  if (
    tracks.length ===
    0
  ) {
    return 60;
  }

  const genres =
    new Set(
      tracks
        .flatMap(
          (track) =>
            getTrackGenres(
              track,
            ),
        )
        .map(
          normalizeGenre,
        )
        .filter(Boolean),
    );

  if (
    genres.size >= 4
  ) {
    return 95;
  }

  if (
    genres.size === 3
  ) {
    return 88;
  }

  if (
    genres.size === 2
  ) {
    return 78;
  }

  return tracks.length >=
    8
    ? 62
    : 72;
}

function buildObservations(
  tracks:
    readonly Track[],
  audience:
    LivePerformanceAudienceSummary,
  eventCompliance:
    number | null,
  transitionScore: number,
  energyScore: number,
): LivePerformanceObservation[] {
  const observations:
    LivePerformanceObservation[] =
      [];

  if (
    transitionScore >=
    85
  ) {
    observations.push({
      id:
        "transition-positive",
      type:
        "positive",
      title:
        "Strong transition flow",
      detail:
        `Transition Flow finished at ${transitionScore}/100.`,
    });
  } else if (
    transitionScore <
    70
  ) {
    observations.push({
      id:
        "transition-warning",
      type:
        "warning",
      title:
        "Transitions need review",
      detail:
        `Transition Flow finished at ${transitionScore}/100. Review BPM and Key/Camelot changes.`,
    });
  }

  if (
    energyScore >=
    85
  ) {
    observations.push({
      id:
        "energy-positive",
      type:
        "positive",
      title:
        "Controlled Energy journey",
      detail:
        `Energy Journey finished at ${energyScore}/100.`,
    });
  } else if (
    energyScore <
    70
  ) {
    observations.push({
      id:
        "energy-warning",
      type:
        "warning",
      title:
        "Abrupt Energy movement",
      detail:
        "The played sequence contains large Energy changes that may need smoother bridge tracks.",
    });
  }

  if (
    eventCompliance !==
      null &&
    eventCompliance >=
      85
  ) {
    observations.push({
      id:
        "plan-positive",
      type:
        "positive",
      title:
        "Event Plan followed",
      detail:
        `The played set reached ${eventCompliance}% compliance with planned BPM and styles.`,
    });
  } else if (
    eventCompliance !==
      null &&
    eventCompliance <
      70
  ) {
    observations.push({
      id:
        "plan-warning",
      type:
        "warning",
      title:
        "Set drifted from plan",
      detail:
        `Event Plan compliance was ${eventCompliance}%. Compare the played styles and BPM with each planned phase.`,
    });
  }

  if (
    audience.losingCrowd >
    0
  ) {
    observations.push({
      id:
        "crowd-warning",
      type:
        "warning",
      title:
        "Losing-crowd moments recorded",
      detail:
        `${audience.losingCrowd} losing-crowd response${
          audience.losingCrowd ===
          1
            ? ""
            : "s"
        } were recorded.`,
    });
  }

  if (
    audience.great >
    audience.losingCrowd &&
    audience.great > 0
  ) {
    observations.push({
      id:
        "crowd-positive",
      type:
        "positive",
      title:
        "Positive crowd response",
      detail:
        `${audience.great} GREAT response${
          audience.great ===
          1
            ? ""
            : "s"
        } were recorded during the session.`,
    });
  }

  if (
    tracks.length <
    2
  ) {
    observations.push({
      id:
        "short-session",
      type:
        "info",
      title:
        "Short session sample",
      detail:
        "More played tracks are needed for reliable performance analytics.",
    });
  }

  return observations;
}

export function buildLivePerformanceRecord({
  session,
  currentTrack,
  tracks,
  currentSet,
  eventPlan,
  eventProfile,
  audienceResponses,
  endedAt,
}: {
  session:
    LiveSession;

  currentTrack:
    Track | null;

  tracks:
    readonly Track[];

  currentSet:
    CurrentSet;

  eventPlan:
    SetlistEventPlan | null;

  eventProfile:
    EventProfile | null;

  audienceResponses:
    readonly AudienceResponseEntry[];

  endedAt:
    string;
}): LivePerformanceRecord {
  const trackById =
    new Map(
      tracks.map(
        (track) => [
          track.id,
          track,
        ],
      ),
    );

  const played =
    buildPlayedTracks(
      session,
      currentTrack,
      trackById,
    );

  const summarized =
    summarizeTracks(
      played,
    );

  const audience =
    buildAudienceSummary(
      audienceResponses,
    );

  const transitionFlow =
    transitionFlowScore(
      played,
    );

  const energyJourney =
    energyJourneyScore(
      played,
    );

  const eventPlanCompliance =
    eventPlanScore(
      played,
      currentSet,
      eventPlan,
    );

  const styleVariety =
    styleVarietyScore(
      played,
    );

  const crowdResponse =
    audience.score;

  const overall =
    clampScore(
      transitionFlow *
        0.27 +
      energyJourney *
        0.2 +
      (
        eventPlanCompliance ??
        75
      ) *
        0.2 +
      crowdResponse *
        0.18 +
      styleVariety *
        0.15,
    );

  const bpmValues =
    summarized
      .map(
        (track) =>
          track.bpm,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const energyValues =
    summarized
      .map(
        (track) =>
          track.energy,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const startedAt =
    session.startedAt ??
    endedAt;

  const createdAt =
    new Date().toISOString();

  return {
    id:
      `performance-${Date.now()}`,

    name:
      `Live Session ${new Date(
        endedAt,
      ).toLocaleDateString()}`,

    startedAt,
    endedAt,

    durationSeconds:
      calculateDurationSeconds(
        session,
        endedAt,
      ),

    currentSetName:
      currentSet.name,

    eventPlanName:
      eventPlan?.name ??
      null,

    eventProfileId:
      eventProfile?.id ??
      null,

    eventProfileName:
      eventProfile?.name ??
      null,

    eventProfileType:
      eventProfile?.type ??
      null,

    tracks:
      summarized,

    audienceEntries:
      audienceResponses.map(
        (entry) => ({
          level:
            entry.level,
          trackId:
            entry.trackId,
          createdAt:
            entry.createdAt,
        }),
      ),

    audience,

    averageBpm:
      average(
        summarized.map(
          (track) =>
            track.bpm,
        ),
      ),

    averageEnergy:
      average(
        summarized.map(
          (track) =>
            track.energy,
        ),
      ),

    averagePopularity:
      average(
        summarized.map(
          (track) =>
            track.popularity,
        ),
      ),

    minimumBpm:
      bpmValues.length >
      0
        ? Math.min(
            ...bpmValues,
          )
        : null,

    maximumBpm:
      bpmValues.length >
      0
        ? Math.max(
            ...bpmValues,
          )
        : null,

    startEnergy:
      energyValues[0] ??
      null,

    peakEnergy:
      energyValues.length >
      0
        ? Math.max(
            ...energyValues,
          )
        : null,

    endEnergy:
      energyValues[
        energyValues.length -
          1
      ] ??
      null,

    eventPlanCompliance,

    scores: {
      overall,
      transitionFlow,
      energyJourney,
      eventPlan:
        eventPlanCompliance ??
        75,
      crowdResponse,
      styleVariety,
    },

    observations:
      buildObservations(
        played,
        audience,
        eventPlanCompliance,
        transitionFlow,
        energyJourney,
      ),

    createdAt,
  };
}
