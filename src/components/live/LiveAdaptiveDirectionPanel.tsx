import {
  Activity,
  ArrowRight,
  CircleAlert,
  Gauge,
  Radio,
  RotateCcw,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import type {
  LiveAdaptiveAction,
  LiveAdaptiveDirection,
} from "../../types/liveAdaptiveDirection";

import {
  getTrackCamelot,
} from "../../utils/matchSongs";

import "./LiveAdaptiveDirectionPanel.css";

type LiveAdaptiveDirectionPanelProps = {
  direction:
    LiveAdaptiveDirection;

  onPlayNext: (
    trackId: string,
  ) => void;

  onAddAfterNext: (
    trackId: string,
  ) => void;
};

function actionIcon(
  action: LiveAdaptiveAction,
) {
  if (
    action ===
    "return-to-plan"
  ) {
    return (
      <RotateCcw
        size={17}
      />
    );
  }

  if (
    action ===
    "more-energy"
  ) {
    return (
      <TrendingUp
        size={17}
      />
    );
  }

  if (
    action ===
    "less-energy"
  ) {
    return (
      <TrendingDown
        size={17}
      />
    );
  }

  if (
    action ===
    "change-style"
  ) {
    return (
      <Sparkles
        size={17}
      />
    );
  }

  if (
    action ===
    "play-a-hit"
  ) {
    return (
      <Star
        size={17}
      />
    );
  }

  return (
    <Gauge
      size={17}
    />
  );
}

function actionLabel(
  action: LiveAdaptiveAction,
): string {
  if (
    action ===
    "return-to-plan"
  ) {
    return "Return to plan";
  }

  if (
    action ===
    "more-energy"
  ) {
    return "More energy";
  }

  if (
    action ===
    "less-energy"
  ) {
    return "Less energy";
  }

  if (
    action ===
    "change-style"
  ) {
    return "Change style";
  }

  if (
    action ===
    "play-a-hit"
  ) {
    return "Play a hit";
  }

  return "Stay BPM";
}

export default function LiveAdaptiveDirectionPanel({
  direction,
  onPlayNext,
  onAddAfterNext,
}: LiveAdaptiveDirectionPanelProps) {
  return (
    <section className="live-adaptive-panel">
      <header>
        <div>
          <Activity
            size={18}
          />

          <div>
            <span>
              Event Plan Copilot
            </span>

            <h2>
              Live Adaptive Direction
            </h2>
          </div>
        </div>

        <strong>
          {
            direction.confidence
          }
          % confidence
        </strong>
      </header>

      <div className="live-adaptive-panel__decision">
        <div>
          {actionIcon(
            direction.action,
          )}

          <div>
            <span>
              Recommended action
            </span>

            <strong>
              {actionLabel(
                direction.action,
              )}
            </strong>
          </div>
        </div>

        <h3>
          {direction.title}
        </h3>

        <p>
          {
            direction.explanation
          }
        </p>
      </div>

      <div className="live-adaptive-panel__status">
        <article>
          <span>
            Current phase
          </span>

          <strong>
            {direction.phase
              ?.name ??
              "No Event Plan"}
          </strong>

          {direction.phase && (
            <small>
              {Math.round(
                direction.phase
                  .progress *
                  100,
              )}
              % through phase
            </small>
          )}
        </article>

        <article>
          <span>
            Target BPM
          </span>

          <strong>
            {direction.targetBpmMin ===
              null ||
            direction.targetBpmMax ===
              null
              ? "—"
              : `${direction.targetBpmMin}–${direction.targetBpmMax}`}
          </strong>

          <small>
            {direction.currentBpmInPlan
              ? "Current BPM matches"
              : "Current BPM outside plan"}
          </small>
        </article>

        <article>
          <span>
            Target styles
          </span>

          <strong>
            {direction.targetGenres
              .length > 0
              ? direction.targetGenres.join(
                  ", ",
                )
              : "Any"}
          </strong>

          <small>
            {direction.currentGenreInPlan
              ? "Current style matches"
              : "Current style outside plan"}
          </small>
        </article>

        <article
          className={
            direction.currentTrackInPlan
              ? "live-adaptive-panel__plan-status live-adaptive-panel__plan-status--good"
              : "live-adaptive-panel__plan-status live-adaptive-panel__plan-status--warning"
          }
        >
          {direction.currentTrackInPlan ? (
            <Activity
              size={15}
            />
          ) : (
            <CircleAlert
              size={15}
            />
          )}

          <span>
            Current track
          </span>

          <strong>
            {direction.currentTrackInPlan
              ? "On plan"
              : "Drifting"}
          </strong>
        </article>
      </div>

      <div className="live-adaptive-panel__candidates">
        <header>
          <div>
            <Sparkles
              size={14}
            />

            <div>
              <span>
                Adaptive picks
              </span>

              <strong>
                Best tracks for this move
              </strong>
            </div>
          </div>
        </header>

        {direction.candidates.length ===
        0 ? (
          <div className="live-adaptive-panel__empty">
            No compatible adaptive candidates are available with the current filters and library.
          </div>
        ) : (
          direction.candidates.map(
            (
              candidate,
              index,
            ) => (
              <article
                key={
                  candidate.track.id
                }
              >
                <span>
                  {index + 1}
                </span>

                <div className="live-adaptive-panel__track">
                  <strong>
                    {
                      candidate.track
                        .title
                    }
                  </strong>

                  <small>
                    {
                      candidate.track
                        .artist
                    }
                  </small>

                  <small>
                    {candidate.track
                      .tempo !==
                    null
                      ? `${Math.round(
                          candidate.track
                            .tempo,
                        )} BPM`
                      : "— BPM"}{" "}
                    · Key{" "}
                    {candidate.track
                      .musicalKey ??
                      "—"}{" "}
                    ·{" "}
                    {getTrackCamelot(
                      candidate.track,
                    ) ??
                      "—"}{" "}
                    · Energy{" "}
                    {candidate.track
                      .energy ??
                      "—"}{" "}
                    · Pop{" "}
                    {candidate.track
                      .spotifyPopularity ??
                      "—"}
                  </small>

                  <small className="live-adaptive-panel__checks">
                    {candidate.bpmMatch
                      ? "BPM ✓"
                      : "BPM ✕"}
                    {" · "}
                    {candidate.genreMatch
                      ? "Style ✓"
                      : "Style ✕"}
                    {" · "}
                    Δ Energy{" "}
                    {candidate.energyDifference ??
                      "—"}
                  </small>
                </div>

                <b>
                  {
                    candidate.percentage
                  }
                  %
                </b>

                <div className="live-adaptive-panel__actions">
                  <button
                    type="button"
                    onClick={() =>
                      onPlayNext(
                        candidate.track
                          .id,
                      )
                    }
                  >
                    <Radio
                      size={11}
                    />
                    Play next
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAddAfterNext(
                        candidate.track
                          .id,
                      )
                    }
                  >
                    <Zap
                      size={11}
                    />
                    Add after
                  </button>
                </div>
              </article>
            ),
          )
        )}
      </div>

      {direction.phase && (
        <footer>
          <span>
            {direction.phase.name}
          </span>

          <ArrowRight
            size={12}
          />

          <span>
            BPM{" "}
            {
              direction.phase
                .minimumBpm
            }
            –
            {
              direction.phase
                .maximumBpm
            }
          </span>

          <ArrowRight
            size={12}
          />

          <span>
            {direction.phase
              .targetGenres
              .length > 0
              ? direction.phase
                  .targetGenres
                  .join(", ")
              : "Any style"}
          </span>
        </footer>
      )}
    </section>
  );
}
