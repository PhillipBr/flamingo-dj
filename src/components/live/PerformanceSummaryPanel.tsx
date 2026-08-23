import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  History,
  Music2,
  Trash2,
  X,
} from "lucide-react";

import type {
  LivePerformanceRecord,
} from "../../types/livePerformance";

import {
  useDJCoach,
} from "../../hooks/useDJCoach";

import {
  useVenueCoach,
} from "../../hooks/useVenueCoach";

import {
  useVenuePhaseLearning,
} from "../../hooks/useVenuePhaseLearning";

import {
  loadEventProfileState,
} from "../../utils/eventProfileStorage";

import DJCoachPanel from "./DJCoachPanel";
import TrackPerformancePanel from "./TrackPerformancePanel";
import VenueCoachPanel from "./VenueCoachPanel";
import VenuePhaseLearningPanel from "./VenuePhaseLearningPanel";

import "./PerformanceSummaryPanel.css";

type PerformanceSummaryPanelProps = {
  isOpen: boolean;

  history:
    readonly LivePerformanceRecord[];

  selectedRecord:
    LivePerformanceRecord | null;

  onSelectRecord: (
    record:
      LivePerformanceRecord,
  ) => void;

  onDeleteRecord: (
    recordId:
      string,
  ) => void;

  onClose:
    () => void;
};

function formatDuration(
  seconds: number,
): string {
  const safe =
    Math.max(
      0,
      Math.round(
        seconds,
      ),
    );

  const hours =
    Math.floor(
      safe / 3600,
    );

  const minutes =
    Math.floor(
      (
        safe % 3600
      ) / 60,
    );

  const remainingSeconds =
    safe % 60;

  if (hours > 0) {
    return `${hours}h ${minutes
      .toString()
      .padStart(
        2,
        "0",
      )}m`;
  }

  return `${minutes}m ${remainingSeconds
    .toString()
    .padStart(
      2,
      "0",
    )}s`;
}

function formatNumber(
  value: number | null,
  decimals = 1,
): string {
  return value ===
    null
    ? "—"
    : value.toFixed(
        decimals,
      );
}

