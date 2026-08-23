import type {
  PreEventGeneratorPreset,
} from "../types/preEventGeneratorPreset";

export const PRE_EVENT_GENERATOR_PRESET_KEY =
  "flamingo-dj-pre-event-generator-preset";

export function loadPreEventGeneratorPreset(): PreEventGeneratorPreset | null {
  try {
    const stored =
      localStorage.getItem(
        PRE_EVENT_GENERATOR_PRESET_KEY,
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
      typeof record.id !==
        "string" ||
      typeof record.profileName !==
        "string" ||
      typeof record.minimumBpm !==
        "number" ||
      typeof record.maximumBpm !==
        "number" ||
      typeof record.journeyTemplateId !==
        "string"
    ) {
      return null;
    }

    return parsed as PreEventGeneratorPreset;
  } catch {
    return null;
  }
}

export function savePreEventGeneratorPreset(
  preset:
    PreEventGeneratorPreset,
): void {
  try {
    localStorage.setItem(
      PRE_EVENT_GENERATOR_PRESET_KEY,
      JSON.stringify(
        preset,
      ),
    );
  } catch (error) {
    console.error(
      "Unable to save Pre-Event Generator preset.",
      error,
    );
  }
}

export function clearPreEventGeneratorPreset(): void {
  try {
    localStorage.removeItem(
      PRE_EVENT_GENERATOR_PRESET_KEY,
    );
  } catch (error) {
    console.error(
      "Unable to clear Pre-Event Generator preset.",
      error,
    );
  }
}
