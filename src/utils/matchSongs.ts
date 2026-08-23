import genreAliasesJson from "../data/genres/genreAliases.json";
import genreCrossStyleJson from "../data/genres/genreCrossStyle.json";
import genreIndexJson from "../data/genres/genreIndex.json";
import genreMetadataJson from "../data/genres/genreMetadata.json";
import genreSameStyleJson from "../data/genres/genreSameStyle.json";

/**
 * matchSongs.ts
 *
 * Motor de recomendaciones para Flamingo DJ App.
 *
 * Combina:
 * - compatibilidad de género;
 * - BPM;
 * - energía;
 * - compatibilidad armónica Camelot;
 * - popularidad de Spotify;
 * - keywords compartidos.
 *
 * No depende de un tipo Track específico del proyecto. Cualquier objeto que
 * tenga campos equivalentes puede utilizarse mediante TrackLike.
 */

// =============================================================================
// TYPES
// =============================================================================

export type MatchMode = "same-style" | "cross-style";

export type CamelotMode =
  | "same"
  | "adjacent"
  | "relative"
  | "energy-boost"
  | "energy-drop"
  | "none"
  | "unknown";

export interface TrackLike {
  id?: string | number;
  songId?: string | number;
  SongID?: string | number;

  title?: string | null;
  Title?: string | null;

  artist?: string | null;
  Artist?: string | null;

  genre?: string | string[] | null;
  genres?: string[] | null;
  Genre?: string | string[] | null;

  tempo?: number | string | null;
  bpm?: number | string | null;
  BPM?: number | string | null;

  energy?: number | string | null;
  Energy?: number | string | null;

  musicalKey?: string | null;
  musical_key?: string | null;
  key?: string | null;
  Key?: string | null;

  camelot?: string | null;
  Camelot?: string | null;

  popularity?: number | string | null;
  SpotifyPopularity?: number | string | null;

  keywords?: string | string[] | null;
  Keywords?: string | string[] | null;

  [key: string]: unknown;
}

export interface MatchWeights {
  genre: number;
  bpm: number;
  energy: number;
  camelot: number;
  popularity: number;
  keywords: number;
}

export interface MatchOptions {
  mode?: MatchMode;
  limit?: number;

  weights?: Partial<MatchWeights>;

  maxBpmDifference?: number;
  maxEnergyDifference?: number;

  minimumScore?: number;
  minimumGenreScore?: number;

  includeSameTrack?: boolean;
  requireGenreMatch?: boolean;

  allowDoubleHalfBpm?: boolean;
  popularityPreference?: "similar" | "higher" | "ignore";
}

export interface ScoreBreakdown {
  genre: number;
  bpm: number;
  energy: number;
  camelot: number;
  popularity: number;
  keywords: number;
}

export interface WeightedBreakdown extends ScoreBreakdown {
  totalWeight: number;
}

export interface MatchExplanation {
  sourceGenres: string[];
  candidateGenres: string[];
  matchedGenrePair: [string, string] | null;

  bpmDifference: number | null;
  normalizedBpmDifference: number | null;

  energyDifference: number | null;

  sourceCamelot: string | null;
  candidateCamelot: string | null;
  camelotMode: CamelotMode;

  sharedKeywords: string[];
}

export interface SongMatch<T extends TrackLike = TrackLike> {
  track: T;
  score: number;
  percentage: number;
  mode: MatchMode;

  breakdown: ScoreBreakdown;
  weightedBreakdown: WeightedBreakdown;
  explanation: MatchExplanation;
}

type GenreScores = Record<string, Record<string, number>>;

interface GenreMetadata {
  id?: string;
  label?: string;
  trackCount?: number;
  primaryFamily?: string | null;
  secondaryFamilies?: string[];
  parent?: string | null;
  confidence?: string;
  weight?: number;
}

interface GenreIndexEntry {
  id?: string;
  label?: string;
  family?: string | null;
  secondary?: string[];
  aliases?: string[];
}

// =============================================================================
// JSON DATA
// =============================================================================

const GENRE_ALIASES = genreAliasesJson as Record<string, string>;
const GENRE_SAME_STYLE = genreSameStyleJson as GenreScores;
const GENRE_CROSS_STYLE = genreCrossStyleJson as GenreScores;
const GENRE_METADATA = genreMetadataJson as Record<string, GenreMetadata>;
const GENRE_INDEX = genreIndexJson as Record<string, GenreIndexEntry>;

