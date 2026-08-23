import type {
  EventProfile,
} from "./eventProfile";

import type {
  TrackPerformanceRecord,
} from "./trackPerformance";

export type VenuePhaseId =
  | "opening"
  | "warm-up"
  | "build"
  | "peak"
  | "release";

export type VenuePhaseDefinition = {
  id: VenuePhaseId;
  label: string;
  startRatio: number;
  endRatio: number;
};

export type VenuePhaseGenreSignal = {
  genre: string;

  positiveResponses: number;
  losingCrowdResponses: number;

  score: number;
};

export type VenuePhaseSummary = {
  phase: VenuePhaseDefinition;

  trackCount: number;
  responseCount: number;

  averageBpm: number | null;
  averageEnergy: number | null;
  averagePopularity: number | null;

  strongestBpmRange: string | null;

  crowdScore: number | null;

  strongestGenres:
    VenuePhaseGenreSignal[];

  reliableTracks:
    TrackPerformanceRecord[];

  crowdRescueTracks:
    TrackPerformanceRecord[];

  tracksToReview:
    TrackPerformanceRecord[];
};

export type VenuePhaseLearningInsightType =
  | "positive"
  | "warning"
  | "info";

export type VenuePhaseLearningInsight = {
  id: string;

  type:
    VenuePhaseLearningInsightType;

  title: string;
  detail: string;
};

export type VenuePhaseLearningSummary = {
  profile:
    EventProfile | null;

  sessionsAnalyzed: number;

  phases:
    VenuePhaseSummary[];

  strongestPhase:
    VenuePhaseId | null;

  weakestPhase:
    VenuePhaseId | null;

  insights:
    VenuePhaseLearningInsight[];
};
