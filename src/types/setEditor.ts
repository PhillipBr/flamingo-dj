export type SetEditorMode =
  | "insert"
  | "replace";

export type SetEditorRequest = {
  mode: SetEditorMode;

  /*
   * For insert:
   * insertIndex is the position where the new item
   * will be inserted.
   *
   * For replace:
   * insertIndex is the position of the item that
   * will be replaced.
   */
  insertIndex: number;
};

export type SetEditorSuggestion<TTrack> = {
  track: TTrack;

  percentage: number;

  bpmPriorityScore: number;
  camelotScore: number;
  energyScore: number;
  compatibilityScore: number;

  previousScore: number | null;
  nextScore: number | null;

  bpm: number | null;
  musicalKey: string | null;
  camelot: string | null;
};
