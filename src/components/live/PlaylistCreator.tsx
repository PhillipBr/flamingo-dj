import {
  Clock3,
  Disc3,
  ExternalLink,
  Flame,
  LogIn,
  LogOut,
  Music2,
  Save,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  CurrentSet,
} from "../../types/setlist";

import type {
  Playlist,
} from "../../types/playlist";

import type {
  Track,
} from "../../types/track";

import {
  createCurrentSetItem,
  formatSetDuration,
} from "../../utils/currentSetStorage";

import {
  createPlaylistId,
  loadPlaylists,
  savePlaylists,
} from "../../utils/playlistStorage";

import {
  createPlaylistFromPlan,
  type PlaylistCreatorConfig,
  type PlaylistCreatorPhase,
  type PlaylistCreatorResult,
} from "../../utils/playlistCreator";

import {
  SPOTIFY_AUTH_CHANGED_EVENT,
  beginSpotifyAuthorization,
  createSpotifyPlaylistFromTracks,
  disconnectSpotify,
  isSpotifyConfigured,
  isSpotifyConnected,
} from "../../utils/spotifyApi";

import {
  hydrateTracksWithSpotifyUrls,
} from "../../utils/trackExtraLoader";

import "./PlaylistCreator.css";

type Props = {
  tracks: Track[];
  playlists: Playlist[];

  setCurrentSet: Dispatch<
    SetStateAction<CurrentSet>
  >;
};

const DEFAULT_SOURCE_NAMES = [
  "west coast hip hop",
  "east coast hip hop",
  "r&b 90-2000",
  "r and b 90-2000",
];

const DEFAULT_PHASES:
  PlaylistCreatorPhase[] = [
    {
      id: "warmup",
      label: "Warm Up",
      minutes: 20,
      energyMin: 5,
      energyMax: 6,
      popularityMin: 45,
      hitBias: 0.15,
    },
    {
      id: "build",
      label: "Build",
      minutes: 30,
      energyMin: 6,
      energyMax: 7,
      popularityMin: 50,
      hitBias: 0.3,
    },
    {
      id: "peak",
      label: "Peak",
      minutes: 30,
      energyMin: 7,
      energyMax: 9,
      popularityMin: 65,
      hitBias: 0.75,
    },
    {
      id: "reset",
      label: "Reset",
      minutes: 15,
      energyMin: 5,
      energyMax: 7,
      popularityMin: 50,
      hitBias: 0.2,
    },
    {
      id: "final-peak",
      label: "Final Peak",
      minutes: 25,
      energyMin: 7,
      energyMax: 10,
      popularityMin: 75,
      hitBias: 1,
    },
  ];

