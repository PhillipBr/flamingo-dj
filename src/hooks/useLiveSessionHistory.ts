import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  AudienceResponseEntry,
} from "../types/audienceResponse";

import type {
  CurrentSet,
} from "../types/setlist";

import type {
  EventProfile,
} from "../types/eventProfile";

import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

import type {
  LivePerformanceRecord,
} from "../types/livePerformance";

import type {
  LiveSession,
} from "../types/liveSession";

import type {
  Track,
} from "../types/track";

import {
  buildLivePerformanceRecord,
} from "../utils/livePerformanceEngine";

import {
  loadLivePerformanceHistory,
  saveLivePerformanceHistory,
} from "../utils/livePerformanceStorage";

type ArchiveSessionInput = {
  session:
    LiveSession;

  currentTrack:
    Track | null;

  tracks:
    readonly Track[];

  currentSet:
    CurrentSet;

  eventPlan:
    SetlistEventPlan | null;

  eventProfile:
    EventProfile | null;

  audienceResponses:
    readonly AudienceResponseEntry[];
};

export function useLiveSessionHistory() {
  const [
    history,
    setHistory,
  ] =
    useState<LivePerformanceRecord[]>(
      loadLivePerformanceHistory,
    );

  const [
    selectedRecord,
    setSelectedRecord,
  ] =
    useState<LivePerformanceRecord | null>(
      null,
    );

  useEffect(() => {
    saveLivePerformanceHistory(
      history,
    );
  }, [history]);

  const archiveSession =
    useCallback(
      (
        input:
          ArchiveSessionInput,
      ) => {
        const record =
          buildLivePerformanceRecord({
            ...input,
            endedAt:
              new Date().toISOString(),
          });

        setHistory(
          (current) => [
            record,
            ...current,
          ].slice(0, 100),
        );

        setSelectedRecord(
          record,
        );

        return record;
      },
      [],
    );

  const deleteRecord =
    useCallback(
      (
        recordId:
          string,
      ) => {
        setHistory(
          (current) =>
            current.filter(
              (record) =>
                record.id !==
                recordId,
            ),
        );

        setSelectedRecord(
          (current) =>
            current?.id ===
            recordId
              ? null
              : current,
        );
      },
      [],
    );

  return {
    history,
    selectedRecord,
    setSelectedRecord,
    archiveSession,
    deleteRecord,
  };
}
