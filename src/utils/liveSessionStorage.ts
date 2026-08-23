import type {
  LiveSession,
} from "../types/liveSession";

export const LIVE_SESSION_STORAGE_KEY =
  "flamingo-dj-live-session";

export function createDefaultLiveSession(): LiveSession {
  return {
    currentIndex: 0,
    startedAt: null,
    pausedAt: null,
    accumulatedPausedMs: 0,
    isRunning: false,
    playedTrackIds: [],
  };
}

export function loadLiveSession(): LiveSession {
  try {
    const stored =
      localStorage.getItem(
        LIVE_SESSION_STORAGE_KEY,
      );

    if (!stored) {
      return createDefaultLiveSession();
    }

    const parsed =
      JSON.parse(stored) as
        Partial<LiveSession>;

    return {
      currentIndex:
        typeof parsed.currentIndex ===
          "number" &&
        Number.isFinite(
          parsed.currentIndex,
        )
          ? Math.max(
              0,
              Math.round(
                parsed.currentIndex,
              ),
            )
          : 0,

      startedAt:
        typeof parsed.startedAt ===
          "string"
          ? parsed.startedAt
          : null,

      pausedAt:
        typeof parsed.pausedAt ===
          "string"
          ? parsed.pausedAt
          : null,

      accumulatedPausedMs:
        typeof parsed.accumulatedPausedMs ===
          "number" &&
        Number.isFinite(
          parsed.accumulatedPausedMs,
        )
          ? Math.max(
              0,
              parsed.accumulatedPausedMs,
            )
          : 0,

      isRunning:
        typeof parsed.isRunning ===
          "boolean"
          ? parsed.isRunning
          : Boolean(
              parsed.startedAt,
            ),

      playedTrackIds:
        Array.isArray(
          parsed.playedTrackIds,
        )
          ? parsed.playedTrackIds.filter(
              (
                value,
              ): value is string =>
                typeof value ===
                "string",
            )
          : [],
    };
  } catch {
    return createDefaultLiveSession();
  }
}

export function saveLiveSession(
  session: LiveSession,
): void {
  try {
    localStorage.setItem(
      LIVE_SESSION_STORAGE_KEY,
      JSON.stringify(
        session,
      ),
    );
  } catch (error) {
    console.error(
      "Unable to save live session.",
      error,
    );
  }
}

export function resetLiveSession(): LiveSession {
  const session =
    createDefaultLiveSession();

  saveLiveSession(
    session,
  );

  return session;
}
