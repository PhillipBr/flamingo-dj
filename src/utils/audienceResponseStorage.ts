import type {
  AudienceResponseEntry,
  AudienceResponseLevel,
} from "../types/audienceResponse";

export const AUDIENCE_RESPONSE_STORAGE_KEY =
  "flamingo-dj-audience-response";

export function loadAudienceResponses(): AudienceResponseEntry[] {
  try {
    const stored = localStorage.getItem(
      AUDIENCE_RESPONSE_STORAGE_KEY,
    );

    if (!stored) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (value): value is AudienceResponseEntry => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return false;
        }

        const record = value as Record<string, unknown>;

        return (
          typeof record.id === "string" &&
          typeof record.level === "string" &&
          ["great", "good", "neutral", "losing-crowd"].includes(
            record.level,
          ) &&
          (typeof record.trackId === "string" ||
            record.trackId === null) &&
          typeof record.createdAt === "string"
        );
      },
    );
  } catch {
    return [];
  }
}

export function saveAudienceResponses(
  entries: readonly AudienceResponseEntry[],
): void {
  try {
    localStorage.setItem(
      AUDIENCE_RESPONSE_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch (error) {
    console.error(
      "Unable to save audience responses.",
      error,
    );
  }
}

export function createAudienceResponseEntry(
  level: AudienceResponseLevel,
  trackId: string | null,
): AudienceResponseEntry {
  return {
    id: `audience-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
    level,
    trackId,
    createdAt: new Date().toISOString(),
  };
}
