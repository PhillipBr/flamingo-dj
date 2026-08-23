import type {
  AudienceResponseLevel,
} from "./audienceResponse";

export type LivePerformanceTrack = {
  position: number;

  trackId: string;
  title: string;
  artist: string;

  bpm: number | null;
  energy: number | null;
  popularity: number | null;
  genre: string | null;
};

export type LivePerformanceAudienceSummary = {
  great: number;
  good: number;
  neutral: number;
  losingCrowd: number;

  total: number;
  score: number;
};

export type LivePerformanceScores = {
  overall: number;

  transitionFlow: number;
  energyJourney: number;
  eventPlan: number;
  crowdResponse: number;
  styleVariety: number;
};

export type LivePerformanceObservationType =
  | "positive"
  | "warning"
  | "info";

export type LivePerformanceObservation = {
  id: string;

  type:
    LivePerformanceObservationType;

  title: string;
  detail: string;
};

export type LivePerformanceAudienceEntry = {
  level:
    AudienceResponseLevel;

  trackId: string | null;
  createdAt: string;
};

export type LivePerformanceRecord = {
  id: string;

  name: string;

  startedAt: string;
  endedAt: string;

  durationSeconds: number;

  currentSetName: string;

  eventPlanName: string | null;

  eventProfileId: string | null;
  eventProfileName: string | null;
  eventProfileType: string | null;

  tracks:
    LivePerformanceTrack[];

  audienceEntries:
    LivePerformanceAudienceEntry[];

  audience:
    LivePerformanceAudienceSummary;

  averageBpm: number | null;
  averageEnergy: number | null;
  averagePopularity: number | null;

  minimumBpm: number | null;
  maximumBpm: number | null;

  startEnergy: number | null;
  peakEnergy: number | null;
  endEnergy: number | null;

  eventPlanCompliance: number | null;

  scores:
    LivePerformanceScores;

  observations:
    LivePerformanceObservation[];

  createdAt: string;
};
