import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  AudienceResponseEntry,
  AudienceResponseLevel,
} from "../types/audienceResponse";

import {
  createAudienceResponseEntry,
  loadAudienceResponses,
  saveAudienceResponses,
} from "../utils/audienceResponseStorage";

type UseAudienceResponseResult = {
  audienceResponses:
    AudienceResponseEntry[];

  activeAudienceResponse:
    AudienceResponseLevel | null;

  setAudienceResponse: (
    level:
      AudienceResponseLevel,
  ) => void;

  clearAudienceResponses:
    () => void;
};

export function useAudienceResponse(
  currentTrackId:
    string | null,
): UseAudienceResponseResult {
  const [
    audienceResponses,
    setAudienceResponses,
  ] =
    useState<AudienceResponseEntry[]>(
      loadAudienceResponses,
    );

  useEffect(() => {
    saveAudienceResponses(
      audienceResponses,
    );
  }, [audienceResponses]);

  const setAudienceResponse =
    useCallback(
      (
        level:
          AudienceResponseLevel,
      ) => {
        setAudienceResponses(
          (current) => [
            ...current,
            createAudienceResponseEntry(
              level,
              currentTrackId,
            ),
          ].slice(-100),
        );
      },
      [currentTrackId],
    );

  const clearAudienceResponses =
    useCallback(() => {
      setAudienceResponses(
        [],
      );
    }, []);

  const activeAudienceResponse =
    audienceResponses[
      audienceResponses.length - 1
    ]?.level ??
    null;

  return {
    audienceResponses,
    activeAudienceResponse,
    setAudienceResponse,
    clearAudienceResponses,
  };
}
