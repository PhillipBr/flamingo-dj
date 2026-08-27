import type { Track } from "../types/track";

export type PartySortStyle =
  | "smooth"
  | "dynamic"
  | "peak";

export type PartySortSettings = {
  style: PartySortStyle;

  startBpm:
    | number
    | null;

  allowHalfDouble:
    boolean;

  harmonicPriority:
    | "high"
    | "medium"
    | "low";

  artistSpacing:
    number;

  blockSize:
    number;
};

export type PartyTransition = {
  fromTrackId: string;
  toTrackId: string;

  bpmDistance:
    | number
    | null;

  bpmMode:
    | "normal"
    | "half-double"
    | "unknown";

  harmonicScore:
    number;

  energyDelta:
    | number
    | null;

  score: number;
};

export type PartySortResult = {
  tracks: Track[];

  transitions:
    PartyTransition[];

  averageScore:
    number;

  halfDoubleTransitions:
    number;

  majorBpmResets:
    number;
};

type Camelot = {
  number: number;
  letter: "A" | "B";
};

const NOTE_TO_CAMELOT:
  Record<
    string,
    string
  > = {
    "G#m": "1A",
    "Abm": "1A",
    "B": "1B",

    "D#m": "2A",
    "Ebm": "2A",
    "F#": "2B",
    "Gb": "2B",

    "A#m": "3A",
    "Bbm": "3A",
    "C#": "3B",
    "Db": "3B",

    "Fm": "4A",
    "Ab": "4B",
    "G#": "4B",

    "Cm": "5A",
    "Eb": "5B",
    "D#": "5B",

    "Gm": "6A",
    "Bb": "6B",
    "A#": "6B",

    "Dm": "7A",
    "F": "7B",

    "Am": "8A",
    "C": "8B",

    "Em": "9A",
    "G": "9B",

    "Bm": "10A",
    "D": "10B",

    "F#m": "11A",
    "Gbm": "11A",
    "A": "11B",

    "C#m": "12A",
    "Dbm": "12A",
    "E": "12B",
  };

