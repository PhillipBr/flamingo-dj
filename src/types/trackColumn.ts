export type TrackColumnId =
  | "artwork"
  | "title"
  | "artist"
  | "album"
  | "tempo"
  | "musicalKey"
  | "camelot"
  | "energy"
  | "spotifyPopularity"
  | "genre"
  | "country"
  | "durationSeconds"
  | "releaseDate"
  | "overallVolume"
  | "rating"
  | "folder"
  | "dateAdded";

export type TrackColumnDefinition = {
  id: TrackColumnId;
  label: string;
  locked: boolean;
  defaultVisible: boolean;
};