import type { Track } from "./track";

export type PlaylistRepairIssueType =
  | "transition"
  | "bpm"
  | "energy"
  | "camelot"
  | "genre"
  | "artist";

export type PlaylistRepairIssue = {
  id: string;
  type: PlaylistRepairIssueType;

  severity:
    | "warning"
    | "poor";

  position: number;

  sourceTrack: Track;
  nextTrack: Track;

  percentage: number;

  title: string;
  detail: string;
};

export type PlaylistRepairSuggestion = {
  issueId: string;

  bridgeTrack: Track | null;

  bridgePercentage: number | null;
};

export type PlaylistRepairSummary = {
  healthScore: number;

  transitionCount: number;

  excellentCount: number;
  goodCount: number;
  warningCount: number;
  poorCount: number;

  bpmProblems: number;
  energyProblems: number;
  camelotProblems: number;
  genreProblems: number;
  artistProblems: number;
};

export type PlaylistRepairResult = {
  summary: PlaylistRepairSummary;

  issues: PlaylistRepairIssue[];

  suggestions:
    PlaylistRepairSuggestion[];
};
