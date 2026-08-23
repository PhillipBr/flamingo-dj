import type {
  CurrentSet,
} from "../types/setlist";

import type {
  SetJourneyAnalysis,
  SetJourneyIssue,
  SetJourneyPhaseName,
  SetJourneyPhaseSummary,
  SetJourneyPoint,
} from "../types/setJourney";

import type {
  Track,
} from "../types/track";

const DEFAULT_PLANNED_SECONDS =
  60;

function numeric(
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

function phaseForProgress(
  progress: number,
): SetJourneyPhaseName {
  if (progress < 0.25) {
    return "Warm Up";
  }

  if (progress < 0.55) {
    return "Build";
  }

  if (progress < 0.8) {
    return "Peak";
  }

  return "Release";
}

function buildPoints(
  currentSet: CurrentSet,
  tracks: readonly Track[],
): SetJourneyPoint[] {
  const trackById =
    new Map(
      tracks.map(
        (track) => [
          track.id,
          track,
        ],
      ),
    );

  const resolved =
    currentSet.items
      .map(
        (item) => {
          const track =
            trackById.get(
              item.trackId,
            );

          if (!track) {
            return null;
          }

          return {
            item,
            track,
          };
        },
      )
      .filter(
        (
          value,
        ): value is {
          item:
            CurrentSet["items"][number];
          track: Track;
        } =>
          value !== null,
      );

  const totalSeconds =
    resolved.reduce(
      (
        total,
        entry,
      ) =>
        total +
        Math.max(
          10,
          Math.round(
            entry.item
              .plannedPlaySeconds ||
              DEFAULT_PLANNED_SECONDS,
          ),
        ),
      0,
    );

  let cursor =
    0;

  return resolved.map(
    (
      entry,
      index,
    ) => {
      const plannedPlaySeconds =
        Math.max(
          10,
          Math.round(
            entry.item
              .plannedPlaySeconds ||
              DEFAULT_PLANNED_SECONDS,
          ),
        );

      const startSeconds =
        cursor;

      const endSeconds =
        startSeconds +
        plannedPlaySeconds;

      cursor =
        endSeconds;

      const progress =
        totalSeconds > 0
          ? (
              startSeconds +
              plannedPlaySeconds /
                2
            ) /
            totalSeconds
          : 0;

      return {
        index,
        track:
          entry.track,

        plannedPlaySeconds,

        startSeconds,
        endSeconds,

        progress,

        bpm:
          numeric(
            entry.track.tempo,
          ),

        energy:
          numeric(
            entry.track.energy,
          ),

        popularity:
          numeric(
            entry.track
              .spotifyPopularity,
          ),

        phase:
          phaseForProgress(
            progress,
          ),
      };
    },
  );
}

function buildIssues(
  points:
    readonly SetJourneyPoint[],
): SetJourneyIssue[] {
  const issues:
    SetJourneyIssue[] = [];

  for (
    let index = 0;
    index <
    points.length - 1;
    index += 1
  ) {
    const current =
      points[index];

    const next =
      points[
        index + 1
      ];

    if (
      current.energy !==
        null &&
      next.energy !==
        null
    ) {
      const difference =
        next.energy -
        current.energy;

      if (
        difference >=
        2.5
      ) {
        issues.push({
          id:
            `energy-jump-${index}`,

          type:
            "energy-jump",

          severity:
            difference >= 4
              ? "poor"
              : "warning",

          startIndex:
            index,

          endIndex:
            index + 1,

          title:
            "Large energy jump",

          detail:
            `Energy rises from ${current.energy.toFixed(
              1,
            )} to ${next.energy.toFixed(
              1,
            )}.`,
        });
      }

      if (
        difference <=
        -2.5
      ) {
        issues.push({
          id:
            `energy-drop-${index}`,

          type:
            "energy-drop",

          severity:
            difference <= -4
              ? "poor"
              : "warning",

          startIndex:
            index,

          endIndex:
            index + 1,

          title:
            "Large energy drop",

          detail:
            `Energy falls from ${current.energy.toFixed(
              1,
            )} to ${next.energy.toFixed(
              1,
            )}.`,
        });
      }
    }

    if (
      current.bpm !==
        null &&
      next.bpm !==
        null
    ) {
      const difference =
        next.bpm -
        current.bpm;

      if (
        difference >=
        10
      ) {
        issues.push({
          id:
            `bpm-jump-${index}`,

          type:
            "bpm-jump",

          severity:
            difference >= 16
              ? "poor"
              : "warning",

          startIndex:
            index,

          endIndex:
            index + 1,

          title:
            "Abrupt BPM increase",

          detail:
            `BPM rises from ${Math.round(
              current.bpm,
            )} to ${Math.round(
              next.bpm,
            )}.`,
        });
      }

      if (
        difference <=
        -6
      ) {
        issues.push({
          id:
            `bpm-drop-${index}`,

          type:
            "bpm-drop",

          severity:
            difference <= -12
              ? "poor"
              : "warning",

          startIndex:
            index,

          endIndex:
            index + 1,

          title:
            "BPM drop",

          detail:
            `BPM falls from ${Math.round(
              current.bpm,
            )} to ${Math.round(
              next.bpm,
            )}.`,
        });
      }
    }
  }

  /*
   * Flat-energy detection:
   * 4+ consecutive tracks whose Energy range stays <= 0.75.
   */
  let start =
    0;

  while (
    start <
    points.length
  ) {
    let end =
      start;

    while (
      end + 1 <
      points.length
    ) {
      const window =
        points.slice(
          start,
          end + 2,
        );

      const energies =
        window
          .map(
            (point) =>
              point.energy,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          );

      if (
        energies.length !==
        window.length
      ) {
        break;
      }

      const range =
        Math.max(
          ...energies,
        ) -
        Math.min(
          ...energies,
        );

      if (
        range > 0.75
      ) {
        break;
      }

      end += 1;
    }

    if (
      end - start + 1 >=
      4
    ) {
      const durationSeconds =
        points[end]
          .endSeconds -
        points[start]
          .startSeconds;

      issues.push({
        id:
          `flat-energy-${start}-${end}`,

        type:
          "flat-energy",

        severity:
          durationSeconds >=
          1200
            ? "poor"
            : "warning",

        startIndex:
          start,

        endIndex:
          end,

        title:
          "Long flat energy section",

        detail:
          `${end - start + 1} tracks stay at nearly the same Energy for about ${Math.max(
            1,
            Math.round(
              durationSeconds /
                60,
            ),
          )} minutes.`,
      });

      start =
        end + 1;
    } else {
      start += 1;
    }
  }

  return issues.sort(
    (
      left,
      right,
    ) =>
      left.startIndex -
      right.startIndex,
  );
}

function buildPhaseSummaries(
  points:
    readonly SetJourneyPoint[],
  totalSeconds: number,
): SetJourneyPhaseSummary[] {
  const phaseDefinitions: Array<{
    name:
      SetJourneyPhaseName;
    start:
      number;
    end:
      number;
  }> = [
    {
      name:
        "Warm Up",
      start: 0,
      end: 0.25,
    },
    {
      name:
        "Build",
      start: 0.25,
      end: 0.55,
    },
    {
      name:
        "Peak",
      start: 0.55,
      end: 0.8,
    },
    {
      name:
        "Release",
      start: 0.8,
      end: 1,
    },
  ];

  return phaseDefinitions.map(
    (definition) => {
      const phasePoints =
        points.filter(
          (point) =>
            point.phase ===
            definition.name,
        );

      return {
        name:
          definition.name,

        startSeconds:
          totalSeconds *
          definition.start,

        endSeconds:
          totalSeconds *
          definition.end,

        trackCount:
          phasePoints.length,

        averageBpm:
          average(
            phasePoints.map(
              (point) =>
                point.bpm,
            ),
          ),

        averageEnergy:
          average(
            phasePoints.map(
              (point) =>
                point.energy,
            ),
          ),

        averagePopularity:
          average(
            phasePoints.map(
              (point) =>
                point.popularity,
            ),
          ),
      };
    },
  );
}

export function analyzeSetJourney(
  currentSet: CurrentSet,
  tracks: readonly Track[],
): SetJourneyAnalysis {
  const points =
    buildPoints(
      currentSet,
      tracks,
    );

  const totalSeconds =
    points.length > 0
      ? points[
          points.length - 1
        ].endSeconds
      : 0;

  const issues =
    buildIssues(
      points,
    );

  const poorCount =
    issues.filter(
      (issue) =>
        issue.severity ===
        "poor",
    ).length;

  const warningCount =
    issues.filter(
      (issue) =>
        issue.severity ===
        "warning",
    ).length;

  const healthScore =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            poorCount * 10 -
            warningCount * 4,
        ),
      ),
    );

  const energies =
    points
      .map(
        (point) =>
          point.energy,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  return {
    points,

    phases:
      buildPhaseSummaries(
        points,
        totalSeconds,
      ),

    issues,

    summary: {
      totalTracks:
        points.length,

      totalSeconds,

      averageBpm:
        average(
          points.map(
            (point) =>
              point.bpm,
          ),
        ),

      averageEnergy:
        average(
          points.map(
            (point) =>
              point.energy,
          ),
        ),

      averagePopularity:
        average(
          points.map(
            (point) =>
              point.popularity,
          ),
        ),

      startBpm:
        points[0]
          ?.bpm ??
        null,

      endBpm:
        points[
          points.length - 1
        ]?.bpm ??
        null,

      startEnergy:
        points[0]
          ?.energy ??
        null,

      peakEnergy:
        energies.length >
        0
          ? Math.max(
              ...energies,
            )
          : null,

      endEnergy:
        points[
          points.length - 1
        ]?.energy ??
        null,

      healthScore,
    },
  };
}
