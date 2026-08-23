import type {
  SetlistEnergyCurve,
  SetlistJourneyTemplateId,
  SetlistStyleBlock,
} from "../types/setlistGenerator";

export type JourneyTemplateDefinition = {
  id: SetlistJourneyTemplateId;
  name: string;
  description: string;

  energyCurve: SetlistEnergyCurve;

  phases: Array<{
    name:
      | "Warm Up"
      | "Build"
      | "Peak"
      | "Release";

    share: number;

    bpmStartRatio: number;
    bpmEndRatio: number;
  }>;
};

export const JOURNEY_TEMPLATES:
  JourneyTemplateDefinition[] = [
    {
      id: "warmup-peak-release",
      name:
        "Warm Up → Peak → Release",
      description:
        "Classic event arc: controlled opening, steady build, clear peak, then a moderate release.",

      energyCurve:
        "warmup-peak-closing",

      phases: [
        {
          name: "Warm Up",
          share: 0.25,
          bpmStartRatio: 0,
          bpmEndRatio: 0.35,
        },
        {
          name: "Build",
          share: 0.3,
          bpmStartRatio: 0.25,
          bpmEndRatio: 0.65,
        },
        {
          name: "Peak",
          share: 0.25,
          bpmStartRatio: 0.55,
          bpmEndRatio: 1,
        },
        {
          name: "Release",
          share: 0.2,
          bpmStartRatio: 0.45,
          bpmEndRatio: 0.82,
        },
      ],
    },

    {
      id: "progressive-build",
      name:
        "Progressive Build",
      description:
        "Keeps moving upward through the event with very little rollback in BPM and Energy.",

      energyCurve:
        "progressive",

      phases: [
        {
          name: "Warm Up",
          share: 0.2,
          bpmStartRatio: 0,
          bpmEndRatio: 0.25,
        },
        {
          name: "Build",
          share: 0.35,
          bpmStartRatio: 0.2,
          bpmEndRatio: 0.58,
        },
        {
          name: "Peak",
          share: 0.3,
          bpmStartRatio: 0.5,
          bpmEndRatio: 0.86,
        },
        {
          name: "Release",
          share: 0.15,
          bpmStartRatio: 0.78,
          bpmEndRatio: 1,
        },
      ],
    },

    {
      id: "long-warmup",
      name:
        "Long Warm Up",
      description:
        "More opening time before the main build. Useful for bars and longer events where the room fills gradually.",

      energyCurve:
        "warmup-peak-closing",

      phases: [
        {
          name: "Warm Up",
          share: 0.4,
          bpmStartRatio: 0,
          bpmEndRatio: 0.32,
        },
        {
          name: "Build",
          share: 0.27,
          bpmStartRatio: 0.25,
          bpmEndRatio: 0.62,
        },
        {
          name: "Peak",
          share: 0.23,
          bpmStartRatio: 0.55,
          bpmEndRatio: 1,
        },
        {
          name: "Release",
          share: 0.1,
          bpmStartRatio: 0.55,
          bpmEndRatio: 0.82,
        },
      ],
    },

    {
      id: "peak-heavy",
      name:
        "Peak Heavy",
      description:
        "Gets to the main section faster and keeps more event time around the strongest Energy/BPM zone.",

      energyCurve:
        "warmup-peak-closing",

      phases: [
        {
          name: "Warm Up",
          share: 0.15,
          bpmStartRatio: 0,
          bpmEndRatio: 0.3,
        },
        {
          name: "Build",
          share: 0.25,
          bpmStartRatio: 0.22,
          bpmEndRatio: 0.65,
        },
        {
          name: "Peak",
          share: 0.45,
          bpmStartRatio: 0.58,
          bpmEndRatio: 1,
        },
        {
          name: "Release",
          share: 0.15,
          bpmStartRatio: 0.52,
          bpmEndRatio: 0.8,
        },
      ],
    },

    {
      id: "smooth-wave",
      name:
        "Smooth Wave",
      description:
        "Gentler movement with a broad middle section. Designed to avoid aggressive jumps and keep the event flexible.",

      energyCurve:
        "smooth",

      phases: [
        {
          name: "Warm Up",
          share: 0.25,
          bpmStartRatio: 0.05,
          bpmEndRatio: 0.35,
        },
        {
          name: "Build",
          share: 0.3,
          bpmStartRatio: 0.25,
          bpmEndRatio: 0.58,
        },
        {
          name: "Peak",
          share: 0.25,
          bpmStartRatio: 0.48,
          bpmEndRatio: 0.78,
        },
        {
          name: "Release",
          share: 0.2,
          bpmStartRatio: 0.35,
          bpmEndRatio: 0.64,
        },
      ],
    },
  ];

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

function bpmAtRatio(
  minimumBpm: number,
  maximumBpm: number,
  ratio: number,
): number {
  const safeMinimum =
    Math.min(
      minimumBpm,
      maximumBpm,
    );

  const safeMaximum =
    Math.max(
      minimumBpm,
      maximumBpm,
    );

  return Math.round(
    safeMinimum +
      (
        safeMaximum -
        safeMinimum
      ) *
        clamp(
          ratio,
          0,
          1,
        ),
  );
}

export function getJourneyTemplate(
  templateId:
    SetlistJourneyTemplateId,
): JourneyTemplateDefinition {
  return (
    JOURNEY_TEMPLATES.find(
      (template) =>
        template.id ===
        templateId,
    ) ??
    JOURNEY_TEMPLATES[0]
  );
}

export function buildJourneyStyleBlocks(
  templateId:
    SetlistJourneyTemplateId,

  eventDurationMinutes: number,

  minimumBpm: number,
  maximumBpm: number,

  defaultGenre = "all",
): SetlistStyleBlock[] {
  const template =
    getJourneyTemplate(
      templateId,
    );

  const safeDuration =
    Math.max(
      4,
      Math.round(
        eventDurationMinutes,
      ),
    );

  let allocatedMinutes =
    0;

  return template.phases.map(
    (
      phase,
      index,
    ) => {
      const isLast =
        index ===
        template.phases.length -
          1;

      const durationMinutes =
        isLast
          ? Math.max(
              1,
              safeDuration -
                allocatedMinutes,
            )
          : Math.max(
              1,
              Math.round(
                safeDuration *
                  phase.share,
              ),
            );

      allocatedMinutes +=
        durationMinutes;

      const blockMinimumBpm =
        bpmAtRatio(
          minimumBpm,
          maximumBpm,
          phase.bpmStartRatio,
        );

      const blockMaximumBpm =
        bpmAtRatio(
          minimumBpm,
          maximumBpm,
          phase.bpmEndRatio,
        );

      return {
        id:
          `journey-${templateId}-${index}-${Date.now()}`,

        phaseName:
          phase.name,

        genre:
          defaultGenre,

        genres:
          defaultGenre &&
          defaultGenre !== "all"
            ? [defaultGenre]
            : [],

        durationMinutes,

        minimumBpm:
          Math.min(
            blockMinimumBpm,
            blockMaximumBpm,
          ),

        maximumBpm:
          Math.max(
            blockMinimumBpm,
            blockMaximumBpm,
          ),
      };
    },
  );
}
