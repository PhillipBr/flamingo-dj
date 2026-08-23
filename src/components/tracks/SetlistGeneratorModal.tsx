import {
  Activity,
  BrainCircuit,
  Clock3,
  Gauge,
  ListMusic,
  Music2,
  Plus,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import type { Track } from "../../types/track";

import type {
  GeneratedSetlistResult,
  SetlistEnergyCurve,
  SetlistGenerationMode,
  SetlistEventPlan,
  SetlistInsertMode,
  SetlistJourneyTemplateId,
  SetlistKeyMode,
  SetlistStartMode,
  SetlistStyleBlock,
} from "../../types/setlistGenerator";

import {
  generateSetlistPlan,
} from "../../utils/generateSetlistPlan";

import {
  getTrackCamelot,
  getTrackGenres,
} from "../../utils/matchSongs";

import {
  buildJourneyStyleBlocks,
  getJourneyTemplate,
  JOURNEY_TEMPLATES,
} from "../../utils/setJourneyTemplates";

import type {
  PreEventGeneratorPreset,
} from "../../types/preEventGeneratorPreset";

import {
  clearPreEventGeneratorPreset,
  loadPreEventGeneratorPreset,
} from "../../utils/preEventGeneratorStorage";

import "./SetlistGeneratorModal.css";

type SetlistGeneratorModalProps = {
  isOpen: boolean;
  tracks: Track[];
  selectedTrack: Track | null;

  onClose: () => void;

  onApply: (
    tracks: Track[],
    mode: SetlistInsertMode,
    plannedPlaySeconds?: number,
    eventPlan?: SetlistEventPlan,
  ) => void;
};

function createBlock(
  index: number,
  genre = "all",
): SetlistStyleBlock {
  return {
    id: `block-${Date.now()}-${index}`,
    genre,
    durationMinutes: 30,
    minimumBpm: 90,
    maximumBpm: 120,
  };
}

function formatDuration(
  seconds: number,
): string {
  const safeSeconds =
    Math.max(
      0,
      Math.round(seconds),
    );

  const hours =
    Math.floor(
      safeSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (safeSeconds % 3600) /
        60,
    );

  if (hours > 0) {
    return `${hours}h ${minutes
      .toString()
      .padStart(2, "0")}m`;
  }

  return `${minutes} min`;
}

function getTrackGenreLabel(
  track: Track,
): string {
  const genres =
    getTrackGenres(track);

  return (
    genres[0] ??
    track.genre ??
    "Unknown"
  );
}

function parseGenreList(
  value: string,
): string[] {
  const seen =
    new Set<string>();

  return value
    .split(",")
    .map(
      (genre) =>
        genre.trim(),
    )
    .filter(
      (genre) => {
        if (!genre) {
          return false;
        }

        const key =
          genre.toLowerCase();

        if (
          seen.has(
            key,
          )
        ) {
          return false;
        }

        seen.add(
          key,
        );

        return true;
      },
    );
}

function getBlockGenreText(
  block: SetlistStyleBlock,
): string {
  if (
    Array.isArray(
      block.genres,
    ) &&
    block.genres.length >
      0
  ) {
    return block.genres.join(
      ", ",
    );
  }

  return block.genre ===
    "all"
    ? ""
    : block.genre;
}

export default function SetlistGeneratorModal({
  isOpen,
  tracks,
  selectedTrack,
  onClose,
  onApply,
}: SetlistGeneratorModalProps) {
  const [
    generationMode,
    setGenerationMode,
  ] =
    useState<SetlistGenerationMode>(
      "track-count",
    );

  const [
    trackCount,
    setTrackCount,
  ] = useState(30);

  const [
    eventHours,
    setEventHours,
  ] = useState(3);

  const [
    eventMinutes,
    setEventMinutes,
  ] = useState(0);

  const [
    averagePlaySeconds,
    setAveragePlaySeconds,
  ] = useState(60);

  const [
    minimumBpm,
    setMinimumBpm,
  ] = useState(100);

  const [
    maximumBpm,
    setMaximumBpm,
  ] = useState(110);

  const [
    genre,
    setGenre,
  ] = useState("all");

  const [
    minimumPopularity,
    setMinimumPopularity,
  ] = useState(0);

  const [
    maximumPopularity,
    setMaximumPopularity,
  ] = useState(100);

  const [
    energyCurve,
    setEnergyCurve,
  ] =
    useState<SetlistEnergyCurve>(
      "warmup-peak-closing",
    );

  const [
    keyMode,
    setKeyMode,
  ] =
    useState<SetlistKeyMode>(
      "compatible",
    );

  const [
    artistSpacing,
    setArtistSpacing,
  ] = useState(4);

  const [
    startMode,
    setStartMode,
  ] =
    useState<SetlistStartMode>(
      "automatic",
    );

  const [
    useStyleBlocks,
    setUseStyleBlocks,
  ] = useState(false);

  const [
    journeyTemplateId,
    setJourneyTemplateId,
  ] =
    useState<SetlistJourneyTemplateId>(
      "warmup-peak-release",
    );

  const [
    styleBlocks,
    setStyleBlocks,
  ] = useState<
    SetlistStyleBlock[]
  >([
    {
      id: "block-1",
      genre: "all",
      durationMinutes: 45,
      minimumBpm: 90,
      maximumBpm: 105,
    },
    {
      id: "block-2",
      genre: "all",
      durationMinutes: 45,
      minimumBpm: 100,
      maximumBpm: 115,
    },
    {
      id: "block-3",
      genre: "all",
      durationMinutes: 45,
      minimumBpm: 110,
      maximumBpm: 125,
    },
  ]);

  const [
    result,
    setResult,
  ] =
    useState<GeneratedSetlistResult<Track> | null>(
      null,
    );

  const [
    preEventPreset,
    setPreEventPreset,
  ] =
    useState<PreEventGeneratorPreset | null>(
      loadPreEventGeneratorPreset,
    );

  const [
    historicalTrackPriorityEnabled,
    setHistoricalTrackPriorityEnabled,
  ] =
    useState(false);

  const availableGenres =
    useMemo(() => {
      const values =
        new Set<string>();

      tracks.forEach(
        (track) => {
          getTrackGenres(
            track,
          ).forEach(
            (trackGenre) => {
              if (
                trackGenre.trim()
              ) {
                values.add(
                  trackGenre,
                );
              }
            },
          );
        },
      );

      return [
        ...values,
      ].sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      );
    }, [tracks]);

  if (!isOpen) {
    return null;
  }

  const eventDurationMinutes =
    Math.max(
      1,
      eventHours * 60 +
        eventMinutes,
    );

  const estimatedTrackCount =
    generationMode ===
    "event-duration"
      ? Math.max(
          1,
          Math.round(
            (
              eventDurationMinutes *
              60
            ) /
              Math.max(
                10,
                averagePlaySeconds,
              ),
          ),
        )
      : Math.max(
          1,
          trackCount,
        );

  const styleBlocksMinutes =
    styleBlocks.reduce(
      (
        total,
        block,
      ) =>
        total +
        Math.max(
          0,
          block.durationMinutes,
        ),
      0,
    );

  function applyPreEventPreset() {
    if (
      !preEventPreset
    ) {
      return;
    }

    const template =
      getJourneyTemplate(
        preEventPreset.journeyTemplateId,
      );

    const safeMinimumBpm =
      Math.min(
        preEventPreset.minimumBpm,
        preEventPreset.maximumBpm,
      );

    const safeMaximumBpm =
      Math.max(
        preEventPreset.minimumBpm,
        preEventPreset.maximumBpm,
      );

    const preferredGenres =
      preEventPreset.strongGenres
        .map(
          (value) =>
            value.trim(),
        )
        .filter(Boolean)
        .slice(
          0,
          3,
        );

    setGenerationMode(
      "event-duration",
    );

    setMinimumBpm(
      safeMinimumBpm,
    );

    setMaximumBpm(
      safeMaximumBpm,
    );

    setJourneyTemplateId(
      preEventPreset.journeyTemplateId,
    );

    setEnergyCurve(
      template.energyCurve,
    );

    setUseStyleBlocks(
      true,
    );

    setGenre(
      preferredGenres[0] ??
      "all",
    );

    const phasePlans =
      preEventPreset.phasePlans ??
      [];

    if (
      phasePlans.length >
      0
    ) {
      const generatedBlocks =
        phasePlans.map(
          (
            phase,
            index,
          ) => {
            const durationMinutes =
              Math.max(
                5,
                Math.round(
                  eventDurationMinutes *
                    phase.durationRatio,
                ),
              );

            const genres =
              phase.genres
                .map(
                  (value) =>
                    value.trim(),
                )
                .filter(Boolean)
                .slice(
                  0,
                  3,
                );

            return {
              id:
                `phase-aware-${phase.phaseId}-${index}`,

              phaseName:
                phase.phaseName,

              genre:
                genres[0] ??
                preferredGenres[0] ??
                "all",

              genres:
                genres.length >
                0
                  ? genres
                  : preferredGenres.slice(
                      0,
                      3,
                    ),

              durationMinutes,

              minimumBpm:
                Math.min(
                  phase.minimumBpm,
                  phase.maximumBpm,
                ),

              maximumBpm:
                Math.max(
                  phase.minimumBpm,
                  phase.maximumBpm,
                ),

              historicalPriorityEnabled:
                true,

              reliableTrackIds:
                phase.reliableTrackIds,

              crowdRescueTrackIds:
                phase.crowdRescueTrackIds,

              reviewTrackIds:
                phase.reviewTrackIds,
            };
          },
        );

      setStyleBlocks(
        generatedBlocks,
      );

      const allMinimumBpms =
        generatedBlocks.map(
          (block) =>
            block.minimumBpm,
        );

      const allMaximumBpms =
        generatedBlocks.map(
          (block) =>
            block.maximumBpm,
        );

      setMinimumBpm(
        Math.min(
          ...allMinimumBpms,
        ),
      );

      setMaximumBpm(
        Math.max(
          ...allMaximumBpms,
        ),
      );
    } else {
      setStyleBlocks(
        buildJourneyStyleBlocks(
          preEventPreset.journeyTemplateId,
          eventDurationMinutes,
          safeMinimumBpm,
          safeMaximumBpm,
          "all",
        ).map(
          (
            block,
            index,
          ) => {
            const genres =
              preferredGenres.length >
              0
                ? (
                    index === 0 ||
                    index === 3
                      ? preferredGenres.slice(
                          0,
                          2,
                        )
                      : preferredGenres
                  )
                : [];

            return {
              ...block,

              genres,

              genre:
                genres[0] ??
                "all",
            };
          },
        ),
      );
    }

    setHistoricalTrackPriorityEnabled(
      true,
    );

    setResult(
      null,
    );
  }

  function dismissPreEventPreset() {
    clearPreEventGeneratorPreset();

    setPreEventPreset(
      null,
    );

    setHistoricalTrackPriorityEnabled(
      false,
    );
  }

  function applyJourneyTemplate(
    templateId:
      SetlistJourneyTemplateId =
        journeyTemplateId,
  ) {
    const template =
      getJourneyTemplate(
        templateId,
      );

    setJourneyTemplateId(
      templateId,
    );

    setGenerationMode(
      "event-duration",
    );

    setUseStyleBlocks(
      true,
    );

    setEnergyCurve(
      template.energyCurve,
    );

    setStyleBlocks(
      buildJourneyStyleBlocks(
        templateId,
        eventDurationMinutes,
        minimumBpm,
        maximumBpm,
        genre,
      ),
    );

    setResult(
      null,
    );
  }

  function updateBlock(
    blockId: string,
    changes: Partial<SetlistStyleBlock>,
  ) {
    setStyleBlocks(
      (currentBlocks) =>
        currentBlocks.map(
          (block) =>
            block.id ===
            blockId
              ? {
                  ...block,
                  ...changes,
                }
              : block,
        ),
    );
  }

  function addBlock() {
    setStyleBlocks(
      (currentBlocks) => [
        ...currentBlocks,
        createBlock(
          currentBlocks.length +
            1,
          genre,
        ),
      ],
    );
  }

  function removeBlock(
    blockId: string,
  ) {
    setStyleBlocks(
      (currentBlocks) =>
        currentBlocks.filter(
          (block) =>
            block.id !==
            blockId,
        ),
    );
  }

  function handleGenerate() {
    setResult(
      generateSetlistPlan(
        tracks,
        {
          generationMode,

          trackCount:
            Math.max(
              1,
              Math.min(
                500,
                trackCount,
              ),
            ),

          eventDurationMinutes,

          averagePlaySeconds:
            Math.max(
              10,
              Math.min(
                600,
                averagePlaySeconds,
              ),
            ),

          minimumBpm:
            Math.min(
              minimumBpm,
              maximumBpm,
            ),

          maximumBpm:
            Math.max(
              minimumBpm,
              maximumBpm,
            ),

          genre,

          minimumPopularity:
            Math.min(
              minimumPopularity,
              maximumPopularity,
            ),

          maximumPopularity:
            Math.max(
              minimumPopularity,
              maximumPopularity,
            ),

          energyCurve,
          keyMode,

          artistSpacing:
            Math.max(
              0,
              artistSpacing,
            ),

          startMode,

          startTrackId:
            startMode ===
              "selected"
              ? selectedTrack
                  ?.id ??
                null
              : null,

          historicalPriorityEnabled:
            historicalTrackPriorityEnabled &&
            preEventPreset !==
              null,

          reliableTrackIds:
            historicalTrackPriorityEnabled
              ? preEventPreset
                  ?.reliableTrackIds ??
                []
              : [],

          crowdRescueTrackIds:
            historicalTrackPriorityEnabled
              ? preEventPreset
                  ?.crowdRescueTrackIds ??
                []
              : [],

          reviewTrackIds:
            historicalTrackPriorityEnabled
              ? preEventPreset
                  ?.reviewTrackIds ??
                []
              : [],

          useStyleBlocks,

          styleBlocks:
            styleBlocks.map(
              (block) => {
                const genres =
                  Array.isArray(
                    block.genres,
                  )
                    ? block.genres
                        .map(
                          (genre) =>
                            genre.trim(),
                        )
                        .filter(Boolean)
                    : [];

                return {
                  ...block,

                  genres,

                  genre:
                    genres[0] ??
                    block.genre ??
                    "all",

                  durationMinutes:
                  Math.max(
                    1,
                    block.durationMinutes,
                  ),
                minimumBpm:
                  Math.min(
                    block.minimumBpm,
                    block.maximumBpm,
                  ),
                maximumBpm:
                  Math.max(
                    block.minimumBpm,
                    block.maximumBpm,
                  ),
                };
              },
            ),
        },
      ),
    );
  }

  function buildEventPlan(): SetlistEventPlan {
    const safeBlocks =
      (
        useStyleBlocks
          ? styleBlocks
          : []
      ).map(
        (
          block,
          index,
        ) => {
          const genres =
            Array.isArray(
              block.genres,
            )
              ? block.genres
                  .map(
                    (genre) =>
                      genre.trim(),
                  )
                  .filter(Boolean)
              : (
                  block.genre &&
                  block.genre !==
                    "all"
                    ? [block.genre]
                    : []
                );

          return {
            id:
              block.id,

            name:
              block.phaseName ??
              `Block ${index + 1}`,

            genres,

            durationMinutes:
              Math.max(
                1,
                block.durationMinutes,
              ),

            minimumBpm:
              Math.min(
                block.minimumBpm,
                block.maximumBpm,
              ),

            maximumBpm:
              Math.max(
                block.minimumBpm,
                block.maximumBpm,
              ),
          };
        },
      );

    return {
      id:
        `event-plan-${Date.now()}`,

      name:
        getJourneyTemplate(
          journeyTemplateId,
        ).name,

      templateId:
        journeyTemplateId,

      createdAt:
        new Date().toISOString(),

      totalDurationMinutes:
        safeBlocks.reduce(
          (
            total,
            block,
          ) =>
            total +
            block.durationMinutes,
          0,
        ) ||
        eventDurationMinutes,

      averagePlaySeconds:
        Math.max(
          10,
          Math.min(
            600,
            averagePlaySeconds,
          ),
        ),

      phases:
        safeBlocks,
    };
  }

  return (
    <div
      className="setlist-generator-backdrop"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="setlist-generator-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Automatic setlist generator"
      >
        <header className="setlist-generator-modal__header">
          <div>
            <p>
              <Sparkles
                size={15}
              />
              Flamingo Set Planner
            </p>

            <h2>
              Automatic Setlist V4
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="setlist-generator-modal__body">
          <div className="setlist-generator-form">
            <fieldset>
              <legend>
                Set size
              </legend>

              <label className="setlist-generator-radio">
                <input
                  type="radio"
                  name="generation-mode"
                  checked={
                    generationMode ===
                    "track-count"
                  }
                  onChange={() =>
                    setGenerationMode(
                      "track-count",
                    )
                  }
                />
                Number of tracks
              </label>

              <label className="setlist-generator-radio">
                <input
                  type="radio"
                  name="generation-mode"
                  checked={
                    generationMode ===
                    "event-duration"
                  }
                  onChange={() =>
                    setGenerationMode(
                      "event-duration",
                    )
                  }
                />
                Event duration
              </label>
            </fieldset>

            {generationMode ===
            "track-count" ? (
              <label>
                <span>
                  Number of tracks
                </span>

                <input
                  type="number"
                  min="1"
                  max="500"
                  value={
                    trackCount
                  }
                  onChange={(
                    event,
                  ) =>
                    setTrackCount(
                      Number(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                />
              </label>
            ) : (
              <>
                <div className="setlist-generator-form__two">
                  <label>
                    <span>
                      Event hours
                    </span>

                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={
                        eventHours
                      }
                      onChange={(
                        event,
                      ) =>
                        setEventHours(
                          Number(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Extra minutes
                    </span>

                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={
                        eventMinutes
                      }
                      onChange={(
                        event,
                      ) =>
                        setEventMinutes(
                          Number(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                    />
                  </label>
                </div>

                <label>
                  <span>
                    Average play time per track
                  </span>

                  <div className="setlist-generator-form__suffix-input">
                    <input
                      type="number"
                      min="10"
                      max="600"
                      step="5"
                      value={
                        averagePlaySeconds
                      }
                      onChange={(
                        event,
                      ) =>
                        setAveragePlaySeconds(
                          Number(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                    />

                    <span>
                      sec
                    </span>
                  </div>
                </label>

                <div className="setlist-generator-estimate">
                  <Clock3
                    size={15}
                  />

                  <div>
                    <strong>
                      {
                        estimatedTrackCount
                      } tracks
                    </strong>

                    <span>
                      estimated for{" "}
                      {eventHours}h{" "}
                      {eventMinutes}m
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="setlist-generator-form__two">
              <label>
                <span>
                  Minimum BPM
                </span>

                <input
                  type="number"
                  min="40"
                  max="250"
                  value={
                    minimumBpm
                  }
                  onChange={(
                    event,
                  ) =>
                    setMinimumBpm(
                      Number(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Maximum BPM
                </span>

                <input
                  type="number"
                  min="40"
                  max="250"
                  value={
                    maximumBpm
                  }
                  onChange={(
                    event,
                  ) =>
                    setMaximumBpm(
                      Number(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                />
              </label>
            </div>

            <label>
              <span>
                Genre
              </span>

              <select
                value={genre}
                onChange={(
                  event,
                ) =>
                  setGenre(
                    event.target
                      .value,
                  )
                }
              >
                <option value="all">
                  All genres
                </option>

                {availableGenres.map(
                  (
                    availableGenre,
                  ) => (
                    <option
                      key={
                        availableGenre
                      }
                      value={
                        availableGenre
                      }
                    >
                      {
                        availableGenre
                      }
                    </option>
                  ),
                )}
              </select>
            </label>

            <div className="setlist-generator-form__two">
              <label>
                <span>
                  Min popularity
                </span>

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={
                    minimumPopularity
                  }
                  onChange={(
                    event,
                  ) =>
                    setMinimumPopularity(
                      Number(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Max popularity
                </span>

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={
                    maximumPopularity
                  }
                  onChange={(
                    event,
                  ) =>
                    setMaximumPopularity(
                      Number(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                />
              </label>
            </div>

            <label>
              <span>
                Energy curve
              </span>

              <select
                value={
                  energyCurve
                }
                onChange={(
                  event,
                ) =>
                  setEnergyCurve(
                    event.target
                      .value as SetlistEnergyCurve,
                  )
                }
              >
                <option value="progressive">
                  Progressive
                </option>

                <option value="warmup-peak-closing">
                  Warm-up → Peak → Closing
                </option>

                <option value="smooth">
                  Smooth
                </option>
              </select>
            </label>

            <label>
              <span>
                Key compatibility
              </span>

              <select
                value={keyMode}
                onChange={(
                  event,
                ) =>
                  setKeyMode(
                    event.target
                      .value as SetlistKeyMode,
                  )
                }
              >
                <option value="strict">
                  Strict
                </option>

                <option value="compatible">
                  Compatible
                </option>

                <option value="flexible">
                  Flexible
                </option>

                <option value="ignore">
                  Ignore
                </option>
              </select>
            </label>

            <label>
              <span>
                Avoid same artist for
              </span>

              <div className="setlist-generator-form__suffix-input">
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={
                    artistSpacing
                  }
                  onChange={(
                    event,
                  ) =>
                    setArtistSpacing(
                      Number(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                />

                <span>
                  tracks
                </span>
              </div>
            </label>

            <fieldset>
              <legend>
                Starting track
              </legend>

              <label className="setlist-generator-radio">
                <input
                  type="radio"
                  name="set-start"
                  checked={
                    startMode ===
                    "automatic"
                  }
                  onChange={() =>
                    setStartMode(
                      "automatic",
                    )
                  }
                />
                Automatic
              </label>

              <label className="setlist-generator-radio">
                <input
                  type="radio"
                  name="set-start"
                  checked={
                    startMode ===
                    "selected"
                  }
                  disabled={
                    !selectedTrack
                  }
                  onChange={() =>
                    setStartMode(
                      "selected",
                    )
                  }
                />
                Selected track
                {selectedTrack
                  ? ` — ${selectedTrack.title}`
                  : " — select exactly one track first"}
              </label>
            </fieldset>

            {preEventPreset && (
              <section className="setlist-generator-pre-event">
                <header>
                  <div>
                    <BrainCircuit
                      size={15}
                    />

                    <div>
                      <span>
                        Venue History
                      </span>

                      <strong>
                        Pre-Event Generator Preset
                      </strong>
                    </div>
                  </div>

                  <b>
                    {
                      preEventPreset.readinessScore
                    }
                    % ready
                  </b>
                </header>

                <div className="setlist-generator-pre-event__facts">
                  <article>
                    <span>
                      Profile
                    </span>

                    <strong>
                      {
                        preEventPreset.profileName
                      }
                    </strong>
                  </article>

                  <article>
                    <span>
                      Starting BPM
                    </span>

                    <strong>
                      {
                        preEventPreset.minimumBpm
                      }
                      –
                      {
                        preEventPreset.maximumBpm
                      }
                    </strong>
                  </article>

                  <article>
                    <span>
                      Journey
                    </span>

                    <strong>
                      {
                        getJourneyTemplate(
                          preEventPreset.journeyTemplateId,
                        ).name
                      }
                    </strong>
                  </article>

                  <article>
                    <span>
                      History
                    </span>

                    <strong>
                      {
                        preEventPreset.sourceSessions
                      }{" "}
                      sessions
                    </strong>
                  </article>
                </div>

                <p>
                  Strong styles:{" "}
                  <strong>
                    {preEventPreset.strongGenres.length >
                    0
                      ? preEventPreset.strongGenres.join(
                          ", ",
                        )
                      : "No strong style signal yet"}
                  </strong>
                </p>

                {preEventPreset.phasePlans &&
                  preEventPreset.phasePlans.length >
                    0 && (
                  <div className="setlist-generator-pre-event__phase-summary">
                    <strong>
                      Phase-Aware Venue History
                    </strong>

                    <span>
                      {preEventPreset.phasePlans.length} historical blocks:
                      Opening → Warm Up → Build → Peak → Release
                    </span>

                    <small>
                      Each block can use its own BPM range, genres,
                      Reliable tracks, Crowd Rescue tracks, and Review tracks.
                    </small>
                  </div>
                )}

                <small>
                  Reliable tracks:{" "}
                  {
                    preEventPreset.reliableTrackIds.length
                  }
                  {" · "}
                  Crowd rescue:{" "}
                  {
                    preEventPreset.crowdRescueTrackIds.length
                  }
                  {" · "}
                  Review:{" "}
                  {
                    preEventPreset.reviewTrackIds.length
                  }
                </small>

                <label className="setlist-generator-pre-event__priority">
                  <input
                    type="checkbox"
                    checked={
                      historicalTrackPriorityEnabled
                    }
                    onChange={(
                      event,
                    ) =>
                      setHistoricalTrackPriorityEnabled(
                        event.target
                          .checked,
                      )
                    }
                  />

                  <span>
                    Historical Track Priority
                  </span>

                  <small>
                    Reliable + Crowd Rescue receive a modest boost.
                    Review tracks receive a modest penalty.
                    BPM and Camelot remain first.
                  </small>
                </label>

                {preEventPreset.phasePlans &&
                  preEventPreset.phasePlans.length >
                    0 && (
                  <div className="setlist-generator-pre-event__phase-grid">
                    {preEventPreset.phasePlans.map(
                      (phase) => (
                        <article
                          key={
                            phase.phaseId
                          }
                        >
                          <strong>
                            {
                              phase.phaseName
                            }
                          </strong>

                          <span>
                            {
                              phase.minimumBpm
                            }
                            –
                            {
                              phase.maximumBpm
                            } BPM
                          </span>

                          <small>
                            {phase.genres.length >
                            0
                              ? phase.genres.join(
                                  " / ",
                                )
                              : "All styles"}
                          </small>

                          <small>
                            Crowd{" "}
                            {phase.crowdScore ??
                              "—"}
                            {" · "}
                            {
                              phase.responseCount
                            }{" "}
                            responses
                          </small>
                        </article>
                      ),
                    )}
                  </div>
                )}

                <div className="setlist-generator-pre-event__actions">
                  <button
                    type="button"
                    onClick={
                      applyPreEventPreset
                    }
                  >
                    <BrainCircuit
                      size={12}
                    />
                    Apply Venue History
                  </button>

                  <button
                    type="button"
                    onClick={
                      dismissPreEventPreset
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </section>
            )}

            <section className="setlist-generator-journey">
              <header>
                <div>
                  <Activity
                    size={15}
                  />

                  <div>
                    <span>
                      Set Journey
                    </span>

                    <strong>
                      Journey Templates
                    </strong>
                  </div>
                </div>

                <small>
                  Builds Warm Up / Build / Peak / Release automatically.
                </small>
              </header>

              <div className="setlist-generator-journey__templates">
                {JOURNEY_TEMPLATES.map(
                  (template) => (
                    <button
                      className={
                        journeyTemplateId ===
                        template.id
                          ? "setlist-generator-journey__template setlist-generator-journey__template--active"
                          : "setlist-generator-journey__template"
                      }
                      key={
                        template.id
                      }
                      type="button"
                      onClick={() =>
                        applyJourneyTemplate(
                          template.id,
                        )
                      }
                    >
                      <strong>
                        {
                          template.name
                        }
                      </strong>

                      <span>
                        {
                          template.description
                        }
                      </span>
                    </button>
                  ),
                )}
              </div>

              <button
                className="setlist-generator-journey__apply"
                type="button"
                onClick={() =>
                  applyJourneyTemplate()
                }
              >
                <Activity
                  size={13}
                />
                Rebuild for current duration / BPM
              </button>
            </section>

            <div className="setlist-generator-block-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={
                    useStyleBlocks
                  }
                  onChange={(
                    event,
                  ) =>
                    setUseStyleBlocks(
                      event.target
                        .checked,
                    )
                  }
                />

                <div>
                  <strong>
                    Style Blocks
                  </strong>

                  <span>
                    Build sections and use Cross Style to find bridges between them.
                  </span>
                </div>
              </label>
            </div>

            {useStyleBlocks && (
              <div className="setlist-generator-blocks">
                <div className="setlist-generator-blocks__summary">
                  <span>
                    {
                      styleBlocks.length
                    } blocks
                  </span>

                  <span>
                    {
                      styleBlocksMinutes
                    } min total
                  </span>
                </div>

                {styleBlocks.map(
                  (
                    block,
                    index,
                  ) => (
                    <article
                      className="setlist-generator-block"
                      key={
                        block.id
                      }
                    >
                      <header>
                        <strong>
                          {block.phaseName
                            ? `${block.phaseName} · Block ${index + 1}`
                            : `Block ${index + 1}`}
                        </strong>

                        <button
                          type="button"
                          disabled={
                            styleBlocks.length <=
                            1
                          }
                          onClick={() =>
                            removeBlock(
                              block.id,
                            )
                          }
                        >
                          <Trash2
                            size={13}
                          />
                        </button>
                      </header>

                      <label className="setlist-generator-block__genres">
                        <span>
                          Styles / Genres (OR)
                        </span>

                        <input
                          type="text"
                          value={
                            getBlockGenreText(
                              block,
                            )
                          }
                          placeholder="reggaeton, dembow, latin house"
                          onChange={(
                            event,
                          ) => {
                            const genres =
                              parseGenreList(
                                event.target
                                  .value,
                              );

                            updateBlock(
                              block.id,
                              {
                                genres,

                                genre:
                                  genres[0] ??
                                  "all",
                              },
                            );
                          }}
                        />

                        <small>
                          Separate multiple styles with commas. A track may match any one of them.
                        </small>

                        <select
                          value=""
                          onChange={(
                            event,
                          ) => {
                            const nextGenre =
                              event.target
                                .value;

                            if (!nextGenre) {
                              return;
                            }

                            const currentGenres =
                              Array.isArray(
                                block.genres,
                              )
                                ? block.genres
                                : [];

                            const genres =
                              parseGenreList(
                                [
                                  ...currentGenres,
                                  nextGenre,
                                ].join(", "),
                              );

                            updateBlock(
                              block.id,
                              {
                                genres,
                                genre:
                                  genres[0] ??
                                  "all",
                              },
                            );
                          }}
                        >
                          <option value="">
                            + Add genre from library
                          </option>

                          {availableGenres.map(
                            (
                              availableGenre,
                            ) => (
                              <option
                                key={
                                  availableGenre
                                }
                                value={
                                  availableGenre
                                }
                              >
                                {
                                  availableGenre
                                }
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label>
                        <span>
                          Duration
                        </span>

                        <div className="setlist-generator-form__suffix-input">
                          <input
                            type="number"
                            min="1"
                            max="360"
                            value={
                              block.durationMinutes
                            }
                            onChange={(
                              event,
                            ) =>
                              updateBlock(
                                block.id,
                                {
                                  durationMinutes:
                                    Number(
                                      event
                                        .target
                                        .value,
                                    ),
                                },
                              )
                            }
                          />

                          <span>
                            min
                          </span>
                        </div>
                      </label>

                      <div className="setlist-generator-form__two">
                        <label>
                          <span>
                            Min BPM
                          </span>

                          <input
                            type="number"
                            min="40"
                            max="250"
                            value={
                              block.minimumBpm
                            }
                            onChange={(
                              event,
                            ) =>
                              updateBlock(
                                block.id,
                                {
                                  minimumBpm:
                                    Number(
                                      event
                                        .target
                                        .value,
                                    ),
                                },
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>
                            Max BPM
                          </span>

                          <input
                            type="number"
                            min="40"
                            max="250"
                            value={
                              block.maximumBpm
                            }
                            onChange={(
                              event,
                            ) =>
                              updateBlock(
                                block.id,
                                {
                                  maximumBpm:
                                    Number(
                                      event
                                        .target
                                        .value,
                                    ),
                                },
                              )
                            }
                          />
                        </label>
                      </div>
                    </article>
                  ),
                )}

                <button
                  className="setlist-generator-blocks__add"
                  type="button"
                  onClick={
                    addBlock
                  }
                >
                  <Plus size={14} />
                  Add Style Block
                </button>
              </div>
            )}

            <button
              className="setlist-generator-form__generate"
              type="button"
              onClick={
                handleGenerate
              }
            >
              <Sparkles
                size={16}
              />
              Generate Set
            </button>
          </div>

          <div className="setlist-generator-preview">
            {!result ? (
              <div className="setlist-generator-preview__empty">
                <ListMusic
                  size={34}
                />

                <strong>
                  Configure your set
                </strong>

                <p>
                  Generate by track
                  count or by event
                  duration. Style
                  Blocks can create
                  separate genre
                  sections with
                  Cross Style bridges.
                </p>
              </div>
            ) : (
              <>
                <div className="setlist-generator-preview__summary">
                  <div>
                    <strong>
                      {
                        result.generatedCount
                      }
                    </strong>

                    <span>
                      generated
                    </span>
                  </div>

                  <div>
                    <strong>
                      {formatDuration(
                        result.estimatedDurationSeconds ??
                          result.generatedCount *
                            averagePlaySeconds,
                      )}
                    </strong>

                    <span>
                      estimated set
                    </span>
                  </div>
                </div>

                {result.warnings.length >
                  0 && (
                  <div className="setlist-generator-preview__warnings">
                    {result.warnings.map(
                      (
                        warning,
                      ) => (
                        <p
                          key={
                            warning
                          }
                        >
                          {
                            warning
                          }
                        </p>
                      ),
                    )}
                  </div>
                )}

                {result.blocks &&
                  result.blocks.length >
                    0 && (
                    <div className="setlist-generator-preview__block-summary">
                      {result.blocks.map(
                        (
                          block,
                          index,
                        ) => (
                          <span
                            key={
                              block.blockId
                            }
                          >
                            {index +
                              1}.{" "}
                            {
                              block.genre
                            }{" "}
                            ·{" "}
                            {
                              block.generatedCount
                            } tracks
                          </span>
                        ),
                      )}
                    </div>
                  )}

                <div className="setlist-generator-preview__tracks">
                  {result.tracks.map(
                    (
                      generatedTrack,
                      index,
                    ) => (
                      <article
                        key={
                          generatedTrack.id
                        }
                      >
                        <span className="setlist-generator-preview__position">
                          {index +
                            1}
                        </span>

                        <div className="setlist-generator-preview__track-copy">
                          <strong>
                            {
                              generatedTrack.title
                            }
                          </strong>

                          <p>
                            {
                              generatedTrack.artist
                            }
                          </p>

                          <div>
                            <span>
                              <Gauge
                                size={12}
                              />
                              {generatedTrack.tempo !==
                              null
                                ? `${Math.round(
                                    generatedTrack.tempo,
                                  )} BPM`
                                : "— BPM"}
                            </span>

                            <span>
                              <Zap
                                size={12}
                              />
                              {
                                generatedTrack.energy ??
                                "—"
                              }
                            </span>

                            <span>
                              <Music2
                                size={12}
                              />
                              Key{" "}
                              {generatedTrack.musicalKey ??
                                "—"}
                            </span>

                            <span>
                              Camelot{" "}
                              {getTrackCamelot(
                                generatedTrack,
                              ) ??
                                "—"}
                            </span>

                            <span>
                              {
                                getTrackGenreLabel(
                                  generatedTrack,
                                )
                              }
                            </span>
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>

                {historicalTrackPriorityEnabled &&
                  preEventPreset && (
                  <div className="setlist-generator-result__history-note">
                    Venue History priority was active for this generation.
                    {preEventPreset.phasePlans &&
                    preEventPreset.phasePlans.length >
                      0
                      ? " Phase-Aware block history was also applied."
                      : ""}
                  </div>
                )}

                <div className="setlist-generator-preview__actions">
                  <button
                    type="button"
                    disabled={
                      result.tracks
                        .length === 0
                    }
                    onClick={() =>
                      onApply(
                        result.tracks,
                        "replace",
                        averagePlaySeconds,
                        buildEventPlan(),
                      )
                    }
                  >
                    Replace Current Set
                  </button>

                  <button
                    type="button"
                    disabled={
                      result.tracks
                        .length === 0
                    }
                    onClick={() =>
                      onApply(
                        result.tracks,
                        "append",
                        averagePlaySeconds,
                        buildEventPlan(),
                      )
                    }
                  >
                    Add to Current Set
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
