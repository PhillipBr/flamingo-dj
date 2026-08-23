const camelotMap: Record<string, string> = {
  "G#m": "1A",
  Abm: "1A",
  B: "1B",

  "D#m": "2A",
  Ebm: "2A",
  "F#": "2B",
  Gb: "2B",

  "A#m": "3A",
  Bbm: "3A",
  Db: "3B",
  "C#": "3B",

  Fm: "4A",
  Ab: "4B",
  "G#": "4B",

  Cm: "5A",
  Eb: "5B",
  "D#": "5B",

  Gm: "6A",
  Bb: "6B",
  "A#": "6B",

  Dm: "7A",
  F: "7B",

  Am: "8A",
  C: "8B",

  Em: "9A",
  G: "9B",

  Bm: "10A",
  D: "10B",

  "F#m": "11A",
  Gbm: "11A",
  A: "11B",

  "C#m": "12A",
  Dbm: "12A",
  E: "12B",
};

function normalizeMusicalKey(musicalKey: string): string {
  return musicalKey
    .trim()
    .replace(/\s+/g, "")
    .replace(/minor$/i, "m")
    .replace(/major$/i, "");
}

export function getCamelotKey(
  musicalKey: string | null,
): string {
  if (!musicalKey) {
    return "—";
  }

  const normalizedKey = normalizeMusicalKey(musicalKey);

  return camelotMap[normalizedKey] ?? "—";
}