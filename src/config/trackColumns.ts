import type { TrackColumnDefinition, TrackColumnId } from "../types/trackColumn";

export const TRACK_COLUMNS: TrackColumnDefinition[] = [
  { id: "artwork", label: "Artwork", locked: false, defaultVisible: false },
  { id: "title", label: "Title", locked: true, defaultVisible: true },
  { id: "artist", label: "Artist", locked: true, defaultVisible: true },
  { id: "album", label: "Album", locked: false, defaultVisible: false },
  { id: "tempo", label: "BPM", locked: false, defaultVisible: true },
  { id: "musicalKey", label: "Key", locked: false, defaultVisible: true },
  { id: "camelot", label: "Camelot", locked: false, defaultVisible: false },
  { id: "energy", label: "Energy", locked: false, defaultVisible: true },
  { id: "spotifyPopularity", label: "Popularity", locked: false, defaultVisible: true },
  { id: "genre", label: "Genre", locked: false, defaultVisible: false },
  { id: "country", label: "Country", locked: false, defaultVisible: false },
  { id: "durationSeconds", label: "Duration", locked: false, defaultVisible: true },
  { id: "releaseDate", label: "Release Date", locked: false, defaultVisible: true },
  { id: "overallVolume", label: "Overall Volume", locked: false, defaultVisible: false },
  { id: "rating", label: "Rating", locked: false, defaultVisible: false },
  { id: "folder", label: "Folder", locked: false, defaultVisible: false },
  { id: "dateAdded", label: "Date Added", locked: false, defaultVisible: false },
];

export const DEFAULT_VISIBLE_TRACK_COLUMNS: TrackColumnId[] =
  TRACK_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.id);

export const LOCKED_TRACK_COLUMNS: TrackColumnId[] =
  TRACK_COLUMNS.filter((column) => column.locked).map((column) => column.id);