const AVAILABLE_GENRES = new Set<string>([
  ...Object.keys(GENRE_INDEX),
  ...Object.keys(GENRE_METADATA),
  ...Object.keys(GENRE_SAME_STYLE),
  ...Object.keys(GENRE_CROSS_STYLE),
]);

// =============================================================================
// DEFAULTS
// =============================================================================

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  genre: 0.38,
  bpm: 0.22,
  energy: 0.16,
  camelot: 0.16,
  popularity: 0.04,
  keywords: 0.04,
};

export const DEFAULT_MATCH_OPTIONS: Required<
  Omit<MatchOptions, "weights">
> & {
  weights: MatchWeights;
} = {
  mode: "same-style",
  limit: 25,

  weights: DEFAULT_MATCH_WEIGHTS,

  maxBpmDifference: 18,
  maxEnergyDifference: 40,

  minimumScore: 0.35,
  minimumGenreScore: 0.30,

  includeSameTrack: false,
  requireGenreMatch: false,

  allowDoubleHalfBpm: true,
  popularityPreference: "similar",
};

// =============================================================================
// NORMALIZATION
// =============================================================================

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeGenre(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = normalizeSpaces(
    String(value)
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/[–—]/g, "-"),
  ).replace(/^[\s,;|/[\]{}()"'`]+|[\s,;|/[\]{}()"'`]+$/g, "");

  return GENRE_ALIASES[normalized] ?? normalized;
}

function normalizeKeyword(value: unknown): string {
  return normalizeSpaces(String(value ?? "").toLowerCase())
    .replace(/^[,;|]+|[,;|]+$/g, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// =============================================================================
// TRACK FIELD READERS
// =============================================================================

export function getTrackId(track: TrackLike): string {
  const value = track.id ?? track.songId ?? track.SongID;

  if (value !== null && value !== undefined && String(value).trim()) {
    return String(value);
  }

  return [
    String(track.title ?? track.Title ?? ""),
    String(track.artist ?? track.Artist ?? ""),
  ]
    .map((item) => item.trim().toLowerCase())
    .join("::");
}

export function getTrackTitle(track: TrackLike): string {
  return String(track.title ?? track.Title ?? "").trim();
}

export function getTrackArtist(track: TrackLike): string {
  return String(track.artist ?? track.Artist ?? "").trim();
}

function splitGenreText(value: string): string[] {
  return value
    .split(/\s*[;,|]\s*/g)
    .map(normalizeGenre)
    .filter(Boolean);
}

export function getTrackGenres(track: TrackLike): string[] {
  const raw = track.genres ?? track.genre ?? track.Genre;
  const result: string[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      result.push(...splitGenreText(String(item)));
    }
  } else if (typeof raw === "string") {
    result.push(...splitGenreText(raw));
  }

  return unique(result);
}

export function resolveKnownGenres(track: TrackLike): string[] {
  return getTrackGenres(track)
    .map((genre) => GENRE_ALIASES[genre] ?? genre)
    .filter((genre) => AVAILABLE_GENRES.has(genre));
}

export function getTrackBpm(track: TrackLike): number | null {
  const value = toFiniteNumber(track.tempo ?? track.bpm ?? track.BPM);

  if (value === null || value <= 0) {
    return null;
  }

  return value;
}

export function getTrackEnergy(track: TrackLike): number | null {
  const value = toFiniteNumber(track.energy ?? track.Energy);

  if (value === null) {
    return null;
  }

  // Spotify/audio-features suele usar 0–1. DJ.db puede usar 0–100.
  if (value >= 0 && value <= 1) {
    return value * 100;
  }

  return clamp(value, 0, 100);
}

export function getTrackPopularity(track: TrackLike): number | null {
  const value = toFiniteNumber(
    track.popularity ?? track.SpotifyPopularity,
  );

  if (value === null) {
    return null;
  }

  return clamp(value, 0, 100);
}

export function getTrackKeywords(track: TrackLike): string[] {
  const raw = track.keywords ?? track.Keywords;

  if (Array.isArray(raw)) {
    return unique(raw.map(normalizeKeyword).filter(Boolean));
  }

  if (typeof raw === "string") {
    return unique(
      raw
        .split(/\s*[,;|]\s*/g)
        .map(normalizeKeyword)
        .filter(Boolean),
    );
  }

  return [];
}

// =============================================================================
// CAMELOT
// =============================================================================

const CAMELOT_PATTERN = /^(1[0-2]|[1-9])([AB])$/i;

const KEY_TO_CAMELOT: Record<string, string> = {
  // Minor keys
  "a minor": "8A",
  am: "8A",
  "e minor": "9A",
  em: "9A",
  "b minor": "10A",
  bm: "10A",
  "f# minor": "11A",
  "f♯ minor": "11A",
  "gb minor": "11A",
  "f#m": "11A",
  "gbm": "11A",
  "c# minor": "12A",
  "c♯ minor": "12A",
  "db minor": "12A",
  "c#m": "12A",
  "dbm": "12A",
  "g# minor": "1A",
  "g♯ minor": "1A",
  "ab minor": "1A",
  "g#m": "1A",
  "abm": "1A",
  "d# minor": "2A",
  "d♯ minor": "2A",
  "eb minor": "2A",
  "d#m": "2A",
  "ebm": "2A",
  "a# minor": "3A",
  "a♯ minor": "3A",
  "bb minor": "3A",
  "a#m": "3A",
  "bbm": "3A",
  "f minor": "4A",
  fm: "4A",
  "c minor": "5A",
  cm: "5A",
  "g minor": "6A",
  gm: "6A",
  "d minor": "7A",
  dm: "7A",

  // Major keys
  "c major": "8B",
  c: "8B",
  "g major": "9B",
  g: "9B",
  "d major": "10B",
  d: "10B",
  "a major": "11B",
  a: "11B",
  "e major": "12B",
  e: "12B",
  "b major": "1B",
  b: "1B",
  "f# major": "2B",
  "f♯ major": "2B",
  "gb major": "2B",
  "f#": "2B",
  gb: "2B",
  "c# major": "3B",
  "c♯ major": "3B",
  "db major": "3B",
  "c#": "3B",
  db: "3B",
  "g# major": "4B",
  "g♯ major": "4B",
  "ab major": "4B",
  "g#": "4B",
  ab: "4B",
  "d# major": "5B",
  "d♯ major": "5B",
  "eb major": "5B",
  "d#": "5B",
  eb: "5B",
  "a# major": "6B",
  "a♯ major": "6B",
  "bb major": "6B",
  "a#": "6B",
  bb: "6B",
  "f major": "7B",
  f: "7B",
};

function normalizeMusicalKey(value: unknown): string {
  return normalizeSpaces(
    String(value ?? "")
      .toLowerCase()
      .replace(/min\b/g, "minor")
      .replace(/maj\b/g, "major"),
  );
}

export function normalizeCamelot(value: unknown): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  const match = text.match(CAMELOT_PATTERN);

  if (!match) {
    return null;
  }

  return `${Number(match[1])}${match[2].toUpperCase()}`;
}

export function getTrackCamelot(track: TrackLike): string | null {
  const explicit = normalizeCamelot(track.camelot ?? track.Camelot);

  if (explicit) {
    return explicit;
  }

  const musicalKey =
    track.musicalKey ??
    track.musical_key ??
    track.key ??
    track.Key;

  const normalizedKey = normalizeMusicalKey(musicalKey);

  if (!normalizedKey) {
    return null;
  }

  return KEY_TO_CAMELOT[normalizedKey] ?? null;
}

function parseCamelot(
  camelot: string | null,
): { number: number; letter: "A" | "B" } | null {
  if (!camelot) {
    return null;
  }

  const match = camelot.match(CAMELOT_PATTERN);

  if (!match) {
    return null;
  }

  return {
    number: Number(match[1]),
    letter: match[2].toUpperCase() as "A" | "B",
  };
}

function circularCamelotDistance(left: number, right: number): number {
  const direct = Math.abs(left - right);
  return Math.min(direct, 12 - direct);
}

export function scoreCamelotCompatibility(
  sourceCamelot: string | null,
  candidateCamelot: string | null,
): { score: number; mode: CamelotMode } {
  const source = parseCamelot(sourceCamelot);
  const candidate = parseCamelot(candidateCamelot);

  if (!source || !candidate) {
    return { score: 0.5, mode: "unknown" };
  }

  const distance = circularCamelotDistance(
    source.number,
    candidate.number,
  );

  if (
    source.number === candidate.number &&
    source.letter === candidate.letter
  ) {
    return { score: 1, mode: "same" };
  }

  if (
    source.number === candidate.number &&
    source.letter !== candidate.letter
  ) {
    return { score: 0.95, mode: "relative" };
  }

  if (distance === 1 && source.letter === candidate.letter) {
    const forward =
      candidate.number === (source.number % 12) + 1;

    return {
      score: 0.92,
      mode: forward ? "energy-boost" : "energy-drop",
    };
  }

  if (distance === 1 && source.letter !== candidate.letter) {
    return { score: 0.72, mode: "adjacent" };
  }

  if (distance === 2 && source.letter === candidate.letter) {
    return { score: 0.55, mode: "adjacent" };
  }

  return { score: 0.18, mode: "none" };
}

// =============================================================================
// GENRE SCORING
// =============================================================================

function getGenreProfile(mode: MatchMode): GenreScores {
  return mode === "cross-style"
    ? GENRE_CROSS_STYLE
    : GENRE_SAME_STYLE;
}

function fallbackFamilyScore(
  sourceGenre: string,
  candidateGenre: string,
): number {
  const source = GENRE_METADATA[sourceGenre];
  const candidate = GENRE_METADATA[candidateGenre];

  if (!source || !candidate) {
    return 0;
  }

  const sourcePrimary = normalizeGenre(source.primaryFamily);
  const candidatePrimary = normalizeGenre(candidate.primaryFamily);

  if (sourcePrimary && sourcePrimary === candidatePrimary) {
    return 0.52;
  }

  const sourceFamilies = new Set(
    [
      sourcePrimary,
      ...(source.secondaryFamilies ?? []).map(normalizeGenre),
    ].filter(Boolean),
  );

  const candidateFamilies = new Set(
    [
      candidatePrimary,
      ...(candidate.secondaryFamilies ?? []).map(normalizeGenre),
    ].filter(Boolean),
  );

  const hasSharedFamily = [...sourceFamilies].some((family) =>
    candidateFamilies.has(family),
  );

  return hasSharedFamily ? 0.38 : 0;
}

export function scoreGenreCompatibility(
  sourceGenres: string[],
  candidateGenres: string[],
  mode: MatchMode,
): {
  score: number;
  matchedPair: [string, string] | null;
} {
  const profile = getGenreProfile(mode);

  let bestScore = 0;
  let matchedPair: [string, string] | null = null;

  for (const rawSource of sourceGenres) {
    const source = normalizeGenre(rawSource);

    if (!source) {
      continue;
    }

    for (const rawCandidate of candidateGenres) {
      const candidate = normalizeGenre(rawCandidate);

      if (!candidate) {
        continue;
      }

      const directScore = profile[source]?.[candidate];
      const reverseScore = profile[candidate]?.[source];

      let score = Math.max(
        toFiniteNumber(directScore) ?? 0,
        toFiniteNumber(reverseScore) ?? 0,
      );

      if (source === candidate) {
        score = mode === "same-style" ? 1 : Math.max(score, 0.18);
      }

      if (score <= 0) {
        score = fallbackFamilyScore(source, candidate);
      }

      if (score > bestScore) {
        bestScore = score;
        matchedPair = [source, candidate];
      }
    }
  }

  return {
    score: clamp(bestScore),
    matchedPair,
  };
}

// =============================================================================
// BPM, ENERGY, POPULARITY AND KEYWORDS
// =============================================================================

function effectiveBpmDifference(
  source: number,
  candidate: number,
  allowDoubleHalf: boolean,
): number {
  const differences = [Math.abs(source - candidate)];

  if (allowDoubleHalf) {
    differences.push(
      Math.abs(source - candidate * 2),
      Math.abs(source - candidate / 2),
      Math.abs(source * 2 - candidate),
      Math.abs(source / 2 - candidate),
    );
  }

  return Math.min(...differences);
}

export function scoreBpmCompatibility(
  sourceBpm: number | null,
  candidateBpm: number | null,
  maximumDifference: number,
  allowDoubleHalf = true,
): {
  score: number;
  rawDifference: number | null;
  normalizedDifference: number | null;
} {
  if (sourceBpm === null || candidateBpm === null) {
    return {
      score: 0.5,
      rawDifference: null,
      normalizedDifference: null,
    };
  }

  const rawDifference = Math.abs(sourceBpm - candidateBpm);
  const normalizedDifference = effectiveBpmDifference(
    sourceBpm,
    candidateBpm,
    allowDoubleHalf,
  );

  const score = 1 - normalizedDifference / maximumDifference;

  return {
    score: clamp(score),
    rawDifference: round(rawDifference, 2),
    normalizedDifference: round(normalizedDifference, 2),
  };
}

export function scoreEnergyCompatibility(
  sourceEnergy: number | null,
  candidateEnergy: number | null,
  maximumDifference: number,
): {
  score: number;
  difference: number | null;
} {
  if (sourceEnergy === null || candidateEnergy === null) {
    return {
      score: 0.5,
      difference: null,
    };
  }

  const difference = Math.abs(sourceEnergy - candidateEnergy);
  const score = 1 - difference / maximumDifference;

  return {
    score: clamp(score),
    difference: round(difference, 2),
  };
}

export function scorePopularityCompatibility(
  sourcePopularity: number | null,
  candidatePopularity: number | null,
  preference: "similar" | "higher" | "ignore",
): number {
  if (preference === "ignore") {
    return 0.5;
  }

  if (sourcePopularity === null || candidatePopularity === null) {
    return 0.5;
  }

  if (preference === "higher") {
    const difference = candidatePopularity - sourcePopularity;

    if (difference >= 0) {
      return clamp(0.75 + difference / 100);
    }

    return clamp(0.75 + difference / 60);
  }

  return clamp(1 - Math.abs(sourcePopularity - candidatePopularity) / 100);
}

export function scoreKeywordCompatibility(
  sourceKeywords: string[],
  candidateKeywords: string[],
): {
  score: number;
  shared: string[];
} {
  if (!sourceKeywords.length || !candidateKeywords.length) {
    return {
      score: 0.5,
      shared: [],
    };
  }

  const sourceSet = new Set(sourceKeywords);
  const candidateSet = new Set(candidateKeywords);

  const shared = [...sourceSet].filter((keyword) =>
    candidateSet.has(keyword),
  );

  const unionSize = new Set([...sourceSet, ...candidateSet]).size;
  const jaccard = unionSize > 0 ? shared.length / unionSize : 0;

  return {
    score: clamp(shared.length > 0 ? 0.55 + jaccard * 0.45 : 0.1),
    shared,
  };
}

// =============================================================================
// OPTIONS
// =============================================================================

function resolveOptions(
  options: MatchOptions = {},
): typeof DEFAULT_MATCH_OPTIONS {
  const weights: MatchWeights = {
    ...DEFAULT_MATCH_WEIGHTS,
    ...(options.weights ?? {}),
  };

  const weightTotal = Object.values(weights).reduce(
    (total, value) => total + Math.max(0, value),
    0,
  );

  if (weightTotal <= 0) {
    throw new Error(
      "matchSongs: la suma de los pesos debe ser mayor que cero.",
    );
  }

  return {
    ...DEFAULT_MATCH_OPTIONS,
    ...options,
    weights,
  };
}

// =============================================================================
// MATCH ENGINE
// =============================================================================

function isSameTrack(
  source: TrackLike,
  candidate: TrackLike,
): boolean {
  const sourceId = getTrackId(source);
  const candidateId = getTrackId(candidate);

  return Boolean(sourceId && candidateId && sourceId === candidateId);
}

export function scoreSongMatch<T extends TrackLike>(
  source: TrackLike,
  candidate: T,
  options: MatchOptions = {},
): SongMatch<T> | null {
  const config = resolveOptions(options);

  if (!config.includeSameTrack && isSameTrack(source, candidate)) {
    return null;
  }

  const sourceGenres = resolveKnownGenres(source);
  const candidateGenres = resolveKnownGenres(candidate);

  const genreResult = scoreGenreCompatibility(
    sourceGenres,
    candidateGenres,
    config.mode,
  );

  if (
    config.requireGenreMatch &&
    genreResult.score < config.minimumGenreScore
  ) {
    return null;
  }

  const bpmResult = scoreBpmCompatibility(
    getTrackBpm(source),
    getTrackBpm(candidate),
    config.maxBpmDifference,
    config.allowDoubleHalfBpm,
  );

  const energyResult = scoreEnergyCompatibility(
    getTrackEnergy(source),
    getTrackEnergy(candidate),
    config.maxEnergyDifference,
  );

  const sourceCamelot = getTrackCamelot(source);
  const candidateCamelot = getTrackCamelot(candidate);
  const camelotResult = scoreCamelotCompatibility(
    sourceCamelot,
    candidateCamelot,
  );

  const popularityScore = scorePopularityCompatibility(
    getTrackPopularity(source),
    getTrackPopularity(candidate),
    config.popularityPreference,
  );

  const keywordResult = scoreKeywordCompatibility(
    getTrackKeywords(source),
    getTrackKeywords(candidate),
  );

  const breakdown: ScoreBreakdown = {
    genre: round(genreResult.score),
    bpm: round(bpmResult.score),
    energy: round(energyResult.score),
    camelot: round(camelotResult.score),
    popularity: round(popularityScore),
    keywords: round(keywordResult.score),
  };

  const weightedValues: ScoreBreakdown = {
    genre: breakdown.genre * config.weights.genre,
    bpm: breakdown.bpm * config.weights.bpm,
    energy: breakdown.energy * config.weights.energy,
    camelot: breakdown.camelot * config.weights.camelot,
    popularity:
      breakdown.popularity * config.weights.popularity,
    keywords: breakdown.keywords * config.weights.keywords,
  };

  const totalWeight = Object.values(config.weights).reduce(
    (total, value) => total + Math.max(0, value),
    0,
  );

  const weightedTotal = Object.values(weightedValues).reduce(
    (total, value) => total + value,
    0,
  );

  const score = clamp(weightedTotal / totalWeight);

  if (score < config.minimumScore) {
    return null;
  }

  return {
    track: candidate,
    score: round(score),
    percentage: Math.round(score * 100),
    mode: config.mode,

    breakdown,

    weightedBreakdown: {
      genre: round(weightedValues.genre),
      bpm: round(weightedValues.bpm),
      energy: round(weightedValues.energy),
      camelot: round(weightedValues.camelot),
      popularity: round(weightedValues.popularity),
      keywords: round(weightedValues.keywords),
      totalWeight: round(totalWeight),
    },

    explanation: {
      sourceGenres,
      candidateGenres,
      matchedGenrePair: genreResult.matchedPair,

      bpmDifference: bpmResult.rawDifference,
      normalizedBpmDifference: bpmResult.normalizedDifference,

      energyDifference: energyResult.difference,

      sourceCamelot,
      candidateCamelot,
      camelotMode: camelotResult.mode,

      sharedKeywords: keywordResult.shared,
    },
  };
}

export function matchSongs<T extends TrackLike>(
  source: TrackLike,
  candidates: readonly T[],
  options: MatchOptions = {},
): SongMatch<T>[] {
  const config = resolveOptions(options);

  return candidates
    .map((candidate) =>
      scoreSongMatch(source, candidate, config),
    )
    .filter((match): match is SongMatch<T> => match !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.breakdown.genre !== left.breakdown.genre) {
        return right.breakdown.genre - left.breakdown.genre;
      }

      if (right.breakdown.camelot !== left.breakdown.camelot) {
        return right.breakdown.camelot - left.breakdown.camelot;
      }

      const leftTitle = getTrackTitle(left.track);
      const rightTitle = getTrackTitle(right.track);

      return leftTitle.localeCompare(rightTitle);
    })
    .slice(0, config.limit);
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

