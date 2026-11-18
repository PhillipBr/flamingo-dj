import type { Track } from "../types/track";
import type {
  MatchEnergyDirection,
  MatchFeedbackRecord,
  MatchHarmonicPriority,
} from "../types/matchV2";

export type MatchCandidateScore = {
  track: Track;
  finalScore: number;
  technicalScore: number;
  bpmScore: number;
  keyScore: number;
  energyScore: number;
  humanBoost: number;
  humanRating: 0 | 1 | 2 | 3 | null;
  bpmMode: "normal" | "half-double" | "unknown";
  bpmDistance: number | null;
  camelot: string | null;
};

type Camelot = { number: number; letter: "A" | "B" };

const NOTE_TO_CAMELOT: Record<string, string> = {
  "G#m":"1A","Abm":"1A","B":"1B",
  "D#m":"2A","Ebm":"2A","F#":"2B","Gb":"2B",
  "A#m":"3A","Bbm":"3A","C#":"3B","Db":"3B",
  "Fm":"4A","Ab":"4B","G#":"4B",
  "Cm":"5A","Eb":"5B","D#":"5B",
  "Gm":"6A","Bb":"6B","A#":"6B",
  "Dm":"7A","F":"7B",
  "Am":"8A","C":"8B",
  "Em":"9A","G":"9B",
  "Bm":"10A","D":"10B",
  "F#m":"11A","Gbm":"11A","A":"11B",
  "C#m":"12A","Dbm":"12A","E":"12B",
};

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bpm(track: Track): number | null {
  const n = num(track.tempo);
  return n !== null && n > 0 ? n : null;
}

function energy(track: Track): number | null {
  return num(track.energy);
}

function normalizeKey(value: string): string {
  const compact = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/minor$/i, "m")
    .replace(/major$/i, "");

  if (!compact) return "";
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

export function camelotForTrack(track: Track): string | null {
  const raw = String(track.musicalKey ?? "").trim();
  if (!raw) return null;

  const direct = raw
    .replace(/\s+/g, "")
    .toUpperCase()
    .match(/^(1[0-2]|[1-9])([AB])$/);

  if (direct) return `${direct[1]}${direct[2]}`;
  return NOTE_TO_CAMELOT[normalizeKey(raw)] ?? null;
}

function parseCamelot(track: Track): Camelot | null {
  const value = camelotForTrack(track);
  if (!value) return null;
  const m = value.match(/^(1[0-2]|[1-9])([AB])$/);
  if (!m) return null;
  return { number: Number(m[1]), letter: m[2] as "A" | "B" };
}

function wheelDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 12 - direct);
}

function keyCompatibility(source: Track, target: Track): number {
  const a = parseCamelot(source);
  const b = parseCamelot(target);
  if (!a || !b) return 55;
  if (a.number === b.number && a.letter === b.letter) return 100;

  const distance = wheelDistance(a.number, b.number);
  if (distance === 1 && a.letter === b.letter) return 96;
  if (a.number === b.number && a.letter !== b.letter) return 92;
  if (distance === 2 && a.letter === b.letter) return 74;
  if (distance === 1 && a.letter !== b.letter) return 68;
  return 34;
}

function bpmCompatibility(
  source: Track,
  target: Track,
  allowHalfDouble: boolean,
): {
  score: number;
  distance: number | null;
  mode: "normal" | "half-double" | "unknown";
} {
  const a = bpm(source);
  const b = bpm(target);

  if (a === null || b === null) {
    return { score: 50, distance: null, mode: "unknown" };
  }

  const candidates: Array<{
    distance: number;
    mode: "normal" | "half-double";
  }> = [
    { distance: Math.abs(a - b), mode: "normal" },
  ];

  if (allowHalfDouble) {
    candidates.push(
      { distance: Math.abs(a - b * 2), mode: "half-double" },
      { distance: Math.abs(a - b / 2), mode: "half-double" },
      { distance: Math.abs(a * 2 - b), mode: "half-double" },
      { distance: Math.abs(a / 2 - b), mode: "half-double" },
    );
  }

  candidates.sort((x, y) => x.distance - y.distance);
  const best = candidates[0];

  return {
    distance: best.distance,
    mode: best.mode,
    score: Math.round(Math.max(0, 100 - best.distance * 7)),
  };
}

