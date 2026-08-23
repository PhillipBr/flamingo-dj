import type {
  LivePerformanceRecord,
} from "../types/livePerformance";

export const LIVE_PERFORMANCE_HISTORY_KEY =
  "flamingo-dj-live-performance-history";

export function loadLivePerformanceHistory(): LivePerformanceRecord[] {
  try {
    const stored =
      localStorage.getItem(
        LIVE_PERFORMANCE_HISTORY_KEY,
      );

    if (!stored) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (
        value,
      ): value is LivePerformanceRecord => {
        if (
          typeof value !==
            "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return false;
        }

        const record =
          value as Record<
            string,
            unknown
          >;

        return (
          typeof record.id ===
            "string" &&
          typeof record.startedAt ===
            "string" &&
          typeof record.endedAt ===
            "string" &&
          Array.isArray(
            record.tracks,
          )
        );
      },
    );
  } catch {
    return [];
  }
}

export function saveLivePerformanceHistory(
  history:
    readonly LivePerformanceRecord[],
): void {
  try {
    localStorage.setItem(
      LIVE_PERFORMANCE_HISTORY_KEY,
      JSON.stringify(
        history,
      ),
    );
  } catch (error) {
    console.error(
      "Unable to save live performance history.",
      error,
    );
  }
}
