export type SmartTrackFilters = {
  releaseYearFrom: number | null;
  releaseYearTo: number | null;
  popularityMin: number | null;
  popularityMax: number | null;
  musicalKeys: string[];
  bpmMin: number | null;
  bpmMax: number | null;
  energyMin: number | null;
  energyMax: number | null;
};

export const EMPTY_SMART_TRACK_FILTERS: SmartTrackFilters = {
  releaseYearFrom: null,
  releaseYearTo: null,
  popularityMin: null,
  popularityMax: null,
  musicalKeys: [],
  bpmMin: null,
  bpmMax: null,
  energyMin: null,
  energyMax: null,
};
