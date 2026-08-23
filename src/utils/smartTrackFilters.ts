import type { Track } from "../types/track";
import type { SmartTrackFilters } from "../types/smartTrackFilters";

function normalizeKey(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase();
}

function releaseYear(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const match =
    value.match(
      /^(\d{4})/,
    );

  if (match) {
    const year =
      Number(match[1]);

    return Number.isFinite(year)
      ? year
      : null;
  }

  const parsed =
    Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed)
    .getFullYear();
}

function inNumberRange(
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

export function trackMatchesSmartFilters(
  track: Track,
  filters: SmartTrackFilters,
): boolean {
  const year =
    releaseYear(
      track.releaseDate,
    );

  if (
    !inNumberRange(
      year,
      filters.releaseYearFrom,
      filters.releaseYearTo,
    )
  ) {
    return false;
  }

  if (
    !inNumberRange(
      track.spotifyPopularity,
      filters.popularityMin,
      filters.popularityMax,
    )
  ) {
    return false;
  }

  if (
    !inNumberRange(
      track.tempo,
      filters.bpmMin,
      filters.bpmMax,
    )
  ) {
    return false;
  }

  if (
    !inNumberRange(
      track.energy,
      filters.energyMin,
      filters.energyMax,
    )
  ) {
    return false;
  }

  if (
    filters.musicalKeys.length > 0
  ) {
    const selected =
      new Set(
        filters.musicalKeys
          .map(
            normalizeKey,
          ),
      );

    if (
      !selected.has(
        normalizeKey(
          track.musicalKey,
        ),
      )
    ) {
      return false;
    }
  }

  return true;
}

export function countActiveSmartFilters(
  filters: SmartTrackFilters,
): number {
  let count = 0;

  if (
    filters.releaseYearFrom !==
    null
  ) {
    count += 1;
  }

  if (
    filters.releaseYearTo !==
    null
  ) {
    count += 1;
  }

  if (
    filters.popularityMin !==
    null
  ) {
    count += 1;
  }

  if (
    filters.popularityMax !==
    null
  ) {
    count += 1;
  }

  if (
    filters.musicalKeys.length >
    0
  ) {
    count += 1;
  }

  if (
    filters.bpmMin !==
    null
  ) {
    count += 1;
  }

  if (
    filters.bpmMax !==
    null
  ) {
    count += 1;
  }

  if (
    filters.energyMin !==
    null
  ) {
    count += 1;
  }

  if (
    filters.energyMax !==
    null
  ) {
    count += 1;
  }

  return count;
}
