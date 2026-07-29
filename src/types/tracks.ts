export type Track = {
  id: string;
  externalSongId: string | null;

  title: string;
  artist: string;
  album: string | null;

  durationSeconds: number | null;
  popularity: number | null;
  releaseDate: string | null;

  genre: string | null;
  country: string | null;
  coverImageUrl: string | null;
  spotifyUrl: string | null;

  tempo: number | null;
  musicalKey: string | null;
  energy: number | null;
  overallVolume: number | null;

  keywords: string[];
  comments: string | null;
  folder: string | null;

  dateAdded: string;
};