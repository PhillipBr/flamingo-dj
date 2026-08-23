import type {
  SetlistJourneyTemplateId,
} from "./setlistGenerator";

import type {
  VenuePhaseId,
} from "./venuePhaseLearning";

export type PreEventPhaseGeneratorPlan = {
  phaseId: VenuePhaseId;

  phaseName:
    | "Opening"
    | "Warm Up"
    | "Build"
    | "Peak"
    | "Release";

  durationRatio: number;

  minimumBpm: number;
  maximumBpm: number;

  genres: string[];

  reliableTrackIds: string[];
  crowdRescueTrackIds: string[];
  reviewTrackIds: string[];

  crowdScore: number | null;
  responseCount: number;
};

export type PreEventGeneratorPreset = {
  id: string;

  profileId: string | null;
  profileName: string;

  createdAt: string;

  minimumBpm: number;
  maximumBpm: number;

  journeyTemplateId:
    SetlistJourneyTemplateId;

  strongGenres: string[];

  reliableTrackIds: string[];
  crowdRescueTrackIds: string[];
  reviewTrackIds: string[];

  sourceSessions: number;
  readinessScore: number;

  /**
   * Phase-Aware Pre-Event Generator V2.
   *
   * Optional for backward compatibility with presets saved before V2.
   */
  phasePlans?:
    PreEventPhaseGeneratorPlan[];
};
