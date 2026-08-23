import {
  Activity,
  AlertTriangle,
  Flame,
  Meh,
  Radio,
  Smile,
  Sparkles,
  ThumbsUp,
  Zap,
} from "lucide-react";

import type {
  AudienceEmergencyDecision,
  AudienceResponseLevel,
} from "../../types/audienceResponse";

import { getTrackCamelot } from "../../utils/matchSongs";

import "./AudienceResponsePanel.css";

type AudienceResponsePanelProps = {
  activeResponse: AudienceResponseLevel | null;
  decision: AudienceEmergencyDecision;
  onSetResponse: (level: AudienceResponseLevel) => void;
  onPlayNext: (trackId: string) => void;
  onAddAfterNext: (trackId: string) => void;
};

function responseLabel(
  level: AudienceResponseLevel,
): string {
  if (level === "great") return "Great";
  if (level === "good") return "Good";
  if (level === "neutral") return "Neutral";
  return "Losing crowd";
}

export default function AudienceResponsePanel({
  activeResponse,
  decision,
  onSetResponse,
  onPlayNext,
  onAddAfterNext,
}: AudienceResponsePanelProps) {
  return (
    <section className="audience-response-panel">
      <header>
        <div>
          <Activity size={18} />

          <div>
            <span>Manual crowd input</span>
            <h2>Audience Response</h2>
          </div>
        </div>

        <strong>{decision.confidence}% confidence</strong>
      </header>

      <div className="audience-response-panel__buttons">
        <button
          className={
            activeResponse === "great"
              ? "audience-response-button audience-response-button--active"
              : "audience-response-button"
          }
          type="button"
          onClick={() => onSetResponse("great")}
        >
          <Flame size={16} />
          Great
        </button>

        <button
          className={
            activeResponse === "good"
              ? "audience-response-button audience-response-button--active"
              : "audience-response-button"
          }
          type="button"
          onClick={() => onSetResponse("good")}
        >
          <ThumbsUp size={16} />
          Good
        </button>

        <button
          className={
            activeResponse === "neutral"
              ? "audience-response-button audience-response-button--active"
              : "audience-response-button"
          }
          type="button"
          onClick={() => onSetResponse("neutral")}
        >
          <Meh size={16} />
          Neutral
        </button>

        <button
          className={
            activeResponse === "losing-crowd"
              ? "audience-response-button audience-response-button--active audience-response-button--danger"
              : "audience-response-button audience-response-button--danger"
          }
          type="button"
          onClick={() => onSetResponse("losing-crowd")}
        >
          <AlertTriangle size={16} />
          Losing crowd
        </button>
      </div>

      <div className="audience-response-panel__decision">
        <div>
          {decision.activeResponse === "losing-crowd" ? (
            <AlertTriangle size={17} />
          ) : decision.activeResponse === "great" ? (
            <Flame size={17} />
          ) : (
            <Sparkles size={17} />
          )}

          <div>
            <span>Emergency direction</span>
            <strong>{decision.title}</strong>
          </div>
        </div>

        <p>{decision.explanation}</p>
      </div>

      <div className="audience-response-panel__candidates">
        <header>
          <div>
            <Sparkles size={14} />
            <div>
              <span>Crowd-aware picks</span>
              <strong>Best emergency moves</strong>
            </div>
          </div>
        </header>

        {decision.candidates.length === 0 ? (
          <div className="audience-response-panel__empty">
            Mark the audience response or change the Current Set
            position to generate crowd-aware recommendations.
          </div>
        ) : (
          decision.candidates.map((candidate, index) => (
            <article key={candidate.track.id}>
              <span>{index + 1}</span>

              <div className="audience-response-panel__track">
                <strong>{candidate.track.title}</strong>
                <small>{candidate.track.artist}</small>
                <small>
                  {candidate.track.tempo !== null
                    ? `${Math.round(candidate.track.tempo)} BPM`
                    : "— BPM"}{" "}
                  · Key {candidate.track.musicalKey ?? "—"} ·{" "}
                  {getTrackCamelot(candidate.track) ?? "—"} · Energy{" "}
                  {candidate.track.energy ?? "—"} · Pop{" "}
                  {candidate.track.spotifyPopularity ?? "—"}
                </small>
                <small className="audience-response-panel__reason">
                  {candidate.reason}
                </small>
              </div>

              <b>{candidate.percentage}%</b>

              <div className="audience-response-panel__actions">
                <button
                  type="button"
                  onClick={() =>
                    onPlayNext(candidate.track.id)
                  }
                >
                  <Radio size={11} />
                  Play next
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onAddAfterNext(candidate.track.id)
                  }
                >
                  <Zap size={11} />
                  Add after
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {activeResponse && (
        <footer>
          <Smile size={12} />
          Current crowd input:{" "}
          <strong>{responseLabel(activeResponse)}</strong>
        </footer>
      )}
    </section>
  );
}
