export type ArtistDetails = {
  artistId: string | null;
  imageUrl: string | null;
  genres: string[];
  country: string | null;
  spotifyUrl: string | null;
  musicBrainzId: string | null;
  popularity: number | null;
  followers: number | null;
};

export type Track = {
  id: string;
  externalSongId: string | null;

  title: string;
  artist: string;
  album: string | null;

  artworkUrl: string | null;

  durationSeconds: number | null;

  releaseDate: string | null;
  genre: string | null;
  country: string | null;

  spotifyPopularity: number | null;
  spotifyUrl: string | null;

  tempo: number | null;
  musicalKey: string | null;
  energy: number | null;
  overallVolume: number | null;

  cuePoints: string | null;

  keywords: string[];

  comments: string | null;
  folder: string | null;
  dateAdded: string | null;

  rating: number | null;

  artistDetails: ArtistDetails | null;
};