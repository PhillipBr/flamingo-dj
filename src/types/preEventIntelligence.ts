import type {
  EventProfile,
} from "./eventProfile";

import type {
  TrackPerformanceRecord,
} from "./trackPerformance";

export type PreEventJourneyRecommendation =
  | "warmup-peak-release"
  | "progressive-build"
  | "long-warmup"
  | "peak-heavy"
  | "smooth-wave";

export type PreEventGenreSignal = {
  genre: string;
  positiveResponses: number;
  losingCrowdResponses: number;
  score: number;
};

export type PreEventIntelligence = {
  profile: EventProfile | null;
  sessionsAnalyzed: number;
  totalTracksPlayed: number;
  averagePerformanceScore: number | null;

  recommendedStartingBpm: {
    minimum: number;
    maximum: number;
  } | null;

  strongestGenres: PreEventGenreSignal[];
  reliableTracks: TrackPerformanceRecord[];
  crowdRescueTracks: TrackPerformanceRecord[];
  tracksToReview: TrackPerformanceRecord[];

  recommendedJourney: PreEventJourneyRecommendation;
  readinessScore: number;
  notes: string[];
};
