import type {
  TrackPerformanceRecord,
} from "./trackPerformance";

export type DJCoachInsightType =
  | "positive"
  | "warning"
  | "info";

export type DJCoachInsight = {
  id: string;

  type: DJCoachInsightType;

  title: string;
  detail: string;
};

export type DJCoachGenrePerformance = {
  genre: string;

  positiveResponses: number;
  losingCrowdResponses: number;

  score: number;
};

export type DJCoachSummary = {
  sessionsAnalyzed: number;

  totalPlayedTracks: number;

  averagePerformanceScore: number | null;

  strongestBpmRange: string | null;

  strongestGenres:
    DJCoachGenrePerformance[];

  largeBpmJumpLosingCrowdCount: number;

  sameStyleLongRunCount: number;

  reliableTracks:
    TrackPerformanceRecord[];

  tracksToReview:
    TrackPerformanceRecord[];

  insights:
    DJCoachInsight[];
};
