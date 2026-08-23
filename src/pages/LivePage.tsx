import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Clock3,
  FolderOpen,
  Gauge,
  History,
  Library,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  SkipForward,
  Square,
  Sparkles,
  Zap,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import LiveSetWorkspace from "../components/live/LiveSetWorkspace";

import {
  useAudienceResponse,
} from "../hooks/useAudienceResponse";

import {
  useLiveAdaptive,
} from "../hooks/useLiveAdaptive";

import {
  useStoredCurrentSet,
} from "../hooks/useStoredCurrentSet";

import {
  useStoredEventPlan,
} from "../hooks/useStoredEventPlan";

import {
  useLiveSessionHistory,
} from "../hooks/useLiveSessionHistory";

import {
  useEventProfiles,
} from "../hooks/useEventProfiles";

import {
  usePreEventIntelligence,
} from "../hooks/usePreEventIntelligence";

import {
  buildPreEventGeneratorPreset,
} from "../utils/preEventGeneratorPresetBuilder";

import {
  savePreEventGeneratorPreset,
} from "../utils/preEventGeneratorStorage";

import type { Track } from "../types/track";

import {
  createCurrentSetItem,
} from "../utils/currentSetStorage";

import {
  loadTracks,
} from "../utils/trackStorage";

import {
  loadPlaylists,
} from "../utils/playlistStorage";

import {
  getTrackCamelot,
} from "../utils/matchSongs";

import {
  analyzeLiveTransition,
  getLiveCrossStyleGroups,
  getLiveSuggestions,
} from "../utils/liveMode";

import {
  loadLiveSession,
  resetLiveSession,
  saveLiveSession,
} from "../utils/liveSessionStorage";

import {
  buildLibraryTrackSourceMap,
  getLibraryCoverage,
  getPrimaryTrackSource,
  getTrackSources,
} from "../utils/liveLibrarySources";

import {
  buildDjAssistantInsight,
} from "../utils/djAssistantEngine";

import {
  buildSmartRoutePlan,
} from "../utils/smartRouteEngine";

import type {
  SmartRoute,
} from "../types/smartRoute";

import type {
  LiveSession,
} from "../types/liveSession";

import "./LivePage.css";
import "./LiveWholeLibrary.css";

import LiveQuickSearch from "../components/live/LiveQuickSearch";
import DjAssistantPanel from "../components/live/DjAssistantPanel";
import SmartRoutePanel from "../components/live/SmartRoutePanel";
import LiveAdaptiveDirectionPanel from "../components/live/LiveAdaptiveDirectionPanel";
import AudienceResponsePanel from "../components/live/AudienceResponsePanel";
import PerformanceSummaryPanel from "../components/live/PerformanceSummaryPanel";
import EventProfileSelector from "../components/live/EventProfileSelector";
import PreEventBriefPanel from "../components/live/PreEventBriefPanel";
import CloudSyncPanel from "../components/live/CloudSyncPanel";
import BackupExportPanel from "../components/live/BackupExportPanel";
import ProductionDiagnosticsPanel from "../components/live/ProductionDiagnosticsPanel";
import FinalQaPanel from "../components/live/FinalQaPanel";

