export type PlayedEntry = {
  playOrder: number;
  songId: string;
  trackId?: string;
  title: string;
  artist: string;
  playlistName: string;
  playedAt: string;
};
export type PlayedSession = {
  active: boolean;
  startedAt: string | null;
  playedIds: string[];
  entries: PlayedEntry[];
};
