import type {
  EventProfile,
} from "./eventProfile";

import type {
  TrackPerformanceRecord,
} from "./trackPerformance";

export type VenueCoachInsightType =
  | "positive"
  | "warning"
  | "info";

export type VenueCoachGenreComparison = {
  genre: string;

  venueScore: number | null;
  globalScore: number | null;

  difference: number | null;

  venuePositiveResponses: number;
  venueLosingResponses: number;

  globalPositiveResponses: number;
  globalLosingResponses: number;
};

export type VenueCoachBpmComparison = {
  venueRange: string | null;
  globalRange: string | null;
};

export type VenueCoachInsight = {
  id: string;
  type: VenueCoachInsightType;
  title: string;
  detail: string;
};

export type VenueSpecificCoachSummary = {
  profile: EventProfile | null;

  venueSessions: number;
  globalSessions: number;

  venueAveragePerformance: number | null;
  globalAveragePerformance: number | null;

  bpmComparison: VenueCoachBpmComparison;

  genreComparisons:
    VenueCoachGenreComparison[];

  venueReliableTracks:
    TrackPerformanceRecord[];

  venueCrowdRescueTracks:
    TrackPerformanceRecord[];

  venueTracksToReview:
    TrackPerformanceRecord[];

  venueSpecificReliableTracks:
    TrackPerformanceRecord[];

  insights:
    VenueCoachInsight[];
};
