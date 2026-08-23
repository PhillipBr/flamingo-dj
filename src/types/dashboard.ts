import type { Playlist } from "./playlist";
import type { Track } from "./track";

export type DashboardTrackCard = {
  track: Track;
  title: string;
  artist: string;
  genre: string | null;
  popularity: number | null;
  releaseDate: string | null;
  playCount: number;
};

export type DashboardPlaylistRecentTrack = {
  track: Track;
  title: string;
  artist: string;
  artworkUrl: string | null;
  dateAdded: string | null;
};

export type DashboardPlaylistCard = {
  playlist: Playlist;
  trackCount: number;
  pinned: boolean;
  recentTracks: DashboardPlaylistRecentTrack[];
};

export type DashboardSessionSummary = {
  id: string;
  eventProfileName: string | null;
  currentSetName: string | null;
  endedAt: string | null;
  tracksPlayed: number;
  overallScore: number | null;
};

export type DashboardSummary = {
  totalTracks: number;
  totalPlaylists: number;
  currentSetTracks: number;
  currentSetName: string;

  quickPlaylists: DashboardPlaylistCard[];

  mostPlayedTracks: DashboardTrackCard[];
  newTracks: DashboardTrackCard[];
  suggestedTracks: DashboardTrackCard[];

  lastSession: DashboardSessionSummary | null;
};
