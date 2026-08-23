export type TrackPerformanceRole =
  | "reliable-hit"
  | "crowd-rescue"
  | "steady"
  | "needs-review"
  | "insufficient-data";

export type TrackPerformanceRecord = {
  trackId: string;

  title: string;
  artist: string;

  plays: number;

  great: number;
  good: number;
  neutral: number;
  losingCrowd: number;

  crowdResponses: number;
  crowdScore: number;

  rescueCount: number;

  averageBpm: number | null;
  averageEnergy: number | null;
  averagePopularity: number | null;

  role: TrackPerformanceRole;
};