function finiteNumber(
  value: unknown,
):
  | number
  | null {
  const number =
    Number(
      value,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function normalizedArtist(
  track: Track,
): string {
  return String(
    track.artist ??
      "",
  )
    .toLocaleLowerCase()
    .trim();
}

function getBpm(
  track: Track,
):
  | number
  | null {
  const bpm =
    finiteNumber(
      track.tempo,
    );

  if (
    bpm === null ||
    bpm <= 0
  ) {
    return null;
  }

  return bpm;
}

function getEnergy(
  track: Track,
):
  | number
  | null {
  const energy =
    finiteNumber(
      track.energy,
    );

  if (
    energy === null
  ) {
    return null;
  }

  return energy;
}

function normalizeCamelotText(
  raw: string,
):
  | string
  | null {
  const cleaned =
    raw
      .trim()
      .replace(
        /\s+/g,
        "",
      )
      .toUpperCase();

  const direct =
    cleaned.match(
      /^(1[0-2]|[1-9])([AB])$/,
    );

  if (
    direct
  ) {
    return `${direct[1]}${direct[2]}`;
  }

  return null;
}

function normalizeMusicalKey(
  raw: string,
): string {
  const compact =
    raw
      .trim()
      .replace(
        /\s+/g,
        "",
      )
      .replace(
        /minor$/i,
        "m",
      )
      .replace(
        /major$/i,
        "",
      );

  if (
    !compact
  ) {
    return "";
  }

  const first =
    compact.charAt(
      0,
    ).toUpperCase();

  return (
    first +
    compact.slice(
      1,
    )
  );
}

function noteToCamelot(
  raw: string,
):
  | string
  | null {
  const normalized =
    normalizeMusicalKey(
      raw,
    );

  if (
    !normalized
  ) {
    return null;
  }

  return (
    NOTE_TO_CAMELOT[
      normalized
    ] ??
    null
  );
}

function getCamelot(
  track: Track,
):
  | Camelot
  | null {
  /*
   * IMPORTANT:
   * Track does not have a `camelot` property in the current Flamingo model.
   * Camelot is derived from musicalKey when needed.
   */
  const raw =
    String(
      track.musicalKey ??
        "",
    ).trim();

  if (
    !raw
  ) {
    return null;
  }

  const camelotText =
    normalizeCamelotText(
      raw,
    ) ??
    noteToCamelot(
      raw,
    );

  if (
    !camelotText
  ) {
    return null;
  }

  const match =
    camelotText.match(
      /^(1[0-2]|[1-9])([AB])$/,
    );

  if (
    !match
  ) {
    return null;
  }

  return {
    number:
      Number(
        match[1],
      ),

    letter:
      match[2] as
        "A" | "B",
  };
}

function circularCamelotDistance(
  a: number,
  b: number,
): number {
  const direct =
    Math.abs(
      a - b,
    );

  return Math.min(
    direct,
    12 - direct,
  );
}

function harmonicCompatibility(
  first: Track,
  second: Track,
): number {
  const a =
    getCamelot(
      first,
    );

  const b =
    getCamelot(
      second,
    );

  if (
    !a ||
    !b
  ) {
    return 0.55;
  }

  if (
    a.number ===
      b.number &&
    a.letter ===
      b.letter
  ) {
    return 1;
  }

  const distance =
    circularCamelotDistance(
      a.number,
      b.number,
    );

  if (
    distance === 1 &&
    a.letter ===
      b.letter
  ) {
    return 0.94;
  }

  if (
    a.number ===
      b.number &&
    a.letter !==
      b.letter
  ) {
    return 0.9;
  }

  if (
    distance === 2 &&
    a.letter ===
      b.letter
  ) {
    return 0.7;
  }

  return 0.32;
}

export function bpmCompatibility(
  firstBpm:
    | number
    | null,
  secondBpm:
    | number
    | null,
  allowHalfDouble = true,
): {
  distance:
    | number
    | null;

  mode:
    | "normal"
    | "half-double"
    | "unknown";

  score:
    number;
} {
  if (
    firstBpm ===
      null ||
    secondBpm ===
      null
  ) {
    return {
      distance:
        null,

      mode:
        "unknown",

      score:
        0.5,
    };
  }

  const candidates: Array<{
    distance: number;

    mode:
      | "normal"
      | "half-double";
  }> = [
    {
      distance:
        Math.abs(
          firstBpm -
            secondBpm,
        ),

      mode:
        "normal",
    },
  ];

  if (
    allowHalfDouble
  ) {
    candidates.push(
      {
        distance:
          Math.abs(
            firstBpm -
              secondBpm *
                2,
          ),

        mode:
          "half-double",
      },
      {
        distance:
          Math.abs(
            firstBpm -
              secondBpm /
                2,
          ),

        mode:
          "half-double",
      },
      {
        distance:
          Math.abs(
            firstBpm *
              2 -
              secondBpm,
          ),

        mode:
          "half-double",
      },
      {
        distance:
          Math.abs(
            firstBpm /
              2 -
              secondBpm,
          ),

        mode:
          "half-double",
      },
    );
  }

  candidates.sort(
    (
      a,
      b,
    ) =>
      a.distance -
      b.distance,
  );

  const best =
    candidates[0];

  const score =
    Math.max(
      0,
      1 -
        best.distance /
          14,
    );

  return {
    distance:
      best.distance,

    mode:
      best.mode,

    score,
  };
}

function desiredEnergy(
  progress: number,
  style:
    PartySortStyle,
): number {
  if (
    style ===
    "peak"
  ) {
    return (
      6.5 +
      progress *
        2.8 +
      Math.sin(
        progress *
          Math.PI *
          4,
      ) *
        0.45
    );
  }

  if (
    style ===
    "smooth"
  ) {
    return (
      5 +
      progress *
        2.4 +
      Math.sin(
        progress *
          Math.PI *
          3,
      ) *
        0.35
    );
  }

  return (
    5.1 +
    progress *
      2.6 +
    Math.sin(
      progress *
        Math.PI *
        5,
    ) *
      0.85
  );
}

function desiredBpmDirection(
  index: number,
  blockSize:
    number,
): number {
  const block =
    Math.floor(
      index /
        Math.max(
          4,
          blockSize,
        ),
    );

  return (
    block % 3 ===
      1
      ? -1
      : 1
  );
}

function recentArtistPenalty(
  candidate: Track,
  recentTracks:
    Track[],
  artistSpacing:
    number,
): number {
  if (
    artistSpacing <=
    0
  ) {
    return 0;
  }

  const artist =
    normalizedArtist(
      candidate,
    );

  if (
    !artist
  ) {
    return 0;
  }

  const recent =
    recentTracks.slice(
      -artistSpacing,
    );

  return recent.some(
    (track) =>
      normalizedArtist(
        track,
      ) ===
      artist,
  )
    ? 1
    : 0;
}

function chooseStartTrack(
  tracks: Track[],
  settings:
    PartySortSettings,
): Track {
  const targetBpm =
    settings.startBpm;

  if (
    targetBpm !==
      null
  ) {
    return tracks
      .slice()
      .sort(
        (
          a,
          b,
        ) => {
          const aBpm =
            getBpm(
              a,
            );

          const bBpm =
            getBpm(
              b,
            );

          return (
            Math.abs(
              (
                aBpm ??
                targetBpm
              ) -
                targetBpm,
            ) -
            Math.abs(
              (
                bBpm ??
                targetBpm
              ) -
                targetBpm,
            )
          );
        },
      )[0];
  }

  return tracks
    .slice()
    .sort(
      (
        a,
        b,
      ) => {
        const aEnergy =
          getEnergy(
            a,
          ) ??
          5;

        const bEnergy =
          getEnergy(
            b,
          ) ??
          5;

        const aPopularity =
          finiteNumber(
            a.spotifyPopularity,
          ) ??
          50;

        const bPopularity =
          finiteNumber(
            b.spotifyPopularity,
          ) ??
          50;

        const aScore =
          Math.abs(
            aEnergy -
              5.2,
          ) +
          Math.max(
            0,
            aPopularity -
              78,
          ) /
            30;

        const bScore =
          Math.abs(
            bEnergy -
              5.2,
          ) +
          Math.max(
            0,
            bPopularity -
              78,
          ) /
            30;

        return (
          aScore -
          bScore
        );
      },
    )[0];
}

function transitionScore(
  current: Track,
  candidate: Track,
  progress: number,
  index: number,
  ordered: Track[],
  settings:
    PartySortSettings,
): {
  score:
    number;

  bpmDistance:
    | number
    | null;

  bpmMode:
    | "normal"
    | "half-double"
    | "unknown";

  harmonicScore:
    number;

  energyDelta:
    | number
    | null;
} {
  const bpm =
    bpmCompatibility(
      getBpm(
        current,
      ),
      getBpm(
        candidate,
      ),
      settings.allowHalfDouble,
    );

  const harmonic =
    harmonicCompatibility(
      current,
      candidate,
    );

  const currentEnergy =
    getEnergy(
      current,
    );

  const candidateEnergy =
    getEnergy(
      candidate,
    );

  const energyTarget =
    desiredEnergy(
      progress,
      settings.style,
    );

  const energyFit =
    candidateEnergy ===
    null
      ? 0.55
      : Math.max(
          0,
          1 -
            Math.abs(
              candidateEnergy -
                energyTarget,
            ) /
              5,
        );

  const energyDelta =
    currentEnergy !==
      null &&
    candidateEnergy !==
      null
      ? candidateEnergy -
        currentEnergy
      : null;

  const direction =
    desiredBpmDirection(
      index,
      settings.blockSize,
    );

  const currentBpm =
    getBpm(
      current,
    );

  const candidateBpm =
    getBpm(
      candidate,
    );

  let directionScore =
    0.6;

  if (
    currentBpm !==
      null &&
    candidateBpm !==
      null
  ) {
    const normalizedCandidate =
      bpm.mode ===
        "half-double"
        ? (
            Math.abs(
              candidateBpm *
                2 -
                currentBpm,
            ) <
            Math.abs(
              candidateBpm /
                2 -
                currentBpm,
            )
              ? candidateBpm *
                2
              : candidateBpm /
                2
          )
        : candidateBpm;

    const delta =
      normalizedCandidate -
      currentBpm;

    directionScore =
      direction >
      0
        ? (
            delta >=
            -2
              ? 1
              : 0.45
          )
        : (
            delta <=
            2
              ? 1
              : 0.45
          );
  }

  const artistPenalty =
    recentArtistPenalty(
      candidate,
      ordered,
      settings.artistSpacing,
    );

  const harmonicWeight =
    settings.harmonicPriority ===
    "high"
      ? 0.30
      : settings.harmonicPriority ===
          "medium"
        ? 0.22
        : 0.14;

  const bpmWeight =
    settings.style ===
    "smooth"
      ? 0.38
      : 0.34;

  const energyWeight =
    settings.style ===
    "peak"
      ? 0.32
      : 0.25;

  const directionWeight =
    0.12;

  const totalWeight =
    bpmWeight +
    harmonicWeight +
    energyWeight +
    directionWeight;

  let score =
    (
      bpm.score *
        bpmWeight +
      harmonic *
        harmonicWeight +
      energyFit *
        energyWeight +
      directionScore *
        directionWeight
    ) /
    totalWeight;

  score -=
    artistPenalty *
    0.25;

  if (
    bpm.mode ===
      "half-double" &&
    bpm.distance !==
      null &&
    bpm.distance <=
      2
  ) {
    score +=
      0.025;
  }

  return {
    score:
      Math.max(
        0,
        Math.min(
          1,
          score,
        ),
      ),

    bpmDistance:
      bpm.distance,

    bpmMode:
      bpm.mode,

    harmonicScore:
      harmonic,

    energyDelta,
  };
}

function candidateWindow(
  remaining:
    Track[],
  current: Track,
  settings:
    PartySortSettings,
): Track[] {
  if (
    remaining.length <=
    160
  ) {
    return remaining;
  }

  const currentBpm =
    getBpm(
      current,
    );

  const bpmSorted =
    remaining
      .slice()
      .sort(
        (
          a,
          b,
        ) => {
          const aMatch =
            bpmCompatibility(
              currentBpm,
              getBpm(
                a,
              ),
              settings.allowHalfDouble,
            );

          const bMatch =
            bpmCompatibility(
              currentBpm,
              getBpm(
                b,
              ),
              settings.allowHalfDouble,
            );

          return (
            bMatch.score -
            aMatch.score
          );
        },
      )
      .slice(
        0,
        120,
      );

  const stride =
    Math.max(
      1,
      Math.floor(
        remaining.length /
          40,
      ),
    );

  const sample =
    remaining.filter(
      (
        _,
        index,
      ) =>
        index %
          stride ===
        0,
    );

  return Array.from(
    new Map(
      [
        ...bpmSorted,
        ...sample,
      ].map(
        (track) => [
          track.id,
          track,
        ],
      ),
    ).values(),
  );
}

export function sortTracksForParty(
  sourceTracks:
    Track[],
  settings:
    PartySortSettings,
): PartySortResult {
  const tracks =
    sourceTracks.filter(
      (
        track,
        index,
        array,
      ) =>
        array.findIndex(
          (candidate) =>
            candidate.id ===
            track.id,
        ) ===
        index,
    );

  if (
    tracks.length <=
    1
  ) {
    return {
      tracks,

      transitions:
        [],

      averageScore:
        100,

      halfDoubleTransitions:
        0,

      majorBpmResets:
        0,
    };
  }

  const start =
    chooseStartTrack(
      tracks,
      settings,
    );

  const ordered:
    Track[] = [
      start,
    ];

  const remaining =
    tracks.filter(
      (track) =>
        track.id !==
        start.id,
    );

  const transitions:
    PartyTransition[] =
      [];

  while (
    remaining.length >
    0
  ) {
    const current =
      ordered[
        ordered.length -
          1
      ];

    const progress =
      ordered.length /
      tracks.length;

    const window =
      candidateWindow(
        remaining,
        current,
        settings,
      );

    let bestTrack =
      window[0];

    let bestScore =
      -Infinity;

    let bestDetails:
      ReturnType<
        typeof transitionScore
      > | null =
      null;

    for (
      const candidate of
      window
    ) {
      const details =
        transitionScore(
          current,
          candidate,
          progress,
          ordered.length,
          ordered,
          settings,
        );

      const blockBoundary =
        ordered.length %
          Math.max(
            4,
            settings.blockSize,
          ) ===
        0;

      let adjusted =
        details.score;

      if (
        blockBoundary &&
        details.bpmDistance !==
          null &&
        details.bpmDistance >=
          12
      ) {
        const energy =
          getEnergy(
            candidate,
          );

        const target =
          desiredEnergy(
            progress,
            settings.style,
          );

        const energyResetFit =
          energy ===
          null
            ? 0
            : Math.max(
                0,
                1 -
                  Math.abs(
                    energy -
                      target,
                  ) /
                    5,
              );

        adjusted +=
          0.08 *
          energyResetFit;
      }

      if (
        adjusted >
        bestScore
      ) {
        bestScore =
          adjusted;

        bestTrack =
          candidate;

        bestDetails =
          details;
      }
    }

    if (
      !bestTrack ||
      !bestDetails
    ) {
      break;
    }

    transitions.push({
      fromTrackId:
        current.id,

      toTrackId:
        bestTrack.id,

      bpmDistance:
        bestDetails.bpmDistance,

      bpmMode:
        bestDetails.bpmMode,

      harmonicScore:
        bestDetails.harmonicScore,

      energyDelta:
        bestDetails.energyDelta,

      score:
        Math.round(
          bestDetails.score *
            100,
        ),
    });

    ordered.push(
      bestTrack,
    );

    const removeIndex =
      remaining.findIndex(
        (track) =>
          track.id ===
          bestTrack.id,
      );

    if (
      removeIndex >=
      0
    ) {
      remaining.splice(
        removeIndex,
        1,
      );
    }
  }

  const averageScore =
    transitions.length
      ? Math.round(
          transitions.reduce(
            (
              total,
              transition,
            ) =>
              total +
              transition.score,
            0,
          ) /
            transitions.length,
        )
      : 100;

  const halfDoubleTransitions =
    transitions.filter(
      (transition) =>
        transition.bpmMode ===
        "half-double",
    ).length;

  const majorBpmResets =
    transitions.filter(
      (transition) =>
        transition.bpmMode ===
          "normal" &&
        transition.bpmDistance !==
          null &&
        transition.bpmDistance >=
          14,
    ).length;

  return {
    tracks:
      ordered,

    transitions,

    averageScore,

    halfDoubleTransitions,

    majorBpmResets,
  };
}

export const DEFAULT_PARTY_SORT_SETTINGS:
  PartySortSettings = {
    style:
      "dynamic",

    startBpm:
      null,

    allowHalfDouble:
      true,

    harmonicPriority:
      "high",

    artistSpacing:
      3,

    blockSize:
      8,
  };
