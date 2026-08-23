import type { Track } from "../types/track";

import {
  EMPTY_TRACK_FILTERS,
  type TrackFilters,
} from "../types/trackFilters";

function asString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string"
    ? value
    : fallback;
}

function asNullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function releaseYear(
  releaseDate:
    string | null | undefined,
): number | null {
  if (!releaseDate) {
    return null;
  }

  const direct =
    releaseDate.match(
      /^(\d{4})/,
    );

  if (direct) {
    const year =
      Number(direct[1]);

    return Number.isFinite(year)
      ? year
      : null;
  }

  const parsed =
    Date.parse(releaseDate);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed)
    .getFullYear();
}

function inRange(
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

function normalize(
  value:
    string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase();
}

export function sanitizeTrackFilters(
  value: unknown,
): TrackFilters {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return {
      ...EMPTY_TRACK_FILTERS,
    };
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  /*
   * Legacy compatibility:
   * - old releaseYear single value
   * - deprecated Folder / Camelot / Rating / Loudness
   *
   * Deprecated values are ignored.
   */
  const legacyReleaseYear =
    asNullableNumber(
      record.releaseYear,
    );

  return {
    country:
      asString(
        record.country,
        "all",
      ),

    musicalKey:
      asString(
        record.musicalKey,
        "all",
      ),

    keyword:
      asString(
        record.keyword,
        "",
      ),

    releaseYearMin:
      asNullableNumber(
        record.releaseYearMin,
      ) ??
      legacyReleaseYear,

    releaseYearMax:
      asNullableNumber(
        record.releaseYearMax,
      ) ??
      legacyReleaseYear,

    bpmMin:
      asNullableNumber(
        record.bpmMin,
      ),

    bpmMax:
      asNullableNumber(
        record.bpmMax,
      ),

    energyMin:
      asNullableNumber(
        record.energyMin,
      ),

    energyMax:
      asNullableNumber(
        record.energyMax,
      ),

    popularityMin:
      asNullableNumber(
        record.popularityMin,
      ),

    popularityMax:
      asNullableNumber(
        record.popularityMax,
      ),
  };
}

export function trackMatchesFilters(
  track: Track,
  filters: TrackFilters,
): boolean {
  if (
    filters.country !== "all" &&
    normalize(track.country) !==
      normalize(filters.country)
  ) {
    return false;
  }

  if (
    filters.musicalKey !== "all" &&
    normalize(track.musicalKey) !==
      normalize(filters.musicalKey)
  ) {
    return false;
  }

  const keyword =
    normalize(
      filters.keyword,
    );

  if (keyword) {
    const keywordMatch =
      track.keywords.some(
        (item) =>
          normalize(item)
            .includes(keyword),
      );

    if (!keywordMatch) {
      return false;
    }
  }

  if (
    !inRange(
      releaseYear(
        track.releaseDate,
      ),
      filters.releaseYearMin,
      filters.releaseYearMax,
    )
  ) {
    return false;
  }

  if (
    !inRange(
      track.tempo,
      filters.bpmMin,
      filters.bpmMax,
    )
  ) {
    return false;
  }

  if (
    !inRange(
      track.energy,
      filters.energyMin,
      filters.energyMax,
    )
  ) {
    return false;
  }

  if (
    !inRange(
      track.spotifyPopularity,
      filters.popularityMin,
      filters.popularityMax,
    )
  ) {
    return false;
  }

  return true;
}

export function countActiveTrackFilters(
  filters: TrackFilters,
): number {
  let count = 0;

  if (
    filters.country !== "all"
  ) {
    count += 1;
  }

  if (
    filters.musicalKey !== "all"
  ) {
    count += 1;
  }

  if (
    filters.keyword.trim()
  ) {
    count += 1;
  }

  if (
    filters.releaseYearMin !==
      null ||
    filters.releaseYearMax !==
      null
  ) {
    count += 1;
  }

  if (
    filters.bpmMin !== null ||
    filters.bpmMax !== null
  ) {
    count += 1;
  }

  if (
    filters.energyMin !== null ||
    filters.energyMax !== null
  ) {
    count += 1;
  }

  if (
    filters.popularityMin !==
      null ||
    filters.popularityMax !==
      null
  ) {
    count += 1;
  }

  return count;
}
