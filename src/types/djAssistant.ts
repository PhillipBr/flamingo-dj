import type { Track } from "./track";

export type DjAssistantDirection =
  | "stay-style"
  | "increase-energy"
  | "decrease-energy"
  | "change-style"
  | "hold-bpm";

export type DjAssistantRecommendation = {
  direction: DjAssistantDirection;

  title: string;
  explanation: string;

  recommendedBpmMin: number | null;
  recommendedBpmMax: number | null;

  recommendedKeys: string[];
  recommendedCamelot: string[];

  preferredGenres: string[];
  avoidGenres: string[];

  confidence: number;

  candidateTracks: Track[];
};

export type DjAssistantInsight = {
  currentTrack: Track | null;
  recentTracks: Track[];

  currentEnergy: number | null;
  averageRecentEnergy: number | null;

  currentBpm: number | null;
  averageRecentBpm: number | null;

  repeatedGenreMinutesEstimate: number;
  dominantRecentGenres: string[];

  recommendation: DjAssistantRecommendation;
};
