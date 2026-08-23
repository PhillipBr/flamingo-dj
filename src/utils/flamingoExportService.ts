import type {
  ExportFormat,
  ExportResult,
} from "../types/flamingoBackup";

import {
  buildTimestampForFilename,
  downloadTextFile,
} from "./downloadFile";

import {
  objectsToCsv,
} from "./exportCsv";

const PERFORMANCE_HISTORY_KEY =
  "flamingo-dj-live-performance-history";
const CURRENT_SET_KEY =
  "flamingo-dj-current-set";
const EVENT_PLAN_KEY =
  "flamingo-dj-event-plan";

function readJsonStorage<T>(
  key: string,
  fallback: T,
): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function downloadRows({
  basename,
  rows,
  format,
}: {
  basename: string;
  rows: readonly Record<string, unknown>[];
  format: ExportFormat;
}): ExportResult {
  const timestamp = buildTimestampForFilename();

  if (format === "csv") {
    const filename = `${basename}_${timestamp}.csv`;

    downloadTextFile({
      filename,
      content: objectsToCsv(rows),
      mimeType: "text/csv;charset=utf-8",
    });

    return {
      filename,
      rowCount: rows.length,
    };
  }

  const filename = `${basename}_${timestamp}.json`;

  downloadTextFile({
    filename,
    content: JSON.stringify(rows, null, 2),
    mimeType: "application/json;charset=utf-8",
  });

  return {
    filename,
    rowCount: rows.length,
  };
}

export function exportPerformanceHistory(
  format: ExportFormat,
): ExportResult {
  const history = readJsonStorage<unknown[]>(
    PERFORMANCE_HISTORY_KEY,
    [],
  );

  const rows = history
    .filter(
      (
        record,
      ): record is Record<string, unknown> =>
        typeof record === "object" &&
        record !== null &&
        !Array.isArray(record),
    )
    .map((record) => {
      const scores =
        typeof record.scores === "object" &&
        record.scores !== null &&
        !Array.isArray(record.scores)
          ? record.scores as Record<string, unknown>
          : {};

      return {
        id: record.id,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        currentSetName: record.currentSetName,
        eventPlanName: record.eventPlanName,
        eventProfileName: record.eventProfileName,
        eventProfileType: record.eventProfileType,
        tracksPlayed:
          Array.isArray(record.tracks)
            ? record.tracks.length
            : 0,
        audienceResponses:
          Array.isArray(record.audienceEntries)
            ? record.audienceEntries.length
            : 0,
        overallScore: scores.overall,
        transitionFlow: scores.transitionFlow,
        energyJourney: scores.energyJourney,
        eventPlan: scores.eventPlan,
        crowdResponse: scores.crowdResponse,
        styleVariety: scores.styleVariety,
      };
    });

  return downloadRows({
    basename: "flamingo-performance-history",
    rows,
    format,
  });
}

function extractTrackRows(
  currentSet: unknown,
): Record<string, unknown>[] {
  if (
    typeof currentSet !== "object" ||
    currentSet === null ||
    Array.isArray(currentSet)
  ) {
    return [];
  }

  const record = currentSet as Record<string, unknown>;

  const possibleTracks =
    Array.isArray(record.tracks)
      ? record.tracks
      : Array.isArray(record.items)
        ? record.items
        : [];

  return possibleTracks
    .map((item, index): Record<string, unknown> | null => {
      if (
        typeof item !== "object" ||
        item === null ||
        Array.isArray(item)
      ) {
        return null;
      }

      const value = item as Record<string, unknown>;

      const nestedTrack =
        typeof value.track === "object" &&
        value.track !== null &&
        !Array.isArray(value.track)
          ? value.track as Record<string, unknown>
          : value;

      return {
        position: index + 1,
        trackId:
          nestedTrack.id ??
          nestedTrack.trackId ??
          value.trackId,
        title: nestedTrack.title,
        artist: nestedTrack.artist,
        album: nestedTrack.album,
        bpm:
          nestedTrack.tempo ??
          nestedTrack.bpm,
        key:
          nestedTrack.musicalKey ??
          nestedTrack.key,
        camelot: nestedTrack.camelot,
        energy: nestedTrack.energy,
        genre: nestedTrack.genre,
        popularity: nestedTrack.popularity,
        duration:
          nestedTrack.duration ??
          nestedTrack.Duration,
      };
    })
    .filter(
      (
        row,
      ): row is Record<string, unknown> =>
        row !== null,
    );
}

export function exportCurrentSet(
  format: ExportFormat,
): ExportResult {
  const currentSet = readJsonStorage<unknown>(
    CURRENT_SET_KEY,
    null,
  );

  return downloadRows({
    basename: "flamingo-current-set",
    rows: extractTrackRows(currentSet),
    format,
  });
}

export function exportEventPlan(
  format: ExportFormat,
): ExportResult {
  const eventPlan = readJsonStorage<unknown>(
    EVENT_PLAN_KEY,
    null,
  );

  let rows: Record<string, unknown>[] = [];

  if (
    typeof eventPlan === "object" &&
    eventPlan !== null &&
    !Array.isArray(eventPlan)
  ) {
    const record = eventPlan as Record<string, unknown>;

    const blocks =
      Array.isArray(record.blocks)
        ? record.blocks
        : Array.isArray(record.sections)
          ? record.sections
          : [];

    rows = blocks
      .map((block, index): Record<string, unknown> | null => {
        if (
          typeof block !== "object" ||
          block === null ||
          Array.isArray(block)
        ) {
          return null;
        }

        return {
          position: index + 1,
          ...(block as Record<string, unknown>),
        };
      })
      .filter(
        (
          row,
        ): row is Record<string, unknown> =>
          row !== null,
      );
  }

  return downloadRows({
    basename: "flamingo-event-plan",
    rows,
    format,
  });
}
