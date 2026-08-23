export type TransitionSeverity =
  | "excellent"
  | "good"
  | "warning"
  | "poor";

export type SetTransitionIssueType =
  | "bpm"
  | "energy"
  | "camelot"
  | "genre"
  | "artist"
  | "popularity";

export type SetTransitionIssue = {
  type: SetTransitionIssueType;
  label: string;
  detail: string;
};

export type SetTransitionAnalysis = {
  index: number;

  sourceTrackId: string;
  candidateTrackId: string;

  score: number;
  percentage: number;
  severity: TransitionSeverity;

  bpmDifference: number | null;
  energyDifference: number | null;

  sourceCamelot: string | null;
  candidateCamelot: string | null;

  genreScore: number;
  camelotScore: number;
  bpmScore: number;
  energyScore: number;
  popularityScore: number;

  issues: SetTransitionIssue[];
};

export type SetAnalysisSummary = {
  transitionCount: number;
  averageScore: number;
  averagePercentage: number;

  excellentCount: number;
  goodCount: number;
  warningCount: number;
  poorCount: number;

  repeatedArtistWarnings: number;
  weakGenreTransitions: number;
  weakCamelotTransitions: number;
  largeBpmJumps: number;
  largeEnergyJumps: number;
};

export type SetAnalysisResult = {
  transitions: SetTransitionAnalysis[];
  summary: SetAnalysisSummary;
};

export type BridgeTrackSuggestion<TTrack> = {
  track: TTrack;

  sourceToBridgeScore: number;
  bridgeToNextScore: number;

  combinedScore: number;
  percentage: number;
};