export default function PerformanceSummaryPanel({
  isOpen,
  history,
  selectedRecord,
  onSelectRecord,
  onDeleteRecord,
  onClose,
}: PerformanceSummaryPanelProps) {
  const {
    trackPerformance,
    coach,
  } =
    useDJCoach(
      history,
    );

  const eventProfileState =
    loadEventProfileState();

  const activeEventProfile =
    eventProfileState.profiles.find(
      (profile) =>
        profile.id ===
        eventProfileState.activeProfileId,
    ) ??
    null;

  const venueCoach =
    useVenueCoach(
      history,
      activeEventProfile,
    );

  const venuePhaseLearning =
    useVenuePhaseLearning(
      history,
      activeEventProfile,
    );

  if (!isOpen) {
    return null;
  }

  const record =
    selectedRecord ??
    history[0] ??
    null;

  return (
    <aside className="performance-summary-panel">
      <header className="performance-summary-panel__header">
        <div>
          <p>
            <BarChart3
              size={14}
            />
            Performance Analytics
          </p>

          <h2>
            Live Session History
          </h2>
        </div>

        <button
          type="button"
          aria-label="Close performance analytics"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <div className="performance-summary-panel__layout">
        <nav className="performance-history-list">
          <header>
            <History
              size={13}
            />
            <strong>
              Sessions
            </strong>
            <span>
              {history.length}
            </span>
          </header>

          {history.length ===
          0 ? (
            <div className="performance-history-list__empty">
              End a Live session to create the first report.
            </div>
          ) : (
            history.map(
              (item) => (
                <button
                  className={
                    record?.id ===
                    item.id
                      ? "performance-history-item performance-history-item--active"
                      : "performance-history-item"
                  }
                  key={
                    item.id
                  }
                  type="button"
                  onClick={() =>
                    onSelectRecord(
                      item,
                    )
                  }
                >
                  <strong>
                    {
                      item.name
                    }
                  </strong>

                  <span>
                    {new Date(
                      item.endedAt,
                    ).toLocaleString()}
                  </span>

                  <small>
                    {
                      item.tracks
                        .length
                    }{" "}
                    tracks ·{" "}
                    {formatDuration(
                      item.durationSeconds,
                    )}
                  </small>
                </button>
              ),
            )
          )}
        </nav>

        <main className="performance-summary-content">
          <DJCoachPanel
            coach={
              coach
            }
          />

          <VenueCoachPanel
            summary={
              venueCoach
            }
          />

          <VenuePhaseLearningPanel
            summary={
              venuePhaseLearning
            }
          />

          <TrackPerformancePanel
            tracks={
              trackPerformance
            }
          />

          {!record ? (
            <div className="performance-summary-content__empty">
              <Music2
                size={38}
              />
              <strong>
                No performance report
              </strong>
              <p>
                Start a Live session, play tracks, record audience responses and finish the session.
              </p>
            </div>
          ) : (
            <>
              <section className="performance-summary-hero">
                <div>
                  <span>
                    Performance Score
                  </span>

                  <strong>
                    {
                      record.scores
                        .overall
                    }
                  </strong>

                  <small>
                    / 100
                  </small>
                </div>

                <div>
                  <h3>
                    {
                      record.name
                    }
                  </h3>

                  <p>
                    {
                      record.currentSetName
                    }
                    {record.eventPlanName
                      ? ` · ${record.eventPlanName}`
                      : ""}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      const confirmed =
                        window.confirm(
                          "Delete this performance report?",
                        );

                      if (
                        confirmed
                      ) {
                        onDeleteRecord(
                          record.id,
                        );
                      }
                    }}
                  >
                    <Trash2
                      size={12}
                    />
                    Delete report
                  </button>
                </div>
              </section>

              <section className="performance-summary-facts">
                <article>
                  <Clock3
                    size={13}
                  />
                  <span>
                    Duration
                  </span>
                  <strong>
                    {formatDuration(
                      record.durationSeconds,
                    )}
                  </strong>
                </article>

                <article>
                  <Music2
                    size={13}
                  />
                  <span>
                    Tracks played
                  </span>
                  <strong>
                    {
                      record.tracks
                        .length
                    }
                  </strong>
                </article>

                <article>
                  <Activity
                    size={13}
                  />
                  <span>
                    Average BPM
                  </span>
                  <strong>
                    {formatNumber(
                      record.averageBpm,
                      0,
                    )}
                  </strong>
                </article>

                <article>
                  <Activity
                    size={13}
                  />
                  <span>
                    Average Energy
                  </span>
                  <strong>
                    {formatNumber(
                      record.averageEnergy,
                    )}
                  </strong>
                </article>

                <article>
                  <Activity
                    size={13}
                  />
                  <span>
                    Event Plan
                  </span>
                  <strong>
                    {record.eventPlanCompliance ===
                    null
                      ? "—"
                      : `${record.eventPlanCompliance}%`}
                  </strong>
                </article>
              </section>

              <section className="performance-score-grid">
                {[
                  [
                    "Transition Flow",
                    record.scores
                      .transitionFlow,
                  ],
                  [
                    "Energy Journey",
                    record.scores
                      .energyJourney,
                  ],
                  [
                    "Event Plan",
                    record.scores
                      .eventPlan,
                  ],
                  [
                    "Crowd Response",
                    record.scores
                      .crowdResponse,
                  ],
                  [
                    "Style Variety",
                    record.scores
                      .styleVariety,
                  ],
                ].map(
                  ([
                    label,
                    score,
                  ]) => (
                    <article
                      key={
                        String(
                          label,
                        )
                      }
                    >
                      <span>
                        {label}
                      </span>

                      <strong>
                        {score}
                      </strong>

                      <div>
                        <i
                          style={{
                            width:
                              `${score}%`,
                          }}
                        />
                      </div>
                    </article>
                  ),
                )}
              </section>

              <section className="performance-audience-summary">
                <header>
                  <span>
                    Audience responses
                  </span>
                  <strong>
                    {
                      record.audience
                        .total
                    }{" "}
                    inputs
                  </strong>
                </header>

                <div>
                  <article>
                    <span>
                      Great
                    </span>
                    <strong>
                      {
                        record.audience
                          .great
                      }
                    </strong>
                  </article>

                  <article>
                    <span>
                      Good
                    </span>
                    <strong>
                      {
                        record.audience
                          .good
                      }
                    </strong>
                  </article>

                  <article>
                    <span>
                      Neutral
                    </span>
                    <strong>
                      {
                        record.audience
                          .neutral
                      }
                    </strong>
                  </article>

                  <article>
                    <span>
                      Losing crowd
                    </span>
                    <strong>
                      {
                        record.audience
                          .losingCrowd
                      }
                    </strong>
                  </article>
                </div>
              </section>

              <section className="performance-observations">
                <header>
                  <span>
                    Flamingo observations
                  </span>
                  <strong>
                    {
                      record.observations
                        .length
                    }
                  </strong>
                </header>

                {record.observations.map(
                  (
                    observation,
                  ) => (
                    <article
                      className={`performance-observation performance-observation--${observation.type}`}
                      key={
                        observation.id
                      }
                    >
                      {observation.type ===
                      "positive" ? (
                        <CheckCircle2
                          size={14}
                        />
                      ) : observation.type ===
                        "warning" ? (
                        <AlertTriangle
                          size={14}
                        />
                      ) : (
                        <Activity
                          size={14}
                        />
                      )}

                      <div>
                        <strong>
                          {
                            observation.title
                          }
                        </strong>

                        <p>
                          {
                            observation.detail
                          }
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </section>

              <section className="performance-played-tracks">
                <header>
                  <span>
                    Played sequence
                  </span>
                  <strong>
                    {
                      record.tracks
                        .length
                    }{" "}
                    tracks
                  </strong>
                </header>

                <div>
                  {record.tracks.map(
                    (track) => (
                      <article
                        key={`${record.id}-${track.position}`}
                      >
                        <span>
                          {
                            track.position
                          }
                        </span>

                        <div>
                          <strong>
                            {
                              track.title
                            }
                          </strong>

                          <small>
                            {
                              track.artist
                            }
                          </small>
                        </div>

                        <small>
                          {track.bpm ===
                          null
                            ? "— BPM"
                            : `${Math.round(
                                track.bpm,
                              )} BPM`}
                        </small>

                        <small>
                          Energy{" "}
                          {formatNumber(
                            track.energy,
                          )}
                        </small>

                        <small>
                          {
                            track.genre ??
                            "—"
                          }
                        </small>
                      </article>
                    ),
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </aside>
  );
}
