import {
  useMemo,
} from "react";

import type {
  LivePerformanceRecord,
} from "../types/livePerformance";

import {
  buildDJCoachSummary,
} from "../utils/djCoachEngine";

import {
  buildTrackPerformance,
} from "../utils/trackPerformanceEngine";

export function useDJCoach(
  history:
    readonly LivePerformanceRecord[],
) {
  const trackPerformance =
    useMemo(
      () =>
        buildTrackPerformance(
          history,
        ),
      [history],
    );

  const coach =
    useMemo(
      () =>
        buildDJCoachSummary(
          history,
        ),
      [history],
    );

  return {
    trackPerformance,
    coach,
  };
}
