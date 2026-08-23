import type {
  LivePerformanceRecord,
} from "../types/livePerformance";

export function filterPerformanceHistoryByProfile(
  history:
    readonly LivePerformanceRecord[],
  profileId:
    string | null,
): LivePerformanceRecord[] {
  if (
    !profileId ||
    profileId ===
      "global"
  ) {
    return [
      ...history,
    ];
  }

  return history.filter(
    (record) =>
      record.eventProfileId ===
      profileId,
  );
}
