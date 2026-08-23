import type { Track } from "./track";

export type AudienceResponseLevel =
  | "great"
  | "good"
  | "neutral"
  | "losing-crowd";

export type AudienceResponseEntry = {
  id: string;
  level: AudienceResponseLevel;
  trackId: string | null;
  createdAt: string;
};

export type AudienceEmergencyAction =
  | "keep-direction"
  | "increase-familiarity"
  | "raise-energy"
  | "reduce-energy"
  | "return-to-plan"
  | "change-style"
  | "play-a-hit";

export type AudienceEmergencyCandidate = {
  track: Track;
  score: number;
  percentage: number;
  popularityScore: number;
  bpmScore: number;
  energyScore: number;
  styleScore: number;
  reason: string;
};

export type AudienceEmergencyDecision = {
  action: AudienceEmergencyAction;
  title: string;
  explanation: string;
  confidence: number;
  activeResponse: AudienceResponseLevel | null;
  candidates: AudienceEmergencyCandidate[];
};
