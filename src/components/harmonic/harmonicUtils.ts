export const KEY_TO_CAMELOT: Record<string, string> = {
  "G#m": "1A",
  "Abm": "1A",
  B: "1B",

  "D#m": "2A",
  "Ebm": "2A",
  "F#": "2B",
  Gb: "2B",

  "A#m": "3A",
  "Bbm": "3A",
  "C#": "3B",
  Db: "3B",

  Fm: "4A",
  "G#": "4B",
  Ab: "4B",

  Cm: "5A",
  "D#": "5B",
  Eb: "5B",

  Gm: "6A",
  "A#": "6B",
  Bb: "6B",

  Dm: "7A",
  F: "7B",

  Am: "8A",
  C: "8B",

  Em: "9A",
  G: "9B",

  Bm: "10A",
  D: "10B",

  "F#m": "11A",
  "Gbm": "11A",
  A: "11B",

  "C#m": "12A",
  "Dbm": "12A",
  E: "12B",
};

export const CAMELOT_TO_KEY: Record<string, string> = {
  "1A": "G#m",
  "1B": "B",
  "2A": "D#m",
  "2B": "F#",
  "3A": "A#m",
  "3B": "C#",
  "4A": "Fm",
  "4B": "G#",
  "5A": "Cm",
  "5B": "D#",
  "6A": "Gm",
  "6B": "A#",
  "7A": "Dm",
  "7B": "F",
  "8A": "Am",
  "8B": "C",
  "9A": "Em",
  "9B": "G",
  "10A": "Bm",
  "10B": "D",
  "11A": "F#m",
  "11B": "A",
  "12A": "C#m",
  "12B": "E",
};

export const DISPLAY_KEYS = [
  "C",
  "Cm",
  "C#",
  "C#m",
  "D",
  "Dm",
  "D#",
  "D#m",
  "E",
  "Em",
  "F",
  "Fm",
  "F#",
  "F#m",
  "G",
  "Gm",
  "G#",
  "G#m",
  "A",
  "Am",
  "A#",
  "A#m",
  "B",
  "Bm",
] as const;

export function normalizeHarmonicKey(
  value: string | null | undefined,
): string | null {
  const key = String(value ?? "")
    .trim()
    .replace("♭", "b")
    .replace("♯", "#");

  if (!key) {
    return null;
  }

  const enharmonic: Record<string, string> = {
    Bb: "A#",
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bbm: "A#m",
    Dbm: "C#m",
    Ebm: "D#m",
    Gbm: "F#m",
    Abm: "G#m",
  };

  return enharmonic[key] ?? key;
}

export function keyToCamelot(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeHarmonicKey(value);

  if (!normalized) {
    return null;
  }

  return KEY_TO_CAMELOT[normalized] ?? null;
}

export function camelotCompatible(
  camelot: string | null | undefined,
): string[] {
  const match = String(camelot ?? "").match(
    /^(\d{1,2})([AB])$/,
  );

  if (!match) {
    return [];
  }

  const number = Number(match[1]);
  const mode = match[2] as "A" | "B";

  const previous =
    number === 1 ? 12 : number - 1;

  const next =
    number === 12 ? 1 : number + 1;

  const relative =
    mode === "A" ? "B" : "A";

  return [
    `${number}${mode}`,
    `${previous}${mode}`,
    `${next}${mode}`,
    `${number}${relative}`,
  ];
}

export function compatibleKeyLabels(
  camelot: string | null | undefined,
): Array<{
  camelot: string;
  key: string;
}> {
  return camelotCompatible(camelot).map(
    (value) => ({
      camelot: value,
      key: CAMELOT_TO_KEY[value] ?? value,
    }),
  );
}
