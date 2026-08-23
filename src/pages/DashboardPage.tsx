import {
  ArrowRight,
  Clock3,
  Flame,
  FolderHeart,
  History,
  ImageOff,
  ListMusic,
  Music2,
  Play,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import type {
  Playlist,
} from "../types/playlist";

import type {
  Track,
} from "../types/track";

import {
  useDashboardSummary,
} from "../hooks/useDashboardSummary";

import "./DashboardPage.css";

function playlistId(
  playlist:
    Playlist,
): string {
  const record =
    playlist as unknown as Record<
      string,
      unknown
    >;

  return typeof record.id ===
    "string"
    ? record.id
    : "";
}

function playlistName(
  playlist:
    Playlist,
): string {
  const record =
    playlist as unknown as Record<
      string,
      unknown
    >;

  return typeof record.name ===
      "string" &&
    record.name.trim()
    ? record.name
    : "Untitled playlist";
}

function trackId(
  track:
    Track,
): string {
  const record =
    track as unknown as Record<
      string,
      unknown
    >;

  const value =
    record.id ??
    record.songId ??
    record.song_id ??
    record.trackId;

  return typeof value ===
    "string"
    ? value
    : "";
}

function formatDate(
  value:
    string | null,
): string {
  if (!value) {
    return "—";
  }

  const timestamp =
    Date.parse(
      value,
    );

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return value;
  }

  return new Date(
    timestamp,
  ).toLocaleDateString(
    undefined,
    {
      month:
        "short",
      day:
        "numeric",
    },
  );
}

