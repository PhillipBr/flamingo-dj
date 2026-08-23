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
  buildVenueSpecificCoach,
} from "../utils/venueCoachEngine";

export function useVenueCoach(
  history:
    readonly LivePerformanceRecord[],
  profile:
    EventProfile | null,
) {
  return useMemo(
    () =>
      buildVenueSpecificCoach(
        history,
        profile,
      ),
    [
      history,
      profile,
    ],
  );
}
