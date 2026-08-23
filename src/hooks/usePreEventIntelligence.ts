import {
  useMemo,
} from "react";

import type {
  EventProfile,
} from "../types/eventProfile";

import {
  loadLivePerformanceHistory,
} from "../utils/livePerformanceStorage";

import {
  buildPreEventIntelligence,
} from "../utils/preEventIntelligenceEngine";

export function usePreEventIntelligence(
  profile: EventProfile | null,
) {
  return useMemo(() => {
    const history =
      loadLivePerformanceHistory();

    return buildPreEventIntelligence(
      history,
      profile,
    );
  }, [profile]);
}