export function matchSameStyle<T extends TrackLike>(
  source: TrackLike,
  candidates: readonly T[],
  options: Omit<MatchOptions, "mode"> = {},
): SongMatch<T>[] {
  return matchSongs(source, candidates, {
    ...options,
    mode: "same-style",
  });
}

export function matchCrossStyle<T extends TrackLike>(
  source: TrackLike,
  candidates: readonly T[],
  options: Omit<MatchOptions, "mode"> = {},
): SongMatch<T>[] {
  return matchSongs(source, candidates, {
    ...options,
    mode: "cross-style",
  });
}

export function getGenreRecommendations(
  genre: string,
  mode: MatchMode = "same-style",
): Array<{ genre: string; score: number }> {
  const canonical = normalizeGenre(genre);
  const source =
    mode === "same-style"
      ? GENRE_SAME_STYLE[canonical]
      : GENRE_CROSS_STYLE[canonical];

  if (!source) {
    return [];
  }

  return Object.entries(source)
    .map(([candidate, score]) => ({
      genre: candidate,
      score,
    }))
    .sort((left, right) => right.score - left.score);
}

export function isGenreAvailable(genre: string): boolean {
  return AVAILABLE_GENRES.has(normalizeGenre(genre));
}

export function getGenreMetadata(
  genre: string,
): GenreMetadata | null {
  return GENRE_METADATA[normalizeGenre(genre)] ?? null;
}

export default matchSongs;
