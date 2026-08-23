import {
  useMemo,
} from "react";

import type {
  AudienceResponseEntry,
} from "../types/audienceResponse";

import type {
  CurrentSet,
} from "../types/setlist";

import type {
  SetlistEventPlan,
} from "../types/setlistGenerator";

import type {
  Track,
} from "../types/track";

import {
  buildAudienceEmergencyDecision,
} from "../utils/audienceEmergencyEngine";

import {
  buildLiveAdaptiveDirection,
} from "../utils/liveAdaptiveDirectionEngine";

type UseLiveAdaptiveInput = {
  currentTrack:
    Track | null;

  recentTracks:
    readonly Track[];

  tracks:
    readonly Track[];

  excludedTrackIds:
    ReadonlySet<string>;

  currentSet:
    CurrentSet;

  currentIndex:
    number;

  eventPlan:
    SetlistEventPlan | null;

  audienceResponses:
    readonly AudienceResponseEntry[];
};

export function useLiveAdaptive({
  currentTrack,
  recentTracks,
  tracks,
  excludedTrackIds,
  currentSet,
  currentIndex,
  eventPlan,
  audienceResponses,
}: UseLiveAdaptiveInput) {
  const liveAdaptiveDirection =
    useMemo(
      () =>
        buildLiveAdaptiveDirection(
          currentTrack,
          recentTracks,
          tracks,
          excludedTrackIds,
          currentSet,
          currentIndex,
          eventPlan,
        ),
      [
        currentSet,
        currentIndex,
        currentTrack,
        eventPlan,
        excludedTrackIds,
        recentTracks,
        tracks,
      ],
    );

  const audienceEmergencyDecision =
    useMemo(
      () =>
        buildAudienceEmergencyDecision(
          currentTrack,
          tracks,
          excludedTrackIds,
          audienceResponses,
          liveAdaptiveDirection,
        ),
      [
        audienceResponses,
        currentTrack,
        excludedTrackIds,
        liveAdaptiveDirection,
        tracks,
      ],
    );

  return {
    liveAdaptiveDirection,
    audienceEmergencyDecision,
  };
}
