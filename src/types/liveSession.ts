export type LiveSession = {
  currentIndex: number;

  startedAt: string | null;
  pausedAt: string | null;
  accumulatedPausedMs: number;
  isRunning: boolean;

  playedTrackIds: string[];
};

export type LiveTransition = {
  score: number;
  percentage: number;

  bpmDifference: number | null;
  energyDifference: number | null;

  sourceCamelot: string | null;
  candidateCamelot: string | null;

  genreScore: number;
  camelotScore: number;
  bpmScore: number;
  energyScore: number;

  label:
    | "Excellent"
    | "Good"
    | "Warning"
    | "Poor";
};

export type LiveCrossStyleGroup<TTrack> = {
  style: string;
  tracks: Array<{
    track: TTrack;
    percentage: number;
    score: number;
  }>;
};
