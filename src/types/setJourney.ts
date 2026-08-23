import type { Track } from "./track";

export type SetJourneyPhaseName =
  | "Warm Up"
  | "Build"
  | "Peak"
  | "Release";

export type SetJourneyPoint = {
  index: number;

  track: Track;

  plannedPlaySeconds: number;

  startSeconds: number;
  endSeconds: number;

  progress: number;

  bpm: number | null;
  energy: number | null;
  popularity: number | null;

  phase: SetJourneyPhaseName;
};

export type SetJourneyIssueType =
  | "energy-jump"
  | "energy-drop"
  | "bpm-jump"
  | "bpm-drop"
  | "flat-energy";

export type SetJourneyIssue = {
  id: string;

  type: SetJourneyIssueType;

  severity:
    | "warning"
    | "poor";

  startIndex: number;
  endIndex: number;

  title: string;
  detail: string;
};

export type SetJourneyPhaseSummary = {
  name: SetJourneyPhaseName;

  startSeconds: number;
  endSeconds: number;

  trackCount: number;

  averageBpm: number | null;
  averageEnergy: number | null;
  averagePopularity: number | null;
};

export type SetJourneySummary = {
  totalTracks: number;
  totalSeconds: number;

  averageBpm: number | null;
  averageEnergy: number | null;
  averagePopularity: number | null;

  startBpm: number | null;
  endBpm: number | null;

  startEnergy: number | null;
  peakEnergy: number | null;
  endEnergy: number | null;

  healthScore: number;
};

export type SetJourneyAnalysis = {
  points: SetJourneyPoint[];

  phases:
    SetJourneyPhaseSummary[];

  issues: SetJourneyIssue[];

  summary: SetJourneySummary;
};