function formatStyle(
  value: string,
): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function formatElapsed(
  session: LiveSession,
  nowMs: number,
): string {
  if (!session.startedAt) {
    return "00:00";
  }

  const startedMs =
    new Date(
      session.startedAt,
    ).getTime();

  if (!Number.isFinite(startedMs)) {
    return "00:00";
  }

  const pauseEndMs =
    !session.isRunning &&
    session.pausedAt
      ? new Date(
          session.pausedAt,
        ).getTime()
      : nowMs;

  const elapsedMs =
    Math.max(
      0,
      pauseEndMs -
        startedMs -
        session.accumulatedPausedMs,
    );

  const totalSeconds =
    Math.floor(
      elapsedMs / 1000,
    );

  const hours =
    Math.floor(
      totalSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60,
    );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours
      .toString()
      .padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes
    .toString()
    .padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function getArtwork(
  track: Track | null,
): string | null {
  return track?.artworkUrl ?? null;
}

function TrackHero({
  label,
  track,
}: {
  label: string;
  track: Track | null;
}) {
  const artwork =
    getArtwork(track);

  return (
    <article className="live-track-card">
      <span className="live-track-card__label">
        {label}
      </span>

      {track ? (
        <>
          <div className="live-track-card__artwork">
            {artwork ? (
              <img
                src={artwork}
                alt=""
              />
            ) : (
              <Music2 size={42} />
            )}
          </div>

          <div className="live-track-card__copy">
            <h2>{track.title}</h2>
            <p>{track.artist}</p>

            <div className="live-track-card__metadata">
              <span>
                <Gauge size={14} />
                {track.tempo !== null
                  ? `${Math.round(
                      track.tempo,
                    )} BPM`
                  : "— BPM"}
              </span>

              <span>
                Key{" "}
                {track.musicalKey ??
                  "—"}
              </span>

              <span>
                Camelot{" "}
                {getTrackCamelot(
                  track,
                ) ?? "—"}
              </span>

              <span>
                <Zap size={14} />
                Energy{" "}
                {track.energy ?? "—"}
              </span>

              <span>
                Pop{" "}
                {track.spotifyPopularity ??
                  "—"}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="live-track-card__empty">
          <Music2 size={34} />
          <strong>No track</strong>
        </div>
      )}
    </article>
  );
}

export default function LivePage() {
  const [tracks] =
    useState<Track[]>(
      loadTracks,
    );

  const [playlists] =
    useState(
      loadPlaylists,
    );

  const eventPlan =
    useStoredEventPlan();

  const {
    profiles:
      eventProfiles,
    activeProfile:
      activeEventProfile,
    setActiveProfileId:
      setActiveEventProfileId,
    addProfile:
      addEventProfile,
    deleteProfile:
      deleteEventProfile,
  } =
    useEventProfiles();

  const preEventIntelligence =
    usePreEventIntelligence(
      activeEventProfile,
    );

  const [
    currentSet,
    setCurrentSet,
  ] =
    useStoredCurrentSet();

  const [
    session,
    setSession,
  ] =
    useState<LiveSession>(
      loadLiveSession,
    );

  const [
    nowMs,
    setNowMs,
  ] =
    useState(
      Date.now(),
    );

  const [
    isPerformanceSummaryOpen,
    setIsPerformanceSummaryOpen,
  ] =
    useState(false);

  const {
    history:
      performanceHistory,
    selectedRecord:
      selectedPerformanceRecord,
    setSelectedRecord:
      setSelectedPerformanceRecord,
    archiveSession,
    deleteRecord:
      deletePerformanceRecord,
  } =
    useLiveSessionHistory();

  useEffect(() => {
    saveLiveSession(session);
  }, [session]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () =>
          setNowMs(
            Date.now(),
          ),
        1000,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, []);

  const trackById =
    useMemo(
      () =>
        new Map(
          tracks.map(
            (track) => [
              track.id,
              track,
            ],
          ),
        ),
      [tracks],
    );

  const sourceMap =
    useMemo(
      () =>
        buildLibraryTrackSourceMap(
          playlists,
        ),
      [playlists],
    );

  const libraryCoverage =
    useMemo(
      () =>
        getLibraryCoverage(
          tracks,
          sourceMap,
        ),
      [sourceMap, tracks],
    );

  const setTracks =
    useMemo(
      () =>
        currentSet.items
          .map(
            (item) =>
              trackById.get(
                item.trackId,
              ) ?? null,
          )
          .filter(
            (
              track,
            ): track is Track =>
              track !== null,
          ),
      [
        currentSet.items,
        trackById,
      ],
    );

  const safeCurrentIndex =
    Math.min(
      session.currentIndex,
      Math.max(
        setTracks.length - 1,
        0,
      ),
    );

  const currentTrack =
    setTracks[
      safeCurrentIndex
    ] ?? null;

  const nextTrack =
    setTracks[
      safeCurrentIndex + 1
    ] ?? null;

  const transition =
    analyzeLiveTransition(
      currentTrack,
      nextTrack,
    );

  const excludedTrackIds =
    useMemo(
      () =>
        new Set([
          ...session.playedTrackIds,
          ...(currentTrack
            ? [currentTrack.id]
            : []),
        ]),
      [
        currentTrack,
        session.playedTrackIds,
      ],
    );

  /*
   * IMPORTANT:
   * "tracks" is loadTracks(), the same app-wide storage used by the
   * playlist pages. Recommendations therefore search the complete
   * loaded DJ library, not only currentSet or the active playlist.
   */
  const suggestions =
    useMemo(
      () =>
        getLiveSuggestions(
          currentTrack,
          tracks,
          excludedTrackIds,
          5,
        ),
      [
        currentTrack,
        excludedTrackIds,
        tracks,
      ],
    );

  const crossStyleGroups =
    useMemo(
      () =>
        getLiveCrossStyleGroups(
          currentTrack,
          tracks,
          excludedTrackIds,
          3,
          5,
        ),
      [
        currentTrack,
        excludedTrackIds,
        tracks,
      ],
    );

  const recentTracks =
    useMemo(
      () => {
        const historyTracks =
          session.playedTrackIds
            .map(
              (trackId) =>
                trackById.get(
                  trackId,
                ) ?? null,
            )
            .filter(
              (
                track,
              ): track is Track =>
                track !== null,
            );

        return [
          ...historyTracks,
          ...(currentTrack
            ? [currentTrack]
            : []),
        ].slice(-8);
      },
      [
        currentTrack,
        session.playedTrackIds,
        trackById,
      ],
    );

  const djAssistantInsight =
    useMemo(
      () =>
        buildDjAssistantInsight(
          currentTrack,
          recentTracks,
          tracks,
          excludedTrackIds,
        ),
      [
        currentTrack,
        excludedTrackIds,
        recentTracks,
        tracks,
      ],
    );

  const smartRoutePlan =
    useMemo(
      () =>
        buildSmartRoutePlan(
          currentTrack,
          tracks,
          excludedTrackIds,
          5,
        ),
      [
        currentTrack,
        excludedTrackIds,
        tracks,
      ],
    );

  const {
    audienceResponses,
    activeAudienceResponse,
    setAudienceResponse,
  } =
    useAudienceResponse(
      currentTrack?.id ??
        null,
    );

  const {
    liveAdaptiveDirection,
    audienceEmergencyDecision,
  } =
    useLiveAdaptive({
      currentTrack,
      recentTracks,
      tracks,
      excludedTrackIds,
      currentSet,
      currentIndex:
        safeCurrentIndex,
      eventPlan,
      audienceResponses,
    });

  const playedTracks =
    session.playedTrackIds
      .map(
        (trackId) =>
          trackById.get(
            trackId,
          ) ?? null,
      )
      .filter(
        (
          track,
        ): track is Track =>
          track !== null,
      );

  const upcomingTracks =
    setTracks.slice(
      safeCurrentIndex,
      safeCurrentIndex + 7,
    );

  const handleAudienceResponse =
    setAudienceResponse;

  function handleUsePreEventPlanInGenerator() {
    const preset =
      buildPreEventGeneratorPreset(
        preEventIntelligence,
      );

    savePreEventGeneratorPreset(
      preset,
    );

    window.alert(
      `Pre-Event Plan saved for ${preset.profileName}. Open a playlist and click Generate Set, then apply the Venue History preset.`,
    );
  }

  function handleStartOrResume() {
    const now =
      new Date();

    setSession(
      (current) => {
        if (current.isRunning) {
          return current;
        }

        if (!current.startedAt) {
          return {
            ...current,
            startedAt:
              now.toISOString(),
            pausedAt: null,
            accumulatedPausedMs:
              0,
            isRunning: true,
          };
        }

        const pausedAtMs =
          current.pausedAt
            ? new Date(
                current.pausedAt,
              ).getTime()
            : now.getTime();

        const additionalPausedMs =
          Math.max(
            0,
            now.getTime() -
              pausedAtMs,
          );

        return {
          ...current,
          pausedAt: null,
          accumulatedPausedMs:
            current.accumulatedPausedMs +
            additionalPausedMs,
          isRunning: true,
        };
      },
    );
  }

  function handlePause() {
    setSession(
      (current) => {
        if (!current.isRunning) {
          return current;
        }

        return {
          ...current,
          pausedAt:
            new Date().toISOString(),
          isRunning: false,
        };
      },
    );
  }

  function handleNextTrack() {
    if (!currentTrack) {
      return;
    }

    setSession(
      (current) => {
        const playedTrackIds =
          current.playedTrackIds.includes(
            currentTrack.id,
          )
            ? current.playedTrackIds
            : [
                ...current.playedTrackIds,
                currentTrack.id,
              ];

        return {
          ...current,

          startedAt:
            current.startedAt ??
            new Date().toISOString(),

          isRunning: true,

          currentIndex:
            Math.min(
              current.currentIndex +
                1,
              Math.max(
                setTracks.length - 1,
                0,
              ),
            ),

          playedTrackIds,
        };
      },
    );
  }

  function handleEndSessionAndAnalyze() {
    if (
      !session.startedAt
    ) {
      window.alert(
        "Start the Live session before creating a performance report.",
      );

      return;
    }

    const confirmed =
      window.confirm(
        "End this Live session and create a performance report?",
      );

    if (!confirmed) {
      return;
    }

    archiveSession({
      session,
      currentTrack,
      tracks,
      currentSet,
      eventPlan,
      eventProfile:
        activeEventProfile,
      audienceResponses,
    });

    setSession(
      resetLiveSession(),
    );

    setIsPerformanceSummaryOpen(
      true,
    );
  }

  function handleReset() {
    const confirmed =
      window.confirm(
        "Reset the live session to the first track?",
      );

    if (!confirmed) {
      return;
    }

    setSession(
      resetLiveSession(),
    );
  }

  function handlePlayNext(
    trackId: string,
  ) {
    if (!currentTrack) {
      return;
    }

    setCurrentSet(
      (currentValue) => {
        const items = [
          ...currentValue.items,
        ];

        const targetIndex =
          safeCurrentIndex + 1;

        const existingIndex =
          items.findIndex(
            (item) =>
              item.trackId ===
              trackId,
          );

        if (existingIndex >= 0) {
          const [
            existingItem,
          ] =
            items.splice(
              existingIndex,
              1,
            );

          const adjustedTarget =
            existingIndex <
            targetIndex
              ? targetIndex - 1
              : targetIndex;

          items.splice(
            adjustedTarget,
            0,
            existingItem,
          );
        } else {
          if (
            targetIndex <
            items.length
          ) {
            items[targetIndex] =
              createCurrentSetItem(
                trackId,
              );
          } else {
            items.push(
              createCurrentSetItem(
                trackId,
              ),
            );
          }
        }

        return {
          ...currentValue,
          items,
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleAddAfterNext(
    trackId: string,
  ) {
    setCurrentSet(
      (currentValue) => {
        if (
          currentValue.items.some(
            (item) =>
              item.trackId ===
              trackId,
          )
        ) {
          return currentValue;
        }

        const items = [
          ...currentValue.items,
        ];

        const insertIndex =
          Math.min(
            safeCurrentIndex + 2,
            items.length,
          );

        items.splice(
          insertIndex,
          0,
          createCurrentSetItem(
            trackId,
          ),
        );

        return {
          ...currentValue,
          items,
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function getRouteItems(
    route: SmartRoute,
  ) {
    return route.tracks.map(
      (track) =>
        createCurrentSetItem(
          track.id,
        ),
    );
  }

  function handleUseRoute(
    route: SmartRoute,
  ) {
    setCurrentSet(
      (currentValue) => {
        const prefix =
          currentValue.items.slice(
            0,
            safeCurrentIndex + 1,
          );

        return {
          ...currentValue,
          items: [
            ...prefix,
            ...getRouteItems(
              route,
            ),
          ],
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleReplaceUpcoming(
    route: SmartRoute,
  ) {
    setCurrentSet(
      (currentValue) => {
        const routeItems =
          getRouteItems(
            route,
          );

        const replaceStart =
          safeCurrentIndex + 1;

        const replaceEnd =
          replaceStart +
          routeItems.length;

        const prefix =
          currentValue.items.slice(
            0,
            replaceStart,
          );

        const tail =
          currentValue.items.slice(
            replaceEnd,
          );

        const routeIds =
          new Set(
            routeItems.map(
              (item) =>
                item.trackId,
            ),
          );

        const cleanTail =
          tail.filter(
            (item) =>
              !routeIds.has(
                item.trackId,
              ),
          );

        return {
          ...currentValue,
          items: [
            ...prefix,
            ...routeItems,
            ...cleanTail,
          ],
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleAddRoute(
    route: SmartRoute,
  ) {
    setCurrentSet(
      (currentValue) => {
        const existingIds =
          new Set(
            currentValue.items.map(
              (item) =>
                item.trackId,
            ),
          );

        const routeItems =
          getRouteItems(
            route,
          ).filter(
            (item) =>
              !existingIds.has(
                item.trackId,
              ),
          );

        if (
          routeItems.length ===
          0
        ) {
          return currentValue;
        }

        return {
          ...currentValue,
          items: [
            ...currentValue.items,
            ...routeItems,
          ],
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleQueueMove(
    trackId: string,
    direction:
      | "up"
      | "down",
  ) {
    setCurrentSet(
      (currentValue) => {
        const index =
          currentValue.items.findIndex(
            (item) =>
              item.trackId ===
              trackId,
          );

        if (index < 0) {
          return currentValue;
        }

        const minimumIndex =
          safeCurrentIndex;

        const targetIndex =
          direction === "up"
            ? index - 1
            : index + 1;

        if (
          targetIndex <
            minimumIndex ||
          targetIndex >=
            currentValue.items.length
        ) {
          return currentValue;
        }

        const items = [
          ...currentValue.items,
        ];

        [
          items[index],
          items[targetIndex],
        ] = [
          items[targetIndex],
          items[index],
        ];

        return {
          ...currentValue,
          items,
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  if (
    currentSet.items.length ===
      0
  ) {
    return (
      <section className="page live-page">
        <header className="page-header">
          <div>
            <p className="page-eyebrow">Performance</p>
            <h1>Live DJ Mode</h1>
            <p className="page-description">Load a playlist into a temporary Live set, repair its flow or generate a new set.</p>
          </div>
        </header>

        <LiveSetWorkspace
          tracks={tracks}
          playlists={playlists}
          currentSet={currentSet}
          setCurrentSet={setCurrentSet}
          eventPlan={eventPlan}
        />
      </section>
    );
  }

  return (
    <section className="page live-page">
      <header className="live-page__header">
        <div>
          <p className="page-eyebrow">
            Performance
          </p>

          <h1>Live DJ Mode</h1>

          <p className="page-description">
            Current Set ·{" "}
            {safeCurrentIndex + 1} /{" "}
            {setTracks.length}
          </p>
        </div>

        <div className="live-page__session">
          <div>
            <Clock3 size={15} />
            <strong>
              {formatElapsed(
                session,
                nowMs,
              )}
            </strong>
            <span>
              {session.isRunning
                ? "running"
                : session.startedAt
                  ? "paused"
                  : "ready"}
            </span>
          </div>

          {!session.isRunning ? (
            <button
              type="button"
              onClick={
                handleStartOrResume
              }
            >
              <Play size={15} />
              {session.startedAt
                ? "Resume"
                : "Start Set"}
            </button>
          ) : (
            <button
              type="button"
              onClick={
                handlePause
              }
            >
              <Pause size={15} />
              Pause
            </button>
          )}

          <button
            type="button"
            disabled={
              !session.startedAt
            }
            onClick={
              handleEndSessionAndAnalyze
            }
          >
            <Square size={14} />
            End & Analyze
          </button>

          <button
            type="button"
            onClick={() =>
              setIsPerformanceSummaryOpen(
                true,
              )
            }
          >
            <BarChart3 size={15} />
            History
          </button>

          <button
            type="button"
            onClick={handleReset}
          >
            <RotateCcw size={15} />
            Reset
          </button>
        </div>
      </header>

      <LiveSetWorkspace
        tracks={tracks}
        playlists={playlists}
        currentSet={currentSet}
        setCurrentSet={setCurrentSet}
        eventPlan={eventPlan}
      />

      <div className="live-library-status">
        <Library size={15} />

        <div>
          <strong>
            Whole Library Match
          </strong>

          <span>
            Searching{" "}
            {libraryCoverage.totalTracks.toLocaleString()}{" "}
            loaded tracks across{" "}
            {playlists.length.toLocaleString()}{" "}
            playlists
          </span>
        </div>

        <small>
          {libraryCoverage.playlistTracks.toLocaleString()}{" "}
          playlist tracks ·{" "}
          {libraryCoverage.unassignedTracks.toLocaleString()}{" "}
          unassigned
        </small>
      </div>

      <EventProfileSelector
        profiles={
          eventProfiles
        }
        activeProfile={
          activeEventProfile
        }
        onSelect={
          setActiveEventProfileId
        }
        onCreate={(
          input,
        ) => {
          addEventProfile(
            input,
          );
        }}
        onDelete={
          deleteEventProfile
        }
      />

      <PreEventBriefPanel
        intelligence={
          preEventIntelligence
        }
        onUseInGenerator={
          handleUsePreEventPlanInGenerator
        }
      />

      <CloudSyncPanel />

      <BackupExportPanel />

      <ProductionDiagnosticsPanel />

      <FinalQaPanel />

      <AudienceResponsePanel
        activeResponse={
          activeAudienceResponse
        }
        decision={
          audienceEmergencyDecision
        }
        onSetResponse={
          handleAudienceResponse
        }
        onPlayNext={
          handlePlayNext
        }
        onAddAfterNext={
          handleAddAfterNext
        }
      />

      <LiveAdaptiveDirectionPanel
        direction={
          liveAdaptiveDirection
        }
        onPlayNext={
          handlePlayNext
        }
        onAddAfterNext={
          handleAddAfterNext
        }
      />

      <DjAssistantPanel
        insight={
          djAssistantInsight
        }
        onPlayNext={
          handlePlayNext
        }
        onAddAfterNext={
          handleAddAfterNext
        }
      />

      <SmartRoutePanel
        plan={
          smartRoutePlan
        }
        onUseRoute={
          handleUseRoute
        }
        onAddRoute={
          handleAddRoute
        }
        onReplaceUpcoming={
          handleReplaceUpcoming
        }
      />

      <LiveQuickSearch
        tracks={tracks}
        excludedTrackIds={
          excludedTrackIds
        }
        sourceMap={sourceMap}
        onPlayNext={
          handlePlayNext
        }
        onAddAfterNext={
          handleAddAfterNext
        }
      />

      <div className="live-layout">
        <div className="live-layout__main">
          <div className="live-now-next">
            <TrackHero
              label="Now Playing"
              track={currentTrack}
            />

            <div className="live-now-next__arrow">
              <ArrowRight size={24} />
            </div>

            <TrackHero
              label="Next"
              track={nextTrack}
            />
          </div>

          <section className="live-transition-card">
            <header>
              <div>
                <span>Transition</span>
                <strong>
                  {transition?.label ??
                    "End of set"}
                </strong>
              </div>

              <b>
                {transition
                  ? `${transition.percentage}%`
                  : "—"}
              </b>
            </header>

            {transition ? (
              <div className="live-transition-card__metrics">
                <span>
                  BPM{" "}
                  {transition.bpmDifference ===
                  null
                    ? "—"
                    : `Δ ${transition.bpmDifference.toFixed(
                        1,
                      )}`}
                </span>

                <span>
                  Key{" "}
                  {currentTrack?.musicalKey ??
                    "—"}{" "}
                  →{" "}
                  {nextTrack?.musicalKey ??
                    "—"}
                </span>

                <span>
                  Camelot{" "}
                  {transition.sourceCamelot ??
                    "—"}{" "}
                  →{" "}
                  {transition.candidateCamelot ??
                    "—"}
                </span>

                <span>
                  Energy{" "}
                  {transition.energyDifference ===
                  null
                    ? "—"
                    : `Δ ${transition.energyDifference.toFixed(
                        1,
                      )}`}
                </span>
              </div>
            ) : (
              <p>
                No next track in
                the Current Set.
              </p>
            )}
          </section>

          <div className="live-primary-actions">
            <button
              type="button"
              disabled={!nextTrack}
              onClick={
                handleNextTrack
              }
            >
              <SkipForward size={17} />
              NEXT TRACK
            </button>
          </div>

          <section className="live-suggestions">
            <header>
              <div>
                <Sparkles size={16} />

                <div>
                  <span>
                    Whole Library
                  </span>

                  <h2>
                    Same Style
                    Suggestions
                  </h2>
                </div>
              </div>

              <span>
                BPM → Key/Camelot →
                Energy
              </span>
            </header>

            <div className="live-suggestions__grid">
              {suggestions.map(
                (
                  suggestion,
                  index,
                ) => {
                  const sources =
                    getTrackSources(
                      suggestion.track.id,
                      sourceMap,
                    );

                  const primarySource =
                    sources[0] ?? null;

                  return (
                    <article
                      key={
                        suggestion.track.id
                      }
                    >
                      <span className="live-suggestion__rank">
                        {index + 1}
                      </span>

                      <div className="live-suggestion__copy">
                        <strong>
                          {
                            suggestion.track
                              .title
                          }
                        </strong>

                        <p>
                          {
                            suggestion.track
                              .artist
                          }
                        </p>

                        <div>
                          <span>
                            {suggestion.track
                              .tempo !==
                            null
                              ? `${Math.round(
                                  suggestion
                                    .track
                                    .tempo,
                                )} BPM`
                              : "— BPM"}
                          </span>

                          <span>
                            Key{" "}
                            {suggestion.track
                              .musicalKey ??
                              "—"}
                          </span>

                          <span>
                            Camelot{" "}
                            {getTrackCamelot(
                              suggestion.track,
                            ) ?? "—"}
                          </span>

                          <span>
                            Energy{" "}
                            {suggestion.track
                              .energy ??
                              "—"}
                          </span>
                        </div>

                        <div className="live-source-row">
                          <FolderOpen
                            size={11}
                          />

                          {primarySource ? (
                            <>
                              <span>
                                Source:
                              </span>

                              <Link
                                to={`/playlists/${primarySource.playlistId}`}
                              >
                                {
                                  primarySource.playlistName
                                }
                              </Link>

                              {sources.length >
                                1 && (
                                <small>
                                  +
                                  {sources.length -
                                    1}{" "}
                                  more
                                </small>
                              )}
                            </>
                          ) : (
                            <span>
                              Source: DJ
                              Library
                            </span>
                          )}
                        </div>
                      </div>

                      <b>
                        {
                          suggestion.percentage
                        }
                        %
                      </b>

                      <div className="live-suggestion__actions">
                        <button
                          type="button"
                          onClick={() =>
                            handlePlayNext(
                              suggestion.track
                                .id,
                            )
                          }
                        >
                          <Radio size={12} />
                          Play next
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleAddAfterNext(
                              suggestion.track
                                .id,
                            )
                          }
                        >
                          <Plus size={12} />
                          Add after
                        </button>

                        {primarySource && (
                          <Link
                            className="live-source-open"
                            to={`/playlists/${primarySource.playlistId}`}
                          >
                            Open playlist
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </section>

          <section className="live-cross-style">
            <header>
              <div>
                <Sparkles size={16} />

                <div>
                  <span>
                    Whole Library
                  </span>

                  <h2>
                    Cross Style
                  </h2>
                </div>
              </div>

              <span>
                3 styles · 5 tracks
                each
              </span>
            </header>

            <div className="live-cross-style__groups">
              {crossStyleGroups.map(
                (group) => (
                  <section
                    className="live-cross-style__group"
                    key={group.style}
                  >
                    <header>
                      <span>
                        Switch to
                      </span>

                      <strong>
                        {formatStyle(
                          group.style,
                        )}
                      </strong>
                    </header>

                    {group.tracks.map(
                      (
                        suggestion,
                        index,
                      ) => {
                        const source =
                          getPrimaryTrackSource(
                            suggestion.track
                              .id,
                            sourceMap,
                          );

                        return (
                          <article
                            key={
                              suggestion.track
                                .id
                            }
                          >
                            <span>
                              {index + 1}
                            </span>

                            <div>
                              <strong>
                                {
                                  suggestion.track
                                    .title
                                }
                              </strong>

                              <small>
                                {
                                  suggestion.track
                                    .artist
                                }
                              </small>

                              <small>
                                {suggestion.track
                                  .tempo !==
                                null
                                  ? `${Math.round(
                                      suggestion
                                        .track
                                        .tempo,
                                    )} BPM`
                                  : "— BPM"}{" "}
                                · Key{" "}
                                {suggestion.track
                                  .musicalKey ??
                                  "—"}{" "}
                                ·{" "}
                                {getTrackCamelot(
                                  suggestion.track,
                                ) ??
                                  "—"}
                              </small>

                              <small className="live-cross-source">
                                {source
                                  ? `From: ${source.playlistName}`
                                  : "From: DJ Library"}
                              </small>
                            </div>

                            <b>
                              {
                                suggestion.percentage
                              }
                              %
                            </b>

                            <button
                              type="button"
                              onClick={() =>
                                handlePlayNext(
                                  suggestion.track
                                    .id,
                                )
                              }
                            >
                              Play next
                            </button>

                            {source && (
                              <Link
                                className="live-cross-open"
                                to={`/playlists/${source.playlistId}`}
                              >
                                Open playlist
                              </Link>
                            )}
                          </article>
                        );
                      },
                    )}
                  </section>
                ),
              )}
            </div>
          </section>

          <section className="live-history">
            <header>
              <History size={15} />
              <h2>Played</h2>
            </header>

            {playedTracks.length ===
            0 ? (
              <p>
                Tracks you advance
                past will appear
                here.
              </p>
            ) : (
              <div className="live-history__list">
                {playedTracks.map(
                  (
                    track,
                    index,
                  ) => (
                    <span
                      key={track.id}
                    >
                      {index + 1}.{" "}
                      {track.title} ·{" "}
                      {track.artist}
                    </span>
                  ),
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="live-queue">
          <header>
            <ListMusic size={15} />

            <div>
              <span>
                Current Set
              </span>

              <h2>Upcoming</h2>
            </div>
          </header>

          <div className="live-queue__list">
            {upcomingTracks.map(
              (
                track,
                index,
              ) => {
                const absoluteIndex =
                  safeCurrentIndex +
                  index;

                return (
                  <article
                    className={
                      index === 0
                        ? "live-queue__item live-queue__item--current"
                        : "live-queue__item"
                    }
                    key={`${track.id}-${absoluteIndex}`}
                  >
                    <span>
                      {absoluteIndex + 1}
                    </span>

                    <div>
                      <strong>
                        {track.title}
                      </strong>

                      <small>
                        {track.artist}
                      </small>

                      <small>
                        {track.tempo !==
                        null
                          ? `${Math.round(
                              track.tempo,
                            )} BPM`
                          : "— BPM"}{" "}
                        ·{" "}
                        {track.musicalKey ??
                          "—"}{" "}
                        ·{" "}
                        {getTrackCamelot(
                          track,
                        ) ?? "—"}
                      </small>
                    </div>

                    {index > 0 && (
                      <div className="live-queue__actions">
                        <button
                          type="button"
                          aria-label="Move track up"
                          onClick={() =>
                            handleQueueMove(
                              track.id,
                              "up",
                            )
                          }
                        >
                          <ArrowUp size={12} />
                        </button>

                        <button
                          type="button"
                          aria-label="Move track down"
                          onClick={() =>
                            handleQueueMove(
                              track.id,
                              "down",
                            )
                          }
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </aside>
      </div>

      <PerformanceSummaryPanel
        isOpen={
          isPerformanceSummaryOpen
        }
        history={
          performanceHistory
        }
        selectedRecord={
          selectedPerformanceRecord
        }
        onSelectRecord={
          setSelectedPerformanceRecord
        }
        onDeleteRecord={
          deletePerformanceRecord
        }
        onClose={() =>
          setIsPerformanceSummaryOpen(
            false,
          )
        }
      />
    </section>
  );
}
