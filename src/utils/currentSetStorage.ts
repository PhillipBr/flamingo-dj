import type {
  CurrentSet,
  CurrentSetItem,
} from "../types/setlist";

export const CURRENT_SET_STORAGE_KEY =
  "flamingo-dj-current-set";

const DEFAULT_SET_NAME =
  "Current Set";

const DEFAULT_PLANNED_PLAY_SECONDS =
  60;

function createEmptyCurrentSet(): CurrentSet {
  const now =
    new Date().toISOString();

  return {
    id: "current-set",
    name: DEFAULT_SET_NAME,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isCurrentSetItem(
  value: unknown,
): value is CurrentSetItem {
  if (
    typeof value !== "object" ||
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
    typeof record.trackId ===
      "string" &&
    record.trackId.trim().length >
      0 &&
    typeof record.plannedPlaySeconds ===
      "number" &&
    Number.isFinite(
      record.plannedPlaySeconds,
    ) &&
    record.plannedPlaySeconds >
      0 &&
    typeof record.addedAt ===
      "string"
  );
}

export function loadCurrentSet(): CurrentSet {
  try {
    const storedValue =
      localStorage.getItem(
        CURRENT_SET_STORAGE_KEY,
      );

    if (!storedValue) {
      return createEmptyCurrentSet();
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (
      typeof parsedValue !==
        "object" ||
      parsedValue === null ||
      Array.isArray(
        parsedValue,
      )
    ) {
      return createEmptyCurrentSet();
    }

    const record =
      parsedValue as Record<
        string,
        unknown
      >;

    const rawItems =
      Array.isArray(record.items)
        ? record.items
        : [];

    const items =
      rawItems.filter(
        isCurrentSetItem,
      );

    const now =
      new Date().toISOString();

    return {
      id:
        typeof record.id ===
          "string"
          ? record.id
          : "current-set",

      name:
        typeof record.name ===
          "string" &&
        record.name.trim()
          ? record.name.trim()
          : DEFAULT_SET_NAME,

      items,

      createdAt:
        typeof record.createdAt ===
          "string"
          ? record.createdAt
          : now,

      updatedAt:
        typeof record.updatedAt ===
          "string"
          ? record.updatedAt
          : now,
    };
  } catch {
    return createEmptyCurrentSet();
  }
}

export function saveCurrentSet(
  currentSet: CurrentSet,
): void {
  try {
    localStorage.setItem(
      CURRENT_SET_STORAGE_KEY,
      JSON.stringify({
        ...currentSet,
        updatedAt:
          new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      "Unable to save current set.",
      error,
    );
  }
}

export function createCurrentSetItem(
  trackId: string,
  plannedPlaySeconds =
    DEFAULT_PLANNED_PLAY_SECONDS,
): CurrentSetItem {
  return {
    trackId,
    plannedPlaySeconds:
      Math.max(
        10,
        Math.round(
          plannedPlaySeconds,
        ),
      ),
    addedAt:
      new Date().toISOString(),
  };
}

export function calculateCurrentSetSeconds(
  currentSet: CurrentSet,
): number {
  return currentSet.items.reduce(
    (total, item) =>
      total +
      item.plannedPlaySeconds,
    0,
  );
}

export function formatSetDuration(
  totalSeconds: number,
): string {
  const safeSeconds =
    Math.max(
      0,
      Math.round(totalSeconds),
    );

  const hours =
    Math.floor(
      safeSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (safeSeconds % 3600) /
        60,
    );

  const seconds =
    safeSeconds % 60;

  if (hours > 0) {
    return [
      `${hours}h`,
      `${minutes
        .toString()
        .padStart(2, "0")}m`,
      `${seconds
        .toString()
        .padStart(2, "0")}s`,
    ].join(" ");
  }

  return [
    `${minutes}m`,
    `${seconds
      .toString()
      .padStart(2, "0")}s`,
  ].join(" ");
}
