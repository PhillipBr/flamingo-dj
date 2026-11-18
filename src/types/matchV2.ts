export type MatchEnergyDirection = "maintain" | "build" | "drop" | "any";
export type MatchHarmonicPriority = "high" | "medium" | "low";
export type MatchHumanRating = 0 | 1 | 2 | 3;

export type MatchFeedbackRecord = {
  sourceTrackId: string;
  targetTrackId: string;
  sourcePlaylistId: string | null;
  targetPlaylistId: string | null;
  rating: MatchHumanRating;
  technicalScore: number;
  bpmScore: number;
  keyScore: number;
  energyScore: number;
  createdAt: string;
  updatedAt: string;
};
