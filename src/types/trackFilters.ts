export type TrackFilters = {
  country: string;
  musicalKey: string;
  keyword: string;

  releaseYearMin: number | null;
  releaseYearMax: number | null;

  bpmMin: number | null;
  bpmMax: number | null;

  energyMin: number | null;
  energyMax: number | null;

  popularityMin: number | null;
  popularityMax: number | null;
};

export const EMPTY_TRACK_FILTERS: TrackFilters = {
  country: "all",
  musicalKey: "all",
  keyword: "",

  releaseYearMin: null,
  releaseYearMax: null,

  bpmMin: null,
  bpmMax: null,

  energyMin: null,
  energyMax: null,

  popularityMin: null,
  popularityMax: null,
};
