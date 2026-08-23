import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

export const EVENT_PLAN_STORAGE_KEY =
  "flamingo-dj-event-plan";

export function loadEventPlan(): SetlistEventPlan | null {
  try {
    const stored =
      localStorage.getItem(
        EVENT_PLAN_STORAGE_KEY,
      );

    if (!stored) {
      return null;
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (
      typeof parsed !==
        "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const record =
      parsed as Record<
        string,
        unknown
      >;

    if (
      !Array.isArray(
        record.phases,
      )
    ) {
      return null;
    }

    return parsed as SetlistEventPlan;
  } catch {
    return null;
  }
}

export function saveEventPlan(
  plan: SetlistEventPlan | null,
): void {
  try {
    if (!plan) {
      localStorage.removeItem(
        EVENT_PLAN_STORAGE_KEY,
      );

      return;
    }

    localStorage.setItem(
      EVENT_PLAN_STORAGE_KEY,
      JSON.stringify(plan),
    );
  } catch (error) {
    console.error(
      "Unable to save event plan.",
      error,
    );
  }
}
