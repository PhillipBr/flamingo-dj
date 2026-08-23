export type KeywordGroup = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
};

export const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    id: "dj-function",
    label: "DJ Function",
    description: "How the track or playlist works in a set.",
    keywords: [
      "opener",
      "warmup",
      "build up",
      "peak time",
      "transition",
      "reset",
      "closer",
      "afterhours",
    ],
  },
  {
    id: "mood",
    label: "Mood",
    description: "Human feeling or atmosphere.",
    keywords: [
      "chill",
      "euphoric",
      "dreamy",
      "happy",
      "dark",
      "sexy",
      "emotional",
      "romantic",
      "mysterious",
      "summer",
      "party",
    ],
  },
  {
    id: "crowd",
    label: "Crowd",
    description: "Crowd reaction or social context.",
    keywords: [
      "crowd pleaser",
      "singalong",
      "dancefloor",
      "commercial",
      "underground",
      "familiar",
      "festival",
      "beach",
      "rooftop",
    ],
  },
  {
    id: "source",
    label: "Source / Discovery",
    description: "Where the music was found or curated.",
    keywords: [
      "billboard",
      "spotify viral",
      "beatport",
      "trending",
      "new find",
      "shazam",
      "youtube trends",
    ],
  },
  {
    id: "personal",
    label: "Personal",
    description: "Your DJ workflow.",
    keywords: [
      "favorite",
      "must play",
      "test",
      "practice",
      "played",
      "download",
    ],
  },
];

export function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

export function dedupeKeywords(values: string[]): string[] {
  const result = new Map<string, string>();

  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      result.set(
        normalizeKeyword(value),
        value,
      );
    });

  return Array.from(result.values());
}
