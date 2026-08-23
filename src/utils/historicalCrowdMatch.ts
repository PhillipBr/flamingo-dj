import type {
  TrackPerformanceRecord,
} from "../types/trackPerformance";

export type HistoricalCrowdSignal = {
  crowdScore: number | null;
  crowdResponses: number;
  confidence: number;
  effectiveWeight: number;
};

export type HistoricalWeightedScore = {
  baseScore: number;
  adjustedScore: number;
  signal: HistoricalCrowdSignal;
};

export const HISTORICAL_CROWD_MAX_WEIGHT =
  0.1;

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

export function getHistoricalCrowdConfidence(
  crowdResponses: number,
): number {
  if (
    crowdResponses <=
    0
  ) {
    return 0;
  }

  return clamp(
    crowdResponses /
      5,
  );
}

export function getHistoricalCrowdSignal(
  performance:
    TrackPerformanceRecord | null,
  maximumWeight =
    HISTORICAL_CROWD_MAX_WEIGHT,
): HistoricalCrowdSignal {
  if (
    !performance ||
    performance.crowdResponses <=
      0
  ) {
    return {
      crowdScore:
        null,
      crowdResponses:
        0,
      confidence:
        0,
      effectiveWeight:
        0,
    };
  }

  const confidence =
    getHistoricalCrowdConfidence(
      performance.crowdResponses,
    );

  return {
    crowdScore:
      performance.crowdScore,
    crowdResponses:
      performance.crowdResponses,
    confidence,
    effectiveWeight:
      clamp(
        maximumWeight,
        0,
        0.25,
      ) *
      confidence,
  };
}

export function applyHistoricalCrowdScore(
  baseScore: number,
  performance:
    TrackPerformanceRecord | null,
  maximumWeight =
    HISTORICAL_CROWD_MAX_WEIGHT,
): HistoricalWeightedScore {
  const safeBaseScore =
    clamp(
      baseScore,
    );

  const signal =
    getHistoricalCrowdSignal(
      performance,
      maximumWeight,
    );

  if (
    signal.crowdScore ===
      null ||
    signal.effectiveWeight <=
      0
  ) {
    return {
      baseScore:
        safeBaseScore,
      adjustedScore:
        safeBaseScore,
      signal,
    };
  }

  const historicalScore =
    clamp(
      signal.crowdScore /
        100,
    );

  const adjustedScore =
    safeBaseScore *
      (
        1 -
        signal.effectiveWeight
      ) +
    historicalScore *
      signal.effectiveWeight;

  return {
    baseScore:
      safeBaseScore,
    adjustedScore:
      clamp(
        adjustedScore,
      ),
    signal,
  };
}

export function buildTrackPerformanceMap(
  performance:
    readonly TrackPerformanceRecord[],
): Map<
  string,
  TrackPerformanceRecord
> {
  return new Map(
    performance.map(
      (record) => [
        record.trackId,
        record,
      ],
    ),
  );
}
