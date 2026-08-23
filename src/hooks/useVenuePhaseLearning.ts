import {
  useMemo,
} from "react";

import type {
  EventProfile,
} from "../types/eventProfile";

import type {
  LivePerformanceRecord,
} from "../types/livePerformance";

import {
  buildVenuePhaseLearning,
} from "../utils/venuePhaseLearningEngine";

export function useVenuePhaseLearning(
  history:
    readonly LivePerformanceRecord[],
  profile:
    EventProfile | null,
) {
  return useMemo(
    () =>
      buildVenuePhaseLearning(
        history,
        profile,
      ),
    [
      history,
      profile,
    ],
  );
}
