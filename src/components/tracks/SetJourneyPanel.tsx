import {
  Activity,
  AlertTriangle,
  Clock3,
  Gauge,
  Music2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

import {
  useMemo,
} from "react";

import type {
  CurrentSet,
} from "../../types/setlist";

import type {
  SetlistEventPlan,
} from "../../types/setlistGenerator";

import type {
  SetJourneyPoint,
} from "../../types/setJourney";

import type {
  Track,
} from "../../types/track";

import {
  analyzeSetJourney,
} from "../../utils/setJourneyEngine";

import {
  auditEventPlan,
} from "../../utils/eventJourneyAudit";

import "./SetJourneyPanel.css";

type SetJourneyPanelProps = {
  isOpen: boolean;

  currentSet:
    CurrentSet;

  tracks:
    Track[];

  eventPlan:
    SetlistEventPlan | null;

  onClose: () => void;
};

function formatDuration(
  totalSeconds: number,
): string {
  const rounded =
    Math.max(
      0,
      Math.round(
        totalSeconds,
      ),
    );

  const hours =
    Math.floor(
      rounded / 3600,
    );

  const minutes =
    Math.floor(
      (
        rounded % 3600
      ) / 60,
    );

  if (hours > 0) {
    return `${hours}h ${minutes
      .toString()
      .padStart(
        2,
        "0",
      )}m`;
  }

  return `${minutes}m`;
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

function buildPolyline(
  points:
    readonly SetJourneyPoint[],
  accessor: (
    point: SetJourneyPoint,
  ) => number | null,
  minimum: number,
  maximum: number,
  width: number,
  height: number,
): string {
  const range =
    Math.max(
      0.0001,
      maximum -
        minimum,
    );

  return points
    .map(
      (
        point,
        index,
      ) => {
        const value =
          accessor(
            point,
          );

        if (
          value === null
        ) {
          return null;
        }

        const x =
          points.length <=
          1
            ? width / 2
            : (
                index /
                (
                  points.length -
                  1
                )
              ) *
              width;

        const normalized =
          (
            value -
            minimum
          ) /
          range;

        const y =
          height -
          normalized *
            height;

        return `${x.toFixed(
          1,
        )},${y.toFixed(
          1,
        )}`;
      },
    )
    .filter(
      (
        value,
      ): value is string =>
        value !== null,
    )
    .join(" ");
}

export default function SetJourneyPanel({
  isOpen,
  currentSet,
  tracks,
  eventPlan,
  onClose,
}: SetJourneyPanelProps) {
  const analysis =
    useMemo(
      () =>
        analyzeSetJourney(
          currentSet,
          tracks,
        ),
      [
        currentSet,
        tracks,
      ],
    );

  const eventPlanAudit =
    useMemo(
      () =>
        auditEventPlan(
          analysis,
          eventPlan,
        ),
      [
        analysis,
        eventPlan,
      ],
    );

  if (!isOpen) {
    return null;
  }

  const energyValues =
    analysis.points
      .map(
        (point) =>
          point.energy,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const bpmValues =
    analysis.points
      .map(
        (point) =>
          point.bpm,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const chartWidth =
    720;

  const chartHeight =
    180;

  const energyMaximum =
    energyValues.length >
    0
      ? Math.max(
          10,
          Math.ceil(
            Math.max(
              ...energyValues,
            ),
          ),
        )
      : 10;

  const energyPolyline =
    buildPolyline(
      analysis.points,
      (point) =>
        point.energy,
      0,
      energyMaximum,
      chartWidth,
      chartHeight,
    );

  const bpmMinimum =
    bpmValues.length >
    0
      ? Math.floor(
          Math.min(
            ...bpmValues,
          ) - 4,
        )
      : 80;

  const bpmMaximum =
    bpmValues.length >
    0
      ? Math.ceil(
          Math.max(
            ...bpmValues,
          ) + 4,
        )
      : 140;

  const bpmPolyline =
    buildPolyline(
      analysis.points,
      (point) =>
        point.bpm,
      bpmMinimum,
      bpmMaximum,
      chartWidth,
      chartHeight,
    );

  return (
    <aside className="set-journey-panel">
      <header className="set-journey-panel__header">
        <div>
          <p>
            <Activity
              size={14}
            />
            Set Journey
          </p>

          <h2>
            Energy & BPM Timeline
          </h2>
        </div>

        <button
          type="button"
          aria-label="Close Set Journey"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      {analysis.points.length ===
      0 ? (
        <div className="set-journey-panel__empty">
          <Music2
            size={36}
          />

          <strong>
            Current Set is empty
          </strong>

          <p>
            Add or generate tracks in Current Set first.
          </p>
        </div>
      ) : (
        <>
          <section className="set-journey-score">
            <div>
              <strong>
                {
                  analysis.summary
                    .healthScore
                }
              </strong>

              <span>
                / 100
              </span>

              <small>
                Journey Health
              </small>
            </div>

            <div className="set-journey-score__facts">
              <span>
                <Clock3
                  size={12}
                />
                {formatDuration(
                  analysis.summary
                    .totalSeconds,
                )}
              </span>

              <span>
                <Gauge
                  size={12}
                />
                Avg BPM{" "}
                {formatNumber(
                  analysis.summary
                    .averageBpm,
                  0,
                )}
              </span>

              <span>
                <Zap
                  size={12}
                />
                Avg Energy{" "}
                {formatNumber(
                  analysis.summary
                    .averageEnergy,
                )}
              </span>

              <span>
                <TrendingUp
                  size={12}
                />
                Peak Energy{" "}
                {formatNumber(
                  analysis.summary
                    .peakEnergy,
                )}
              </span>
            </div>
          </section>

          <section className="set-journey-chart">
            <header>
              <div>
                <span>
                  Timeline
                </span>

                <strong>
                  Energy + BPM
                </strong>
              </div>

              <div className="set-journey-chart__legend">
                <span>
                  <i className="set-journey-chart__energy-dot" />
                  Energy
                </span>

                <span>
                  <i className="set-journey-chart__bpm-dot" />
                  BPM
                </span>
              </div>
            </header>

            <div className="set-journey-chart__canvas">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                role="img"
                aria-label="Set Energy and BPM timeline"
              >
                <line
                  x1="0"
                  y1="45"
                  x2={chartWidth}
                  y2="45"
                />

                <line
                  x1="0"
                  y1="90"
                  x2={chartWidth}
                  y2="90"
                />

                <line
                  x1="0"
                  y1="135"
                  x2={chartWidth}
                  y2="135"
                />

                {energyPolyline && (
                  <polyline
                    className="set-journey-chart__energy-line"
                    points={
                      energyPolyline
                    }
                  />
                )}

                {bpmPolyline && (
                  <polyline
                    className="set-journey-chart__bpm-line"
                    points={
                      bpmPolyline
                    }
                  />
                )}
              </svg>

              <div className="set-journey-chart__phases">
                {analysis.phases.map(
                  (phase) => (
                    <div
                      key={
                        phase.name
                      }
                    >
                      <strong>
                        {
                          phase.name
                        }
                      </strong>

                      <span>
                        {
                          phase.trackCount
                        }{" "}
                        tracks
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>

          <section className="set-journey-phases">
            <header>
              <span>
                Set structure
              </span>

              <strong>
                Warm Up → Build → Peak → Release
              </strong>
            </header>

            <div className="set-journey-phases__grid">
              {analysis.phases.map(
                (phase) => (
                  <article
                    key={
                      phase.name
                    }
                  >
                    <span>
                      {
                        phase.name
                      }
                    </span>

                    <strong>
                      {formatDuration(
                        phase.startSeconds,
                      )}
                      {" → "}
                      {formatDuration(
                        phase.endSeconds,
                      )}
                    </strong>

                    <small>
                      BPM{" "}
                      {formatNumber(
                        phase.averageBpm,
                        0,
                      )}{" "}
                      · Energy{" "}
                      {formatNumber(
                        phase.averageEnergy,
                      )}{" "}
                      · Pop{" "}
                      {formatNumber(
                        phase.averagePopularity,
                        0,
                      )}
                    </small>
                  </article>
                ),
              )}
            </div>
          </section>

          <section className="set-journey-event-plan">
            <header>
              <div>
                <Activity
                  size={14}
                />

                <div>
                  <span>
                    Event Planner V2
                  </span>

                  <strong>
                    Planned vs Current Set
                  </strong>
                </div>
              </div>

              <b>
                {eventPlanAudit
                  ? `${eventPlanAudit.percentage}%`
                  : "—"}
              </b>
            </header>

            {!eventPlan ||
            !eventPlanAudit ? (
              <div className="set-journey-event-plan__empty">
                Generate a set with Journey Templates V2 to save phase goals for BPM and styles.
              </div>
            ) : (
              <>
                <p>
                  Plan:{" "}
                  <strong>
                    {
                      eventPlan.name
                    }
                  </strong>
                  {" · "}
                  {eventPlan.totalDurationMinutes} min
                  {" · "}
                  {eventPlan.averagePlaySeconds}s average play time
                </p>

                <div className="set-journey-event-plan__phases">
                  {eventPlanAudit.phaseAudits.map(
                    (phase) => (
                      <article
                        key={
                          phase.phaseIndex
                        }
                      >
                        <header>
                          <strong>
                            {
                              phase.phaseName
                            }
                          </strong>

                          <b>
                            {
                              phase.percentage
                            }
                            %
                          </b>
                        </header>

                        <span>
                          BPM{" "}
                          {
                            phase.minimumBpm
                          }
                          –
                          {
                            phase.maximumBpm
                          }
                        </span>

                        <span>
                          Styles:{" "}
                          {phase.plannedGenres.length >
                          0
                            ? phase.plannedGenres.join(
                                ", ",
                              )
                            : "Any"}
                        </span>

                        <small>
                          {
                            phase.genreMatchCount
                          }
                          /
                          {
                            phase.trackCount
                          }{" "}
                          style matches ·{" "}
                          {
                            phase.bpmMatchCount
                          }
                          /
                          {
                            phase.trackCount
                          }{" "}
                          BPM matches
                        </small>
                      </article>
                    ),
                  )}
                </div>
              </>
            )}
          </section>

          <section className="set-journey-issues">
            <header>
              <div>
                <AlertTriangle
                  size={14}
                />

                <div>
                  <span>
                    Journey Audit
                  </span>

                  <strong>
                    {
                      analysis.issues
                        .length
                    }{" "}
                    issue
                    {analysis.issues
                      .length ===
                    1
                      ? ""
                      : "s"}
                  </strong>
                </div>
              </div>
            </header>

            {analysis.issues.length ===
            0 ? (
              <div className="set-journey-issues__empty">
                No major Energy or BPM flow problems detected.
              </div>
            ) : (
              <div className="set-journey-issues__list">
                {analysis.issues.map(
                  (issue) => (
                    <article
                      className={`set-journey-issue set-journey-issue--${issue.severity}`}
                      key={
                        issue.id
                      }
                    >
                      <span>
                        Track{" "}
                        {issue.startIndex +
                          1}
                        {" → "}
                        {issue.endIndex +
                          1}
                      </span>

                      <strong>
                        {
                          issue.title
                        }
                      </strong>

                      <p>
                        {
                          issue.detail
                        }
                      </p>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="set-journey-track-list">
            <header>
              <span>
                Current Set
              </span>

              <strong>
                Track Journey
              </strong>
            </header>

            <div>
              {analysis.points.map(
                (point) => (
                  <article
                    key={
                      point.track.id
                    }
                  >
                    <span>
                      {point.index +
                        1}
                    </span>

                    <div>
                      <strong>
                        {
                          point.track
                            .title
                        }
                      </strong>

                      <small>
                        {
                          point.track
                            .artist
                        }
                      </small>
                    </div>

                    <small>
                      {formatDuration(
                        point.startSeconds,
                      )}
                    </small>

                    <small>
                      {point.bpm ===
                      null
                        ? "— BPM"
                        : `${Math.round(
                            point.bpm,
                          )} BPM`}
                    </small>

                    <small>
                      Energy{" "}
                      {formatNumber(
                        point.energy,
                      )}
                    </small>

                    <b>
                      {
                        point.phase
                      }
                    </b>
                  </article>
                ),
              )}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