function energyCompatibility(
  source: Track,
  target: Track,
  direction: MatchEnergyDirection,
): number {
  const a = energy(source);
  const b = energy(target);
  if (a === null || b === null) return 55;

  const delta = b - a;

  if (direction === "any") {
    return Math.round(Math.max(0, 100 - Math.abs(delta) * 14));
  }

  if (direction === "maintain") {
    return Math.round(Math.max(0, 100 - Math.abs(delta) * 22));
  }

  if (direction === "build") {
    if (delta >= 0 && delta <= 2) {
      return Math.round(100 - Math.abs(delta - 1) * 10);
    }
    return Math.round(Math.max(0, 62 - Math.abs(delta - 1) * 16));
  }

  if (delta <= 0 && delta >= -3) {
    return Math.round(100 - Math.abs(delta + 1.5) * 9);
  }

  return Math.round(Math.max(0, 62 - Math.abs(delta + 1.5) * 14));
}

function directBoost(rating: 0 | 1 | 2 | 3 | null): number {
  if (rating === 3) return 18;
  if (rating === 2) return 8;
  if (rating === 1) return -8;
  if (rating === 0) return -30;
  return 0;
}

function patternBoost(
  bpmScore: number,
  keyScore: number,
  energyScore: number,
  feedback: MatchFeedbackRecord[],
): number {
  if (feedback.length < 5) return 0;

  let positive = 0;
  let negative = 0;

  for (const item of feedback) {
    const distance =
      Math.abs(item.bpmScore - bpmScore) * 0.40 +
      Math.abs(item.keyScore - keyScore) * 0.35 +
      Math.abs(item.energyScore - energyScore) * 0.25;

    if (distance > 28) continue;

    const similarity = 1 - distance / 28;
    if (item.rating === 3) positive += similarity;
    if (item.rating === 2) positive += similarity * 0.45;
    if (item.rating === 1) negative += similarity * 0.35;
    if (item.rating === 0) negative += similarity;
  }

  return Math.max(-8, Math.min(8, (positive - negative) * 2.5));
}

export function buildMatchCandidates(args: {
  sourceTrack: Track;
  candidates: Track[];
  feedback: MatchFeedbackRecord[];
  energyDirection: MatchEnergyDirection;
  harmonicPriority: MatchHarmonicPriority;
  allowHalfDouble: boolean;
  limit?: number;
}): MatchCandidateScore[] {
  const {
    sourceTrack,
    candidates,
    feedback,
    energyDirection,
    harmonicPriority,
    allowHalfDouble,
    limit = 30,
  } = args;

  const directFeedback = new Map(
    feedback
      .filter((item) => item.sourceTrackId === sourceTrack.id)
      .map((item) => [item.targetTrackId, item]),
  );

  const keyWeight =
    harmonicPriority === "high" ? 0.30 :
    harmonicPriority === "medium" ? 0.23 : 0.16;

  const bpmWeight = 0.38;
  const energyWeight = harmonicPriority === "high" ? 0.22 : 0.27;
  const contextWeight = 1 - bpmWeight - keyWeight - energyWeight;

  return candidates
    .filter((candidate) => candidate.id !== sourceTrack.id)
    .map((candidate) => {
      const bpmResult = bpmCompatibility(
        sourceTrack,
        candidate,
        allowHalfDouble,
      );

      const keyScore = keyCompatibility(sourceTrack, candidate);
      const energyScore = energyCompatibility(
        sourceTrack,
        candidate,
        energyDirection,
      );

      // Playlist selection itself is the style/context signal in V2.
      const contextScore = 72;

      const technicalScore = Math.round(
        bpmResult.score * bpmWeight +
        keyScore * keyWeight +
        energyScore * energyWeight +
        contextScore * contextWeight,
      );

      const previous = directFeedback.get(candidate.id);
      const humanRating = previous?.rating ?? null;

      const humanBoost =
        directBoost(humanRating) +
        patternBoost(
          bpmResult.score,
          keyScore,
          energyScore,
          feedback,
        );

      return {
        track: candidate,
        technicalScore,
        finalScore: Math.round(
          Math.max(0, Math.min(100, technicalScore + humanBoost)),
        ),
        bpmScore: bpmResult.score,
        keyScore,
        energyScore,
        humanBoost: Math.round(humanBoost),
        humanRating,
        bpmMode: bpmResult.mode,
        bpmDistance: bpmResult.distance,
        camelot: camelotForTrack(candidate),
      };
    })
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.technicalScore - a.technicalScore,
    )
    .slice(0, limit);
}
