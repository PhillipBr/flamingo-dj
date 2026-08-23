import {
  useState,
} from "react";

import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

import {
  loadEventPlan,
} from "../utils/eventPlanStorage";

export function useStoredEventPlan(): SetlistEventPlan | null {
  const [
    eventPlan,
  ] =
    useState<SetlistEventPlan | null>(
      loadEventPlan,
    );

  return eventPlan;
}
