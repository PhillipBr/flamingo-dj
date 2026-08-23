import type { Track } from "./track";

export type LiveAdaptiveAction =
  | "return-to-plan"
  | "more-energy"
  | "less-energy"
  | "stay-bpm"
  | "change-style"
  | "play-a-hit";

export type LiveAdaptiveCandidate = {
  track: Track;

  score: number;
  percentage: number;

  bpmDifference: number | null;
  energyDifference: number | null;

  genreMatch: boolean;
  bpmMatch: boolean;
  popularityMatch: boolean;
};

export type LiveAdaptivePhase = {
  index: number;
  name: string;

  elapsedSeconds: number;
  startSeconds: number;
  endSeconds: number;

  progress: number;

  targetGenres: string[];

  minimumBpm: number;
  maximumBpm: number;
};

export type LiveAdaptiveDirection = {
  action: LiveAdaptiveAction;

  title: string;
  explanation: string;

  confidence: number;

  targetBpmMin: number | null;
  targetBpmMax: number | null;

  targetGenres: string[];

  currentTrackInPlan: boolean;
  currentBpmInPlan: boolean;
  currentGenreInPlan: boolean;

  phase: LiveAdaptivePhase | null;

  candidates: LiveAdaptiveCandidate[];
};
