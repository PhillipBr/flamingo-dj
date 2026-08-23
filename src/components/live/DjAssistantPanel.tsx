import {
  BrainCircuit,
  Gauge,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import type { Track } from "../../types/track";

import type {
  DjAssistantInsight,
} from "../../types/djAssistant";

import {
  getTrackCamelot,
} from "../../utils/matchSongs";

import "./DjAssistantPanel.css";

type DjAssistantPanelProps = {
  insight: DjAssistantInsight;

  onPlayNext: (
    trackId: string,
  ) => void;

  onAddAfterNext: (
    trackId: string,
  ) => void;
};

function directionIcon(
  direction:
    DjAssistantInsight["recommendation"]["direction"],
) {
  if (
    direction ===
    "increase-energy"
  ) {
    return (
      <TrendingUp size={17} />
    );
  }

  if (
    direction ===
    "decrease-energy"
  ) {
    return (
      <TrendingDown size={17} />
    );
  }

  if (
    direction ===
    "change-style"
  ) {
    return (
      <Sparkles size={17} />
    );
  }

  return (
    <Gauge size={17} />
  );
}

function formatTrackFacts(
  track: Track,
): string {
  return [
    track.tempo !== null
      ? `${Math.round(
          track.tempo,
        )} BPM`
      : "— BPM",

    `Key ${
      track.musicalKey ??
      "—"
    }`,

    `Camelot ${
      getTrackCamelot(
        track,
      ) ?? "—"
    }`,

    `Energy ${
      track.energy ??
      "—"
    }`,
  ].join(" · ");
}

export default function DjAssistantPanel({
  insight,
  onPlayNext,
  onAddAfterNext,
}: DjAssistantPanelProps) {
  const recommendation =
    insight.recommendation;

  return (
    <section className="dj-assistant-panel">
      <header>
        <div>
          <BrainCircuit
            size={18}
          />

          <div>
            <span>
              Flamingo Copilot
            </span>

            <h2>
              DJ AI Assistant
            </h2>
          </div>
        </div>

        <strong>
          {recommendation.confidence}
          % confidence
        </strong>
      </header>

      <div className="dj-assistant-panel__decision">
        <div className="dj-assistant-panel__direction">
          {directionIcon(
            recommendation.direction,
          )}

          <div>
            <span>
              Recommended move
            </span>

            <strong>
              {
                recommendation.title
              }
            </strong>
          </div>
        </div>

        <p>
          {
            recommendation.explanation
          }
        </p>
      </div>

      <div className="dj-assistant-panel__metrics">
        <div>
          <span>
            Current BPM
          </span>

          <strong>
            {insight.currentBpm ===
            null
              ? "—"
              : Math.round(
                  insight.currentBpm,
                )}
          </strong>
        </div>

        <div>
          <span>
            Recent avg BPM
          </span>

          <strong>
            {insight.averageRecentBpm ===
            null
              ? "—"
              : Math.round(
                  insight.averageRecentBpm,
                )}
          </strong>
        </div>

        <div>
          <span>
            Current Energy
          </span>

          <strong>
            {insight.currentEnergy ??
              "—"}
          </strong>
        </div>

        <div>
          <span>
            Recent avg Energy
          </span>

          <strong>
            {insight.averageRecentEnergy ===
            null
              ? "—"
              : insight.averageRecentEnergy.toFixed(
                  1,
                )}
          </strong>
        </div>
      </div>

      <div className="dj-assistant-panel__targets">
        <div>
          <span>
            Recommended BPM
          </span>

          <strong>
            {recommendation.recommendedBpmMin ===
              null ||
            recommendation.recommendedBpmMax ===
              null
              ? "—"
              : `${recommendation.recommendedBpmMin}–${recommendation.recommendedBpmMax}`}
          </strong>
        </div>

        <div>
          <span>
            Recommended Key
          </span>

          <strong>
            {recommendation.recommendedKeys.length >
            0
              ? recommendation.recommendedKeys.join(
                  ", ",
                )
              : "—"}
          </strong>
        </div>

        <div>
          <span>
            Recommended Camelot
          </span>

          <strong>
            {recommendation.recommendedCamelot.length >
            0
              ? recommendation.recommendedCamelot.join(
                  ", ",
                )
              : "—"}
          </strong>
        </div>
      </div>

      {insight.dominantRecentGenres.length >
        0 && (
        <div className="dj-assistant-panel__genres">
          <span>
            Recent styles
          </span>

          <div>
            {insight.dominantRecentGenres.map(
              (genre) => (
                <small
                  key={genre}
                >
                  {genre}
                </small>
              ),
            )}
          </div>
        </div>
      )}

      <div className="dj-assistant-panel__candidates">
        <div className="dj-assistant-panel__candidate-title">
          <Sparkles size={14} />

          <div>
            <span>
              Copilot picks
            </span>

            <strong>
              Best next moves
            </strong>
          </div>
        </div>

        {recommendation.candidateTracks.length ===
        0 ? (
          <p className="dj-assistant-panel__empty">
            No candidate tracks are available with the current library and exclusions.
          </p>
        ) : (
          recommendation.candidateTracks.map(
            (
              track,
              index,
            ) => (
              <article
                key={track.id}
              >
                <span>
                  {index + 1}
                </span>

                <div>
                  <strong>
                    {track.title}
                  </strong>

                  <small>
                    {track.artist}
                  </small>

                  <small>
                    {formatTrackFacts(
                      track,
                    )}
                  </small>
                </div>

                <div className="dj-assistant-panel__candidate-actions">
                  <button
                    type="button"
                    onClick={() =>
                      onPlayNext(
                        track.id,
                      )
                    }
                  >
                    <Radio size={11} />
                    Play next
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAddAfterNext(
                        track.id,
                      )
                    }
                  >
                    <Zap size={11} />
                    Add after
                  </button>
                </div>
              </article>
            ),
          )
        )}
      </div>
    </section>
  );
}