function normalizeName(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

function isDefaultSource(
  playlist: Playlist,
): boolean {
  const normalized =
    normalizeName(
      playlist.name,
    );

  return DEFAULT_SOURCE_NAMES.some(
    (target) =>
      normalized.includes(
        normalizeName(
          target,
        ),
      ) ||
      normalizeName(
        target,
      ).includes(
        normalized,
      ),
  );
}

function defaultSourceWeight(
  playlist: Playlist,
): number {
  const normalized =
    normalizeName(
      playlist.name,
    );

  if (
    normalized.includes(
      "r and b",
    )
  ) {
    return 34;
  }

  return 33;
}

function formatMinutes(
  seconds: number,
): string {
  return formatSetDuration(
    seconds,
  );
}

export default function PlaylistCreator({
  tracks,
  playlists,
  setCurrentSet,
}: Props) {
  const defaultSources =
    useMemo(
      () =>
        playlists.filter(
          isDefaultSource,
        ),
      [playlists],
    );

  const [
    selectedSourceIds,
    setSelectedSourceIds,
  ] = useState<string[]>(
    () =>
      defaultSources.map(
        (playlist) =>
          playlist.id,
      ),
  );

  const [
    sourceWeights,
    setSourceWeights,
  ] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      defaultSources.map(
        (playlist) => [
          playlist.id,
          defaultSourceWeight(
            playlist,
          ),
        ],
      ),
    ),
  );

  const [
    name,
    setName,
  ] = useState(
    "90s Hip Hop & R&B Party",
  );

  const [
    durationMinutes,
    setDurationMinutes,
  ] = useState(120);

  const [
    playlistSize,
    setPlaylistSize,
  ] = useState(240);

  const [
    averagePlaySeconds,
    setAveragePlaySeconds,
  ] = useState(150);

  const [
    globalPopularityMin,
    setGlobalPopularityMin,
  ] = useState(45);

  const [
    globalEnergyMin,
    setGlobalEnergyMin,
  ] = useState(5);

  const [
    globalEnergyMax,
    setGlobalEnergyMax,
  ] = useState(10);

  const [
    releaseYearFrom,
    setReleaseYearFrom,
  ] = useState<number | null>(
    1990,
  );

  const [
    releaseYearTo,
    setReleaseYearTo,
  ] = useState<number | null>(
    2000,
  );

  const [
    harmonicPriority,
    setHarmonicPriority,
  ] = useState<
    PlaylistCreatorConfig["harmonicPriority"]
  >("balanced");

  const [
    bpmMovement,
    setBpmMovement,
  ] = useState<
    PlaylistCreatorConfig["bpmMovement"]
  >("dynamic");

  const [
    artistSpacing,
    setArtistSpacing,
  ] = useState(4);

  const [
    maxSameSource,
    setMaxSameSource,
  ] = useState(3);

  const [
    reserveTopHits,
    setReserveTopHits,
  ] = useState(true);

  const [
    reserveHitCount,
    setReserveHitCount,
  ] = useState(24);

  const [
    phases,
    setPhases,
  ] = useState<
    PlaylistCreatorPhase[]
  >(
    DEFAULT_PHASES,
  );

  const [
    isAdvancedOpen,
    setIsAdvancedOpen,
  ] = useState(false);

  const [
    result,
    setResult,
  ] = useState<
    PlaylistCreatorResult | null
  >(null);


  const [
    spotifyConnected,
    setSpotifyConnected,
  ] = useState(
    () =>
      isSpotifyConnected(),
  );

  const [
    spotifyPublic,
    setSpotifyPublic,
  ] = useState(false);

  const [
    spotifyBusy,
    setSpotifyBusy,
  ] = useState(false);

  const [
    spotifyStatus,
    setSpotifyStatus,
  ] = useState<string | null>(
    null,
  );

  const [
    spotifyPlaylistUrl,
    setSpotifyPlaylistUrl,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    function refreshSpotifyState() {
      setSpotifyConnected(
        isSpotifyConnected(),
      );
    }

    window.addEventListener(
      SPOTIFY_AUTH_CHANGED_EVENT,
      refreshSpotifyState,
    );

    return () => {
      window.removeEventListener(
        SPOTIFY_AUTH_CHANGED_EVENT,
        refreshSpotifyState,
      );
    };
  }, []);

  const selectedPlaylists =
    useMemo(
      () =>
        playlists.filter(
          (playlist) =>
            selectedSourceIds.includes(
              playlist.id,
            ),
        ),
      [
        playlists,
        selectedSourceIds,
      ],
    );

  const candidateTrackCount =
    useMemo(
      () =>
        new Set(
          selectedPlaylists.flatMap(
            (playlist) =>
              playlist.trackIds,
          ),
        ).size,
      [selectedPlaylists],
    );

  const phaseMinutes =
    phases.reduce(
      (
        total,
        phase,
      ) =>
        total +
        phase.minutes,
      0,
    );

  function toggleSource(
    playlistId: string,
  ) {
    setSelectedSourceIds(
      (current) =>
        current.includes(
          playlistId,
        )
          ? current.filter(
              (id) =>
                id !==
                playlistId,
            )
          : [
              ...current,
              playlistId,
            ],
    );
  }

  function updatePhase(
    phaseId:
      PlaylistCreatorPhase["id"],
    patch:
      Partial<PlaylistCreatorPhase>,
  ) {
    setPhases(
      (current) =>
        current.map(
          (phase) =>
            phase.id ===
            phaseId
              ? {
                  ...phase,
                  ...patch,
                }
              : phase,
        ),
    );
  }

  function handleGenerate() {
    if (
      selectedSourceIds.length ===
      0
    ) {
      window.alert(
        "Select at least one source playlist.",
      );

      return;
    }

    if (
      phaseMinutes !==
      durationMinutes
    ) {
      const continueAnyway =
        window.confirm(
          `Your phases total ${phaseMinutes} minutes, but the set duration is ${durationMinutes} minutes.\n\nGenerate using the phase plan anyway?`,
        );

      if (
        !continueAnyway
      ) {
        return;
      }
    }

    const config:
      PlaylistCreatorConfig = {
      name,

      durationMinutes,
      playlistSize,
      averagePlaySeconds,

      globalPopularityMin,
      globalEnergyMin,
      globalEnergyMax,

      releaseYearFrom,
      releaseYearTo,

      harmonicPriority,
      bpmMovement,

      artistSpacing,
      maxSameSource,

      reserveTopHits,
      reserveHitCount,

      sources:
        selectedSourceIds.map(
          (playlistId) => ({
            playlistId,
            weight:
              sourceWeights[
                playlistId
              ] ?? 1,
          }),
        ),

      phases,
    };

    setResult(
      createPlaylistFromPlan(
        tracks,
        playlists,
        config,
      ),
    );
  }

  function handleUseInLive() {
    if (
      !result ||
      result.items.length ===
        0
    ) {
      return;
    }

    const now =
      new Date().toISOString();

    setCurrentSet({
      id:
        "current-set",

      name:
        result.name,

      items:
        result.items.map(
          (item) =>
            createCurrentSetItem(
              item.track.id,
              item.plannedPlaySeconds,
            ),
        ),

      createdAt:
        now,

      updatedAt:
        now,
    });
  }

  function handleSavePlaylist() {
    if (
      !result ||
      result.items.length ===
        0
    ) {
      return;
    }

    const playlistId =
      createPlaylistId(
        result.name,
      );

    const now =
      new Date().toISOString();

    const generatedPlaylist:
      Playlist = {
      id:
        playlistId,

      name:
        result.name,

      description:
        "FLAMINGO GENERATED · Built in Live Playlist Creator from multiple source playlists using phase-aware Energy, Popularity, BPM, harmonic compatibility, source balance and hit reserve.",

      category:
        "Flamingo Generated",

      trackIds:
        result.items.map(
          (item) =>
            item.track.id,
        ),

      updatedAt:
        now,

      keywords: [
        "flamingo-generated",
        "live",
        "playlist-creator",
        "party",
      ],
    };

    const currentPlaylists =
      loadPlaylists();

    savePlaylists([
      generatedPlaylist,
      ...currentPlaylists.filter(
        (playlist) =>
          playlist.id !==
          playlistId,
      ),
    ]);

    window.dispatchEvent(
      new Event(
        "flamingo-dj-playlists-updated",
      ),
    );

    window.alert(
      `"${generatedPlaylist.name}" saved as a Flamingo Generated playlist.`,
    );
  }


  async function handleConnectSpotify() {
    try {
      setSpotifyStatus(
        null,
      );

      await beginSpotifyAuthorization(
        "#/live",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      window.alert(
        message,
      );
    }
  }

  function handleDisconnectSpotify() {
    disconnectSpotify();

    setSpotifyConnected(
      false,
    );

    setSpotifyPlaylistUrl(
      null,
    );

    setSpotifyStatus(
      "Spotify disconnected.",
    );
  }

  async function handleCreateOnSpotify() {
    if (
      !result ||
      result.items.length ===
        0
    ) {
      return;
    }

    if (
      !isSpotifyConfigured()
    ) {
      window.alert(
        "Spotify is not configured yet. Add VITE_SPOTIFY_CLIENT_ID and register the redirect URI in Spotify Developer Dashboard.",
      );

      return;
    }

    if (
      !isSpotifyConnected()
    ) {
      window.alert(
        "Connect Spotify first, then create the generated playlist.",
      );

      return;
    }

    setSpotifyBusy(
      true,
    );

    setSpotifyStatus(
      "Loading Spotify URLs from tracks-extra.json...",
    );

    setSpotifyPlaylistUrl(
      null,
    );

    try {
      /*
       * IMPORTANT:
       * Playlist Creator works from CORE tracks for fast initial loading.
       * spotifyUrl intentionally lives in tracks-extra.json.
       *
       * Load EXTRA only here, when Spotify export actually needs it.
       */
      const sourceTracks =
        result.items.map(
          (item) =>
            item.track,
        );

      const hydrated =
        await hydrateTracksWithSpotifyUrls(
          sourceTracks,
        );

      if (
        hydrated.found ===
        0
      ) {
        throw new Error(
          "No generated track could be matched to a Spotify URL in tracks-extra.json.",
        );
      }

      setSpotifyStatus(
        `Spotify URLs loaded: ${hydrated.found}/${hydrated.tracks.length}. Creating playlist...`,
      );

      const created =
        await createSpotifyPlaylistFromTracks(
          {
            name:
              result.name,

            description:
              "Flamingo Generated · Live Playlist Creator · ordered DJ journey.",

            isPublic:
              spotifyPublic,

            /*
             * Hydrated tracks keep the EXACT order generated by Flamingo.
             */
            tracks:
              hydrated.tracks,
          },
        );

      setSpotifyPlaylistUrl(
        created.playlistUrl,
      );

      const skipped =
        created.skippedTracks
          .length;

      setSpotifyStatus(
        skipped > 0
          ? `Spotify playlist created: ${created.addedTracks}/${created.requestedTracks} tracks added · ${skipped} skipped because Spotify URL was unavailable.`
          : `Spotify playlist created: ${created.addedTracks} tracks added in Flamingo Play Order.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      setSpotifyStatus(
        message,
      );

      window.alert(
        message,
      );
    } finally {
      setSpotifyBusy(
        false,
      );
    }
  }

  return (
    <section className="playlist-creator">
      <header className="playlist-creator__hero">
        <div>
          <span>
            LIVE · PLAYLIST CREATOR
          </span>

          <h2>
            Build a planned DJ set
          </h2>

          <p>
            Combine source playlists and let Flamingo create a dynamic set with Warm Up, Build, Peak, Reset and Final Peak.
          </p>
        </div>

        <div className="playlist-creator__target">
          <Clock3
            size={18}
          />

          <strong>
            {durationMinutes} min
          </strong>

          <small>
            event · {playlistSize} track pool
          </small>
        </div>
      </header>

      <div className="playlist-creator__layout">
        <section className="playlist-creator__card">
          <header>
            <div>
              <Sparkles
                size={15}
              />

              <strong>
                Sources
              </strong>
            </div>

            <small>
              {candidateTrackCount} unique tracks
            </small>
          </header>

          <div className="playlist-creator__sources">
            {playlists.map(
              (playlist) => {
                const checked =
                  selectedSourceIds.includes(
                    playlist.id,
                  );

                return (
                  <label
                    key={
                      playlist.id
                    }
                    className={
                      checked
                        ? "playlist-creator__source is-active"
                        : "playlist-creator__source"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={
                        checked
                      }
                      onChange={() =>
                        toggleSource(
                          playlist.id,
                        )
                      }
                    />

                    <div>
                      <strong>
                        {playlist.name}
                      </strong>

                      <small>
                        {playlist.trackIds.length} tracks
                      </small>
                    </div>

                    {checked && (
                      <input
                        className="playlist-creator__weight"
                        type="number"
                        min={1}
                        max={100}
                        value={
                          sourceWeights[
                            playlist.id
                          ] ?? 33
                        }
                        title="Source weight"
                        onChange={(
                          event,
                        ) =>
                          setSourceWeights(
                            (
                              current,
                            ) => ({
                              ...current,

                              [playlist.id]:
                                Number(
                                  event.target
                                    .value,
                                ) ||
                                1,
                            }),
                          )
                        }
                      />
                    )}
                  </label>
                );
              },
            )}
          </div>
        </section>

        <section className="playlist-creator__card">
          <header>
            <div>
              <SlidersHorizontal
                size={15}
              />

              <strong>
                Set parameters
              </strong>
            </div>
          </header>

          <div className="playlist-creator__form">
            <label className="playlist-creator__wide">
              <span>
                Playlist name
              </span>

              <input
                value={
                  name
                }
                onChange={(
                  event,
                ) =>
                  setName(
                    event.target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Duration
              </span>

              <select
                value={
                  durationMinutes
                }
                onChange={(
                  event,
                ) =>
                  setDurationMinutes(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              >
                <option value={60}>
                  1 hour
                </option>

                <option value={90}>
                  1.5 hours
                </option>

                <option value={120}>
                  2 hours
                </option>

                <option value={180}>
                  3 hours
                </option>

                <option value={240}>
                  4 hours
                </option>
              </select>
            </label>

            <label>
              <span>
                Playlist size
              </span>

              <input
                type="number"
                min={20}
                max={1000}
                step={10}
                value={
                  playlistSize
                }
                onChange={(
                  event,
                ) =>
                  setPlaylistSize(
                    Math.max(
                      20,
                      Number(
                        event.target
                          .value,
                      ) || 20,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span>
                Avg live play / track
              </span>

              <select
                value={
                  averagePlaySeconds
                }
                onChange={(
                  event,
                ) =>
                  setAveragePlaySeconds(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              >
                <option value={120}>
                  2:00
                </option>

                <option value={150}>
                  2:30
                </option>

                <option value={180}>
                  3:00
                </option>
              </select>
            </label>

            <label>
              <span>
                Min Popularity
              </span>

              <input
                type="number"
                min={0}
                max={100}
                value={
                  globalPopularityMin
                }
                onChange={(
                  event,
                ) =>
                  setGlobalPopularityMin(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span>
                Energy Min
              </span>

              <input
                type="number"
                min={1}
                max={10}
                value={
                  globalEnergyMin
                }
                onChange={(
                  event,
                ) =>
                  setGlobalEnergyMin(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span>
                Energy Max
              </span>

              <input
                type="number"
                min={1}
                max={10}
                value={
                  globalEnergyMax
                }
                onChange={(
                  event,
                ) =>
                  setGlobalEnergyMax(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span>
                Release From
              </span>

              <input
                type="number"
                value={
                  releaseYearFrom ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  setReleaseYearFrom(
                    event.target.value
                      ? Number(
                          event.target
                            .value,
                        )
                      : null,
                  )
                }
              />
            </label>

            <label>
              <span>
                Release To
              </span>

              <input
                type="number"
                value={
                  releaseYearTo ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  setReleaseYearTo(
                    event.target.value
                      ? Number(
                          event.target
                            .value,
                        )
                      : null,
                  )
                }
              />
            </label>

            <label>
              <span>
                Harmonic
              </span>

              <select
                value={
                  harmonicPriority
                }
                onChange={(
                  event,
                ) =>
                  setHarmonicPriority(
                    event.target
                      .value as
                      PlaylistCreatorConfig["harmonicPriority"],
                  )
                }
              >
                <option value="low">
                  Low
                </option>

                <option value="balanced">
                  Balanced
                </option>

                <option value="high">
                  High
                </option>
              </select>
            </label>

            <label>
              <span>
                BPM Movement
              </span>

              <select
                value={
                  bpmMovement
                }
                onChange={(
                  event,
                ) =>
                  setBpmMovement(
                    event.target
                      .value as
                      PlaylistCreatorConfig["bpmMovement"],
                  )
                }
              >
                <option value="smooth">
                  Smooth
                </option>

                <option value="dynamic">
                  Dynamic
                </option>

                <option value="free">
                  Free
                </option>
              </select>
            </label>

            <label>
              <span>
                Artist spacing
              </span>

              <select
                value={
                  artistSpacing
                }
                onChange={(
                  event,
                ) =>
                  setArtistSpacing(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              >
                <option value={3}>
                  3 tracks
                </option>

                <option value={4}>
                  4 tracks
                </option>

                <option value={5}>
                  5 tracks
                </option>

                <option value={7}>
                  7 tracks
                </option>
              </select>
            </label>

            <label>
              <span>
                Max same source
              </span>

              <select
                value={
                  maxSameSource
                }
                onChange={(
                  event,
                ) =>
                  setMaxSameSource(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              >
                <option value={2}>
                  2 tracks
                </option>

                <option value={3}>
                  3 tracks
                </option>

                <option value={4}>
                  4 tracks
                </option>
              </select>
            </label>
          </div>

          <label className="playlist-creator__reserve">
            <input
              type="checkbox"
              checked={
                reserveTopHits
              }
              onChange={(
                event,
              ) =>
                setReserveTopHits(
                  event.target
                    .checked,
                )
              }
            />

            <Flame
              size={15}
            />

            <div>
              <strong>
                Reserve strongest hits for Final Peak
              </strong>

              <span>
                Hold back roughly the strongest 10% of the pool so early phases do not consume the biggest Popularity + Energy tracks.
              </span>
            </div>

            <input
              type="number"
              min={1}
              max={60}
              disabled={
                !reserveTopHits
              }
              value={
                reserveHitCount
              }
              onChange={(
                event,
              ) =>
                setReserveHitCount(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </label>

          <section className="playlist-creator__spotify">
            <div className="playlist-creator__spotify-main">
              <Music2
                size={16}
              />

              <div>
                <strong>
                  Spotify
                </strong>

                <span>
                  {spotifyConnected
                    ? "Connected · generated tracks can be copied in Play Order."
                    : "Connect once to create playlists directly in your Spotify account."}
                </span>
              </div>
            </div>

            <div className="playlist-creator__spotify-controls">
              <label>
                <input
                  type="checkbox"
                  checked={
                    spotifyPublic
                  }
                  onChange={(
                    event,
                  ) =>
                    setSpotifyPublic(
                      event.target
                        .checked,
                    )
                  }
                />

                Public
              </label>

              {spotifyConnected ? (
                <button
                  type="button"
                  onClick={
                    handleDisconnectSpotify
                  }
                >
                  <LogOut
                    size={14}
                  />
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    !isSpotifyConfigured()
                  }
                  onClick={
                    handleConnectSpotify
                  }
                >
                  <LogIn
                    size={14}
                  />
                  Connect Spotify
                </button>
              )}
            </div>
          </section>

          <button
            className="playlist-creator__advanced-toggle"
            type="button"
            onClick={() =>
              setIsAdvancedOpen(
                (current) =>
                  !current,
              )
            }
          >
            <SlidersHorizontal
              size={14}
            />

            {isAdvancedOpen
              ? "Hide advanced journey"
              : "Advanced journey settings"}
          </button>
        </section>
      </div>

      {isAdvancedOpen && (
        <section className="playlist-creator__phases">
          <header>
            <div>
              <WandSparkles
                size={15}
              />

              <strong>
                Party Journey
              </strong>
            </div>

            <small
              className={
                phaseMinutes ===
                durationMinutes
                  ? "is-valid"
                  : "is-warning"
              }
            >
              {phaseMinutes} /{" "}
              {durationMinutes} min · BPM continuity is strict inside each phase; Reset can change BPM zone
            </small>
          </header>

          <div className="playlist-creator__phase-grid">
            {phases.map(
              (phase) => (
                <article
                  key={
                    phase.id
                  }
                  className={`playlist-creator__phase playlist-creator__phase--${phase.id}`}
                >
                  <strong>
                    {phase.label}
                  </strong>

                  <label>
                    <span>
                      Minutes
                    </span>

                    <input
                      type="number"
                      min={5}
                      value={
                        phase.minutes
                      }
                      onChange={(
                        event,
                      ) =>
                        updatePhase(
                          phase.id,
                          {
                            minutes:
                              Number(
                                event.target
                                  .value,
                              ),
                          },
                        )
                      }
                    />
                  </label>

                  <div>
                    <label>
                      <span>
                        Energy Min
                      </span>

                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={
                          phase.energyMin
                        }
                        onChange={(
                          event,
                        ) =>
                          updatePhase(
                            phase.id,
                            {
                              energyMin:
                                Number(
                                  event.target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>
                        Energy Max
                      </span>

                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={
                          phase.energyMax
                        }
                        onChange={(
                          event,
                        ) =>
                          updatePhase(
                            phase.id,
                            {
                              energyMax:
                                Number(
                                  event.target
                                    .value,
                                ),
                            },
                          )
                        }
                      />
                    </label>
                  </div>

                  <label>
                    <span>
                      Popularity Min
                    </span>

                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={
                        phase.popularityMin
                      }
                      onChange={(
                        event,
                      ) =>
                        updatePhase(
                          phase.id,
                          {
                            popularityMin:
                              Number(
                                event.target
                                  .value,
                              ),
                          },
                        )
                      }
                    />
                  </label>
                </article>
              ),
            )}
          </div>
        </section>
      )}

      <button
        className="playlist-creator__generate"
        type="button"
        disabled={
          selectedSourceIds.length ===
          0
        }
        onClick={
          handleGenerate
        }
      >
        <Sparkles
          size={17}
        />

        Generate Playlist
      </button>

      {result && (
        <section className="playlist-creator__result">
          <header>
            <div>
              <span>
                FLAMINGO GENERATED
              </span>

              <h3>
                {result.name}
              </h3>

              <p>
                {result.items.length} prepared tracks ·{" "}
                ~{Math.max(
                  1,
                  Math.round(
                    result.targetSeconds /
                      averagePlaySeconds,
                  ),
                )}{" "}
                playable in {formatMinutes(
                  result.targetSeconds,
                )}
              </p>
            </div>

            <div className="playlist-creator__result-actions">
              <button
                type="button"
                onClick={
                  handleSavePlaylist
                }
              >
                <Save
                  size={15}
                />
                Save Playlist
              </button>


              <button
                type="button"
                disabled={
                  spotifyBusy ||
                  !spotifyConnected
                }
                onClick={
                  handleCreateOnSpotify
                }
              >
                <Music2
                  size={15}
                />
                {spotifyBusy
                  ? "Creating..."
                  : "Create on Spotify"}
              </button>

              <button
                className="is-primary"
                type="button"
                onClick={
                  handleUseInLive
                }
              >
                <Disc3
                  size={15}
                />
                Use in Live
              </button>
            </div>
          </header>

          {(spotifyStatus ||
            spotifyPlaylistUrl) && (
            <div className="playlist-creator__spotify-result">
              <span>
                {spotifyStatus}
              </span>

              {spotifyPlaylistUrl && (
                <a
                  href={
                    spotifyPlaylistUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink
                    size={13}
                  />
                  Open in Spotify
                </a>
              )}
            </div>
          )}

          <div className="playlist-creator__result-table">
            {result.items.map(
              (
                item,
                index,
              ) => {
                const previous =
                  index > 0
                    ? result.items[
                        index - 1
                      ]
                    : null;

                const showPhase =
                  !previous ||
                  previous.phaseId !==
                    item.phaseId;

                return (
                  <div
                    key={
                      item.track.id
                    }
                  >
                    {showPhase && (
                      <div
                        className={`playlist-creator__phase-divider playlist-creator__phase-divider--${item.phaseId}`}
                      >
                        {item.phaseLabel}
                      </div>
                    )}

                    <article className="playlist-creator__result-row">
                      <span>
                        {index + 1}
                      </span>

                      <div>
                        <strong>
                          {item.track.title}
                        </strong>

                        <small>
                          {item.track.artist}
                        </small>
                      </div>

                      <b>
                        {item.track.tempo ==
                        null
                          ? "—"
                          : `${Math.round(
                              item.track
                                .tempo,
                            )} BPM`}
                      </b>

                      <b>
                        {item.track
                          .musicalKey ??
                          "—"}
                      </b>

                      <b>
                        E
                        {item.track.energy ??
                          "—"}
                      </b>

                      <b>
                        P
                        {item.track
                          .spotifyPopularity ??
                          "—"}
                      </b>
                    </article>
                  </div>
                );
              },
            )}
          </div>
        </section>
      )}
    </section>
  );
}
