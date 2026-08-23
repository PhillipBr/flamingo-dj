import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  Music2,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import type { Track } from "../../types/track";

import type {
  BridgeTrackSuggestion,
  SetTransitionAnalysis,
} from "../../types/setAnalysis";

import {
  analyzeSet,
  findBridgeTracks,
} from "../../utils/analyzeSet";

import {
  getTrackCamelot,
} from "../../utils/matchSongs";

import "./SetAnalysisPanel.css";

type SetAnalysisPanelProps = {
  isOpen: boolean;

  setTracks: Track[];
  candidateTracks: Track[];

  onClose: () => void;

  onReplaceTrack: (
    currentTrackId: string,
    replacementTrackId: string,
  ) => void;
};

function severityLabel(
  transition:
    SetTransitionAnalysis,
): string {
  switch (
    transition.severity
  ) {
    case "excellent":
      return "Excellent";

    case "good":
      return "Good";

    case "warning":
      return "Warning";

    default:
      return "Poor";
  }
}

function getArtwork(
  track: Track,
): string | null {
  return (
    track.artworkUrl ??
    null
  );
}

export default function SetAnalysisPanel({
  isOpen,
  setTracks,
  candidateTracks,
  onClose,
  onReplaceTrack,
}: SetAnalysisPanelProps) {
  const [
    replacementTransitionIndex,
    setReplacementTransitionIndex,
  ] =
    useState<number | null>(
      null,
    );

  const analysis =
    useMemo(
      () =>
        analyzeSet(
          setTracks,
        ),
      [setTracks],
    );

  if (!isOpen) {
    return null;
  }

  const selectedTransition =
    replacementTransitionIndex ===
    null
      ? null
      : analysis.transitions[
          replacementTransitionIndex
        ] ?? null;

  const selectedSourceTrack =
    selectedTransition
      ? setTracks[
          selectedTransition.index
        ] ?? null
      : null;

  const selectedNextTrack =
    selectedTransition
      ? setTracks[
          selectedTransition.index +
            1
        ] ?? null
      : null;

  const excludedIds =
    new Set(
      setTracks.map(
        (track) =>
          track.id,
      ),
    );

  const bridgeSuggestions:
    BridgeTrackSuggestion<Track>[] =
      selectedSourceTrack &&
      selectedNextTrack
        ? findBridgeTracks(
            selectedSourceTrack,
            selectedNextTrack,
            candidateTracks,
            excludedIds,
            8,
          )
        : [];

  return (
    <aside
      className="set-analysis-panel"
      aria-label="Set analysis"
    >
      <header className="set-analysis-panel__header">
        <div>
          <p>
            <Sparkles
              size={14}
            />
            Set Analysis
          </p>

          <h2>
            Transition Audit
          </h2>
        </div>

        <button
          type="button"
          aria-label="Close set analysis"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <section className="set-analysis-panel__summary">
        <div>
          <strong>
            {
              analysis.summary
                .averagePercentage
            }
            %
          </strong>

          <span>
            average
          </span>
        </div>

        <div>
          <strong>
            {
              analysis.summary
                .excellentCount
            }
          </strong>

          <span>
            excellent
          </span>
        </div>

        <div>
          <strong>
            {
              analysis.summary
                .warningCount +
              analysis.summary
                .poorCount
            }
          </strong>

          <span>
            needs review
          </span>
        </div>
      </section>

      <div className="set-analysis-panel__content">
        {setTracks.length <
        2 ? (
          <div className="set-analysis-panel__empty">
            <Music2
              size={32}
            />

            <strong>
              Add at least two tracks
            </strong>

            <p>
              Flamingo needs two or
              more tracks to analyze
              transitions.
            </p>
          </div>
        ) : (
          analysis.transitions.map(
            (
              transition,
            ) => {
              const sourceTrack =
                setTracks[
                  transition.index
                ];

              const nextTrack =
                setTracks[
                  transition.index +
                    1
                ];

              return (
                <article
                  className={`set-analysis-transition set-analysis-transition--${transition.severity}`}
                  key={`${sourceTrack.id}-${nextTrack.id}`}
                >
                  <div className="set-analysis-transition__top">
                    <div>
                      <span>
                        Transition{" "}
                        {transition.index +
                          1}
                      </span>

                      <strong>
                        {sourceTrack.title}
                      </strong>

                      <ArrowRight
                        size={14}
                      />

                      <strong>
                        {nextTrack.title}
                      </strong>
                    </div>

                    <span className="set-analysis-transition__score">
                      {
                        transition.percentage
                      }
                      %
                    </span>
                  </div>

                  <div className="set-analysis-transition__status">
                    {transition.severity ===
                      "excellent" ||
                    transition.severity ===
                      "good" ? (
                      <CheckCircle2
                        size={14}
                      />
                    ) : (
                      <AlertTriangle
                        size={14}
                      />
                    )}

                    <strong>
                      {severityLabel(
                        transition,
                      )}
                    </strong>
                  </div>

                  <div className="set-analysis-transition__metrics">
                    <span>
                      <Gauge
                        size={12}
                      />
                      BPM{" "}
                      {transition.bpmDifference ===
                      null
                        ? "—"
                        : `Δ ${transition.bpmDifference.toFixed(
                            1,
                          )}`}
                    </span>

                    <span>
                      <Zap
                        size={12}
                      />
                      Energy{" "}
                      {transition.energyDifference ===
                      null
                        ? "—"
                        : `Δ ${transition.energyDifference.toFixed(
                            1,
                          )}`}
                    </span>

                    <span>
                      Key{" "}
                      {transition.sourceCamelot ??
                        "—"}{" "}
                      →{" "}
                      {transition.candidateCamelot ??
                        "—"}
                    </span>
                  </div>

                  {transition.issues.length >
                    0 && (
                    <div className="set-analysis-transition__issues">
                      {transition.issues.map(
                        (
                          issue,
                        ) => (
                          <div
                            key={`${issue.type}-${issue.label}`}
                          >
                            <strong>
                              {
                                issue.label
                              }
                            </strong>

                            <span>
                              {
                                issue.detail
                              }
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {(transition.severity ===
                    "warning" ||
                    transition.severity ===
                      "poor") && (
                    <button
                      className="set-analysis-transition__replace"
                      type="button"
                      onClick={() =>
                        setReplacementTransitionIndex(
                          transition.index,
                        )
                      }
                    >
                      <RefreshCw
                        size={13}
                      />
                      Find bridge track
                    </button>
                  )}
                </article>
              );
            },
          )
        )}
      </div>

      {selectedTransition &&
        selectedSourceTrack &&
        selectedNextTrack && (
          <div className="set-analysis-bridge">
            <header>
              <div>
                <span>
                  Bridge finder
                </span>

                <strong>
                  {
                    selectedSourceTrack.title
                  }{" "}
                  →{" "}
                  {
                    selectedNextTrack.title
                  }
                </strong>
              </div>

              <button
                type="button"
                onClick={() =>
                  setReplacementTransitionIndex(
                    null,
                  )
                }
              >
                <X size={14} />
              </button>
            </header>

            {bridgeSuggestions.length ===
            0 ? (
              <p className="set-analysis-bridge__empty">
                No strong bridge
                tracks were found in
                this playlist.
              </p>
            ) : (
              bridgeSuggestions.map(
                (
                  suggestion,
                ) => {
                  const artwork =
                    getArtwork(
                      suggestion.track,
                    );

                  return (
                    <article
                      className="set-analysis-bridge__item"
                      key={
                        suggestion.track
                          .id
                      }
                    >
                      <div className="set-analysis-bridge__artwork">
                        {artwork ? (
                          <img
                            src={
                              artwork
                            }
                            alt=""
                          />
                        ) : (
                          <Music2
                            size={18}
                          />
                        )}
                      </div>

                      <div className="set-analysis-bridge__copy">
                        <strong>
                          {
                            suggestion.track
                              .title
                          }
                        </strong>

                        <span>
                          {
                            suggestion.track
                              .artist
                          }
                        </span>

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
                          ·{" "}
                          {getTrackCamelot(
                            suggestion.track,
                          ) ?? "—"}{" "}
                          ·{" "}
                          {
                            suggestion.percentage
                          }
                          %
                        </small>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onReplaceTrack(
                            selectedNextTrack.id,
                            suggestion.track
                              .id,
                          );

                          setReplacementTransitionIndex(
                            null,
                          );
                        }}
                      >
                        Use
                      </button>
                    </article>
                  );
                },
              )
            )}
          </div>
        )}
    </aside>
  );
}