export default function DashboardPage() {
  const navigate =
    useNavigate();

  const {
    summary,
    refresh,
    togglePin,
  } =
    useDashboardSummary();

  function openPlaylist(
    playlist:
      Playlist,
  ) {
    const id =
      playlistId(
        playlist,
      );

    if (id) {
      navigate(
        `/playlists/${id}`,
      );
    }
  }

  function openTrack(
    track:
      Track,
  ) {
    const id =
      trackId(
        track,
      );

    navigate(
      id
        ? `/tracks?track=${encodeURIComponent(
            id,
          )}`
        : "/tracks",
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <span>
            MUSIC LIBRARY
          </span>

          <h1>
            Dashboard
          </h1>

          <p>
            Your DJ workspace, music discovery and quick access.
          </p>
        </div>

        <button
          type="button"
          onClick={
            refresh
          }
        >
          <RefreshCw
            size={14}
          />
          Refresh
        </button>
      </header>

      <section className="dashboard-kpis">
        <button
          type="button"
          onClick={() =>
            navigate(
              "/playlists",
            )
          }
        >
          <ListMusic
            size={16}
          />

          <span>
            Playlists
          </span>

          <strong>
            {
              summary.totalPlaylists
            }
          </strong>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              "/tracks",
            )
          }
        >
          <Music2
            size={16}
          />

          <span>
            Tracks
          </span>

          <strong>
            {
              summary.totalTracks
            }
          </strong>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              "/live",
            )
          }
        >
          <Play
            size={16}
          />

          <span>
            Current Set
          </span>

          <strong>
            {
              summary.currentSetTracks
            }{" "}
            tracks
          </strong>

          <small>
            {
              summary.currentSetName
            }
          </small>
        </button>

        <article>
          <History
            size={16}
          />

          <span>
            Last Session
          </span>

          <strong>
            {summary.lastSession
              ?.eventProfileName ??
              summary.lastSession
                ?.currentSetName ??
              "No sessions"}
          </strong>

          <small>
            {summary.lastSession
              ? `${summary.lastSession.tracksPlayed} tracks${
                  summary.lastSession.overallScore !==
                  null
                    ? ` · ${Math.round(
                        summary.lastSession.overallScore,
                      )}/100`
                    : ""
                }`
              : "Start Live to build history"}
          </small>
        </article>
      </section>

      <div className="dashboard-layout">
        <section className="dashboard-card dashboard-card--playlists">
          <header>
            <div>
              <FolderHeart
                size={15}
              />

              <div>
                <span>
                  QUICK ACCESS
                </span>

                <strong>
                  Playlists
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/playlists",
                )
              }
            >
              View all
              <ArrowRight
                size={12}
              />
            </button>
          </header>

          <div className="dashboard-playlist-grid">
            {summary.quickPlaylists.length ===
            0 ? (
              <p className="dashboard-empty">
                Create a playlist to start building Quick Access.
              </p>
            ) : (
              summary.quickPlaylists.map(
                (item) => {
                  const id =
                    playlistId(
                      item.playlist,
                    );

                  return (
                    <article
                      className="dashboard-playlist-card"
                      key={
                        id ||
                        playlistName(
                          item.playlist,
                        )
                      }
                    >
                      <header>
                        <button
                          type="button"
                          className="dashboard-playlist-card__title"
                          onClick={() =>
                            openPlaylist(
                              item.playlist,
                            )
                          }
                        >
                          <div>
                            <ListMusic
                              size={14}
                            />

                            <div>
                              <strong>
                                {
                                  playlistName(
                                    item.playlist,
                                  )
                                }
                              </strong>

                              <span>
                                {
                                  item.trackCount
                                }{" "}
                                tracks
                              </span>
                            </div>
                          </div>
                        </button>

                        {id && (
                          <button
                            type="button"
                            className={
                              item.pinned
                                ? "dashboard-pin is-pinned"
                                : "dashboard-pin"
                            }
                            title={
                              item.pinned
                                ? "Unpin playlist"
                                : "Pin playlist"
                            }
                            onClick={() =>
                              togglePin(
                                id,
                              )
                            }
                          >
                            <Star
                              size={13}
                            />
                          </button>
                        )}
                      </header>

                      <div className="dashboard-playlist-card__recent">
                        {item.recentTracks.length ===
                        0 ? (
                          <p>
                            No matching tracks found in library.
                          </p>
                        ) : (
                          item.recentTracks.map(
                            (
                              recent,
                              index,
                            ) => (
                              <button
                                type="button"
                                key={
                                  trackId(
                                    recent.track,
                                  ) ||
                                  `${recent.title}-${recent.artist}-${index}`
                                }
                                onClick={() =>
                                  openTrack(
                                    recent.track,
                                  )
                                }
                              >
                                {recent.artworkUrl ? (
                                  <img
                                    src={
                                      recent.artworkUrl
                                    }
                                    alt=""
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className="dashboard-track-artwork-placeholder">
                                    <ImageOff
                                      size={14}
                                    />
                                  </span>
                                )}

                                <div>
                                  <strong>
                                    {
                                      recent.title
                                    }
                                  </strong>

                                  <span>
                                    {
                                      recent.artist
                                    }
                                  </span>
                                </div>
                              </button>
                            ),
                          )
                        )}
                      </div>

                      <footer>
                        <span>
                          Latest added tracks
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            openPlaylist(
                              item.playlist,
                            )
                          }
                        >
                          Open
                          <ArrowRight
                            size={11}
                          />
                        </button>
                      </footer>
                    </article>
                  );
                },
              )
            )}
          </div>
        </section>

        <section className="dashboard-card">
          <header>
            <div>
              <Flame
                size={15}
              />

              <div>
                <span>
                  PERFORMANCE HISTORY
                </span>

                <strong>
                  Most Played
                </strong>
              </div>
            </div>
          </header>

          <div className="dashboard-track-list">
            {summary.mostPlayedTracks.length ===
            0 ? (
              <p className="dashboard-empty">
                Your most-played tracks will appear after Live sessions.
              </p>
            ) : (
              summary.mostPlayedTracks.map(
                (item) => (
                  <button
                    type="button"
                    key={
                      trackId(
                        item.track,
                      ) ||
                      `${item.title}-${item.artist}`
                    }
                    onClick={() =>
                      openTrack(
                        item.track,
                      )
                    }
                  >
                    <TrendingUp
                      size={13}
                    />

                    <div>
                      <strong>
                        {
                          item.title
                        }
                      </strong>

                      <span>
                        {
                          item.artist
                        }
                      </span>
                    </div>

                    <b>
                      {
                        item.playCount
                      }
                      ×
                    </b>
                  </button>
                ),
              )
            )}
          </div>
        </section>

        <section className="dashboard-card">
          <header>
            <div>
              <Clock3
                size={15}
              />

              <div>
                <span>
                  MUSIC DISCOVERY
                </span>

                <strong>
                  New in Your Library
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/tracks",
                )
              }
            >
              Explore
              <ArrowRight
                size={12}
              />
            </button>
          </header>

          <div className="dashboard-track-list">
            {summary.newTracks.length ===
            0 ? (
              <p className="dashboard-empty">
                No releases from the last 60 days were found in the current library.
              </p>
            ) : (
              summary.newTracks
                .slice(
                  0,
                  6,
                )
                .map(
                  (item) => (
                    <button
                      type="button"
                      key={
                        trackId(
                          item.track,
                        ) ||
                        `${item.title}-${item.artist}`
                      }
                      onClick={() =>
                        openTrack(
                          item.track,
                        )
                      }
                    >
                      <Sparkles
                        size={13}
                      />

                      <div>
                        <strong>
                          {
                            item.title
                          }
                        </strong>

                        <span>
                          {
                            item.artist
                          }
                          {item.genre
                            ? ` · ${item.genre}`
                            : ""}
                        </span>
                      </div>

                      <b>
                        {
                          formatDate(
                            item.releaseDate,
                          )
                        }
                      </b>
                    </button>
                  ),
                )
            )}
          </div>
        </section>

        <section className="dashboard-card dashboard-card--suggested">
          <header>
            <div>
              <Sparkles
                size={15}
              />

              <div>
                <span>
                  FLAMINGO SUGGESTS
                </span>

                <strong>
                  New Tracks Worth Checking
                </strong>
              </div>
            </div>
          </header>

          <p className="dashboard-card__explanation">
            Recent unplayed tracks are ranked using style affinity from
            your most-played Live history, then Spotify popularity.
          </p>

          <div className="dashboard-suggestion-grid">
            {summary.suggestedTracks.length ===
            0 ? (
              <p className="dashboard-empty">
                More Live history or recent releases are needed to build suggestions.
              </p>
            ) : (
              summary.suggestedTracks.map(
                (item) => (
                  <button
                    type="button"
                    key={
                      trackId(
                        item.track,
                      ) ||
                      `${item.title}-${item.artist}`
                    }
                    onClick={() =>
                      openTrack(
                        item.track,
                      )
                    }
                  >
                    <div>
                      <span>
                        NEW MATCH
                      </span>

                      <strong>
                        {
                          item.title
                        }
                      </strong>

                      <small>
                        {
                          item.artist
                        }
                      </small>
                    </div>

                    <footer>
                      <span>
                        {item.genre ??
                          "Unknown style"}
                      </span>

                      <b>
                        {item.popularity !==
                        null
                          ? `Pop ${Math.round(
                              item.popularity,
                            )}`
                          : formatDate(
                              item.releaseDate,
                            )}
                      </b>
                    </footer>
                  </button>
                ),
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
