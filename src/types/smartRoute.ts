import type { Track } from "./track";

export type SmartRouteStrategy =
  | "stay-style"
  | "increase-energy"
  | "cross-style";

export type SmartRouteStep = {
  position: number;

  track: Track;

  transitionScore: number;
  transitionPercentage: number;

  bpmScore: number;
  camelotScore: number;
  energyScore: number;
  genreScore: number;
  popularityScore: number;
};

export type SmartRoute = {
  id: string;

  strategy: SmartRouteStrategy;
  title: string;
  description: string;

  score: number;
  percentage: number;

  tracks: Track[];
  steps: SmartRouteStep[];

  startBpm: number | null;
  endBpm: number | null;

  startEnergy: number | null;
  endEnergy: number | null;

  targetGenre: string | null;
};

export type SmartRoutePlan = {
  currentTrack: Track | null;

  routeLength: number;

  routes: SmartRoute[];
};
