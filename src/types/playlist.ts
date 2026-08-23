export type Playlist = {
  id: string;
  name: string;
  description: string;
  category: string;
  trackIds: string[];
  updatedAt: string;
  keywords?: string[];
};

export type PlaylistFormValues = {
  name: string;
  description: string;
  category: string;
};
