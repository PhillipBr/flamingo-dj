export type SetlistEnergyCurve =
  | "progressive"
  | "warmup-peak-closing"
  | "smooth";

export type SetlistKeyMode =
  | "strict"
  | "compatible"
  | "flexible"
  | "ignore";

export type SetlistStartMode =
  | "automatic"
  | "selected";

export type SetlistInsertMode =
  | "replace"
  | "append";

export type SetlistGenerationMode =
  | "track-count"
  | "event-duration";

export type SetlistJourneyTemplateId =
  | "warmup-peak-release"
  | "progressive-build"
  | "long-warmup"
  | "peak-heavy"
  | "smooth-wave";

export type SetlistStyleBlock = {
  id: string;

  phaseName?:
    | "Opening"
    | "Warm Up"
    | "Build"
    | "Peak"
    | "Release";

  genre: string;

  /**
   * Optional OR-list used by Event Planner V2.
   * "genre" remains for backward compatibility and as the primary label.
   */
  genres?: string[];

  durationMinutes: number;
  minimumBpm: number;
  maximumBpm: number;

  /**
   * Optional phase-specific historical learning.
   *
   * When present, the planner uses these IDs only for this block.
   */
  historicalPriorityEnabled?: boolean;

  reliableTrackIds?: string[];
  crowdRescueTrackIds?: string[];
  reviewTrackIds?: string[];
};

export type SetlistGeneratorOptions = {
  trackCount: number;

  minimumBpm: number;
  maximumBpm: number;

  genre: string;

  minimumPopularity: number;
  maximumPopularity: number;

  energyCurve: SetlistEnergyCurve;
  keyMode: SetlistKeyMode;

  artistSpacing: number;

  startMode: SetlistStartMode;
  startTrackId: string | null;

  historicalPriorityEnabled?: boolean;

  reliableTrackIds?: string[];
  crowdRescueTrackIds?: string[];
  reviewTrackIds?: string[];
};

export type SetlistPlannerOptions =
  SetlistGeneratorOptions & {
    generationMode: SetlistGenerationMode;

    eventDurationMinutes: number;
    averagePlaySeconds: number;

    useStyleBlocks: boolean;
    styleBlocks: SetlistStyleBlock[];
  };

export type GeneratedSetlistBlockResult<TTrack> = {
  blockId: string;

  phaseName?:
    | "Opening"
    | "Warm Up"
    | "Build"
    | "Peak"
    | "Release";

  genre: string;
  genres?: string[];

  minimumBpm?: number;
  maximumBpm?: number;

  requestedCount: number;
  generatedCount: number;
  durationMinutes: number;
  tracks: TTrack[];
};

export type GeneratedSetlistResult<TTrack> = {
  tracks: TTrack[];
  requestedCount: number;
  generatedCount: number;
  warnings: string[];

  estimatedDurationSeconds?: number;
  blocks?: GeneratedSetlistBlockResult<TTrack>[];
};


export type SetlistEventPlanPhase = {
  id: string;

  name:
    | "Warm Up"
    | "Build"
    | "Peak"
    | "Release"
    | string;

  genres: string[];

  durationMinutes: number;

  minimumBpm: number;
  maximumBpm: number;
};

export type SetlistEventPlan = {
  id: string;
  name: string;

  templateId:
    SetlistJourneyTemplateId | null;

  createdAt: string;

  totalDurationMinutes: number;
  averagePlaySeconds: number;

  phases:
    SetlistEventPlanPhase[];
};
