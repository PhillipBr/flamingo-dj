import {
  FLAMINGO_RECOVERY_CHECKPOINT_KEY,
} from "./storageSchema";

const RECOVERY_KEYS = [
  "flamingo-dj-event-profiles",
  "flamingo-dj-live-performance-history",
  "flamingo-dj-audience-response",
  "flamingo-dj-current-set",
  "flamingo-dj-event-plan",
  "flamingo-dj-live-session",
  "flamingo-dj-pre-event-generator-preset",
] as const;

export type FlamingoRecoveryCheckpoint = {
  createdAt: string;
  reason: string;
  values: Record<
    string,
    string | null
  >;
};

export function createRecoveryCheckpoint(
  reason:
    string,
): FlamingoRecoveryCheckpoint {
  const values:
    Record<
      string,
      string | null
    > = {};

  RECOVERY_KEYS.forEach(
    (key) => {
      values[key] =
        localStorage.getItem(key);
    },
  );

  const checkpoint:
    FlamingoRecoveryCheckpoint =
    {
      createdAt:
        new Date().toISOString(),

      reason,

      values,
    };

  localStorage.setItem(
    FLAMINGO_RECOVERY_CHECKPOINT_KEY,
    JSON.stringify(
      checkpoint,
    ),
  );

  return checkpoint;
}

export function loadRecoveryCheckpoint(): FlamingoRecoveryCheckpoint | null {
  try {
    const raw =
      localStorage.getItem(
        FLAMINGO_RECOVERY_CHECKPOINT_KEY,
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(
      raw,
    ) as FlamingoRecoveryCheckpoint;
  } catch {
    return null;
  }
}

export function restoreRecoveryCheckpoint(): boolean {
  const checkpoint =
    loadRecoveryCheckpoint();

  if (!checkpoint) {
    return false;
  }

  Object.entries(
    checkpoint.values,
  ).forEach(
    ([
      key,
      value,
    ]) => {
      if (
        value ===
        null
      ) {
        localStorage.removeItem(
          key,
        );
      } else {
        localStorage.setItem(
          key,
          value,
        );
      }
    },
  );

  return true;
}

export function clearRecoveryCheckpoint(): void {
  localStorage.removeItem(
    FLAMINGO_RECOVERY_CHECKPOINT_KEY,
  );
}
