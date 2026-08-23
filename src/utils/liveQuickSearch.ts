import type { Track } from "../types/track";

export type LiveQuickSearchFilters = {
  query: string;
  bpmMin: number | null;
  bpmMax: number | null;
  energyMin: number | null;
  energyMax: number | null;
  genre: string;
  musicalKey: string;
};

export const EMPTY_LIVE_QUICK_SEARCH_FILTERS: LiveQuickSearchFilters = {
  query: "",
  bpmMin: null,
  bpmMax: null,
  energyMin: null,
  energyMax: null,
  genre: "",
  musicalKey: "",
};

function normalizeText(
  value: unknown,
): string {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

function includesQuery(
  track: Track,
  query: string,
): boolean {
  const normalizedQuery =
    normalizeText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    track.title,
    track.artist,
    track.album,
    track.genre,
    track.country,
    track.musicalKey,
    ...(track.keywords ?? []),
  ]
    .map(normalizeText)
    .join(" ");

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((term) =>
      haystack.includes(term),
    );
}

function numberMatches(
  value: number | null,
  minimum: number | null,
  maximum: number | null,
): boolean {
  if (
    minimum === null &&
    maximum === null
  ) {
    return true;
  }

  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return false;
  }

  if (
    minimum !== null &&
    value < minimum
  ) {
    return false;
  }

  if (
    maximum !== null &&
    value > maximum
  ) {
    return false;
  }

  return true;
}

export function trackMatchesLiveQuickSearch(
  track: Track,
  filters: LiveQuickSearchFilters,
): boolean {
  if (
    !includesQuery(
      track,
      filters.query,
    )
  ) {
    return false;
  }

  if (
    !numberMatches(
      track.tempo,
      filters.bpmMin,
      filters.bpmMax,
    )
  ) {
    return false;
  }

  if (
    !numberMatches(
      track.energy,
      filters.energyMin,
      filters.energyMax,
    )
  ) {
    return false;
  }

  const genre =
    normalizeText(
      filters.genre,
    );

  if (
    genre &&
    !normalizeText(
      track.genre,
    ).includes(genre)
  ) {
    return false;
  }

  const musicalKey =
    normalizeText(
      filters.musicalKey,
    );

  if (
    musicalKey &&
    !normalizeText(
      track.musicalKey,
    ).includes(musicalKey)
  ) {
    return false;
  }

  return true;
}

export function searchLiveLibrary(
  tracks: readonly Track[],
  filters: LiveQuickSearchFilters,
  excludedTrackIds: ReadonlySet<string>,
  limit = 40,
): Track[] {
  return tracks
    .filter(
      (track) =>
        !excludedTrackIds.has(
          track.id,
        ) &&
        trackMatchesLiveQuickSearch(
          track,
          filters,
        ),
    )
    .sort(
      (left, right) => {
        const leftPopularity =
          left.spotifyPopularity ??
          -1;

        const rightPopularity =
          right.spotifyPopularity ??
          -1;

        if (
          rightPopularity !==
          leftPopularity
        ) {
          return (
            rightPopularity -
            leftPopularity
          );
        }

        const leftBpm =
          left.tempo ??
          Number.POSITIVE_INFINITY;

        const rightBpm =
          right.tempo ??
          Number.POSITIVE_INFINITY;

        return leftBpm - rightBpm;
      },
    )
    .slice(
      0,
      Math.max(1, limit),
    );
}
