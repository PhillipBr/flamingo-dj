import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { Track } from "../types/track";
import type { TrackColumnId } from "../types/trackColumn";
import { loadTrackExtras } from "../utils/trackStorage";

const CORE_COLUMNS = new Set<TrackColumnId>([
  "title",
  "artist",
  "durationSeconds",
  "spotifyPopularity",
  "musicalKey",
  "tempo",
  "energy",
  "releaseDate",
  "camelot",
]);

const EXTRA_FILTER_KEYS = [
  "genre", "country", "folder", "keyword", "album",
  "rating", "volume", "dateadded", "date_added",
];

function meaningful(value: unknown): boolean {
  if (value == null || value === "" || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(meaningful);
  }
  return true;
}

export function filtersRequireExtra(filters: unknown): boolean {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return false;
  }

  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (
      EXTRA_FILTER_KEYS.some((item) => normalized.includes(item)) &&
      meaningful(value)
    ) {
      return true;
    }
  }
  return false;
}

type Options = {
  tracks: Track[];
  setTracks: Dispatch<SetStateAction<Track[]>>;
  visibleColumns: TrackColumnId[];
  playlistTrackIds?: string[];
  detailTrackId?: string | null;
  genreFilter?: string;
  advancedFilters?: unknown;
  searchTerm?: string;
};

export function useLazyTrackExtras({
  tracks,
  setTracks,
  visibleColumns,
  playlistTrackIds,
  detailTrackId = null,
  genreFilter = "all",
  advancedFilters = null,
  searchTerm = "",
}: Options): void {
  const hydratedIdsRef = useRef(new Set<string>());
  const loadingIdsRef = useRef(new Set<string>());

  const visibleExtraColumns = visibleColumns.filter(
    (columnId) => !CORE_COLUMNS.has(columnId),
  );

  const wholePlaylistNeedsExtra =
    visibleExtraColumns.length > 0 ||
    genreFilter !== "all" ||
    filtersRequireExtra(advancedFilters) ||
    searchTerm.trim().length > 0;

  const playlistIdsKey = playlistTrackIds?.join("|") ?? "";
  const visibleExtraColumnsKey = visibleExtraColumns.join("|");

  useEffect(() => {
    const requestedIds = new Set<string>();

    if (wholePlaylistNeedsExtra) {
      const sourceIds =
        playlistTrackIds?.length
          ? playlistTrackIds
          : tracks.map((track) => track.id);

      sourceIds.forEach((id) => requestedIds.add(String(id)));
    }

    if (detailTrackId) requestedIds.add(String(detailTrackId));

    const missingIds = [...requestedIds].filter(
      (id) =>
        !hydratedIdsRef.current.has(id) &&
        !loadingIdsRef.current.has(id),
    );

    if (!missingIds.length) return;

    console.info("[FlamingoDJ] Extra hydration requested", {
      columns: visibleExtraColumns,
      tracks: missingIds.length,
    });

    missingIds.forEach((id) => loadingIdsRef.current.add(id));
    let active = true;

    void loadTrackExtras(tracks, missingIds)
      .then((hydratedTracks) => {
        if (!active) {
          missingIds.forEach((id) => loadingIdsRef.current.delete(id));
          return;
        }

        const wanted = new Set(missingIds);
        const hydratedById = new Map<string, Track>();

        hydratedTracks.forEach((track) => {
          if (wanted.has(track.id)) hydratedById.set(track.id, track);
        });

        setTracks((currentTracks) =>
          currentTracks.map((track) => hydratedById.get(track.id) ?? track),
        );

        missingIds.forEach((id) => {
          hydratedIdsRef.current.add(id);
          loadingIdsRef.current.delete(id);
        });

        console.info("[FlamingoDJ] Extra hydration completed", {
          requested: missingIds.length,
          returned: hydratedById.size,
        });
      })
      .catch((error) => {
        missingIds.forEach((id) => loadingIdsRef.current.delete(id));
        console.error("[FlamingoDJ] Unable to lazy-load track extras", error);
      });

    return () => {
      active = false;
    };
  }, [
    wholePlaylistNeedsExtra,
    detailTrackId,
    playlistIdsKey,
    visibleExtraColumnsKey,
    setTracks,
  ]);
}
