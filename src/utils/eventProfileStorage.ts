import type {
  EventProfile,
  EventProfileState,
  EventProfileType,
} from "../types/eventProfile";

export const EVENT_PROFILE_STORAGE_KEY =
  "flamingo-dj-event-profiles";

const DEFAULT_PROFILE_ID =
  "global";

function defaultState(): EventProfileState {
  const now =
    new Date().toISOString();

  return {
    profiles: [
      {
        id:
          DEFAULT_PROFILE_ID,

        name:
          "Global / No Venue",

        type:
          "other",

        location:
          null,

        notes:
          "Default profile for sessions without a specific venue or event context.",

        createdAt:
          now,

        updatedAt:
          now,
      },
    ],

    activeProfileId:
      DEFAULT_PROFILE_ID,
  };
}

function isEventProfile(
  value: unknown,
): value is EventProfile {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(
      value,
    )
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
    typeof record.name ===
      "string" &&
    typeof record.type ===
      "string" &&
    typeof record.createdAt ===
      "string" &&
    typeof record.updatedAt ===
      "string"
  );
}

export function loadEventProfileState(): EventProfileState {
  try {
    const stored =
      localStorage.getItem(
        EVENT_PROFILE_STORAGE_KEY,
      );

    if (!stored) {
      return defaultState();
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (
      typeof parsed !==
        "object" ||
      parsed === null ||
      Array.isArray(
        parsed,
      )
    ) {
      return defaultState();
    }

    const record =
      parsed as Record<
        string,
        unknown
      >;

    const profiles =
      Array.isArray(
        record.profiles,
      )
        ? record.profiles.filter(
            isEventProfile,
          )
        : [];

    if (
      profiles.length ===
      0
    ) {
      return defaultState();
    }

    const activeProfileId =
      typeof record.activeProfileId ===
        "string" &&
      profiles.some(
        (profile) =>
          profile.id ===
          record.activeProfileId,
      )
        ? record.activeProfileId
        : profiles[0].id;

    return {
      profiles,
      activeProfileId,
    };
  } catch {
    return defaultState();
  }
}

export function saveEventProfileState(
  state:
    EventProfileState,
): void {
  try {
    localStorage.setItem(
      EVENT_PROFILE_STORAGE_KEY,
      JSON.stringify(
        state,
      ),
    );
  } catch (error) {
    console.error(
      "Unable to save Event Profiles.",
      error,
    );
  }
}

export function createEventProfile(
  name: string,
  type:
    EventProfileType,
  location = "",
  notes = "",
): EventProfile {
  const now =
    new Date().toISOString();

  return {
    id:
      `event-profile-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`,

    name:
      name.trim(),

    type,

    location:
      location.trim() ||
      null,

    notes:
      notes.trim() ||
      null,

    createdAt:
      now,

    updatedAt:
      now,
  };
}
