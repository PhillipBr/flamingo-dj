import { mockTracks } from "./mockTracks";

import type { Playlist } from "../types/playlist";

const allTrackIds = mockTracks.map(
  (track) => track.id,
);

const firstHalfLength = Math.max(
  1,
  Math.ceil(
    allTrackIds.length / 2,
  ),
);

const secondHalfStart = Math.max(
  0,
  Math.floor(
    allTrackIds.length / 2,
  ),
);

export const mockPlaylists: Playlist[] = [
  {
    id: "deep-house",
    name: "Deep House",
    description:
      "Warm grooves, melodic tracks and club selections.",
    updatedAt: "Today",
    category: "House",
    trackIds: [...allTrackIds],
  },
  {
    id: "reggaeton-trends",
    name: "Reggaeton Trends",
    description:
      "Current Latin and reggaeton tracks for active sets.",
    updatedAt: "Yesterday",
    category: "Latin",
    trackIds: allTrackIds.slice(
      0,
      firstHalfLength,
    ),
  },
  {
    id: "bachata-night",
    name: "Bachata Night",
    description:
      "Bachata classics, modern releases and dancefloor tracks.",
    updatedAt: "July 26",
    category: "Bachata",
    trackIds: allTrackIds.slice(
      secondHalfStart,
    ),
  },
  {
    id: "warm-up",
    name: "Warm Up",
    description:
      "Low and medium energy tracks for opening sets.",
    updatedAt: "July 24",
    category: "Mixed",
    trackIds: allTrackIds.slice(
      0,
      Math.min(
        3,
        allTrackIds.length,
      ),
    ),
  },
];