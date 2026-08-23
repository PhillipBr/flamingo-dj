import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  Music2,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import type { Track } from "../../types/track";

import {
  analyzePlaylistRepair,
  buildAutoRepairOrder,
} from "../../utils/playlistRepairEngine";

import {
  getTrackCamelot,
} from "../../utils/matchSongs";

import "./PlaylistRepairPanel.css";

type PlaylistRepairPanelProps = {
  isOpen: boolean;

  playlistName: string;

  playlistTracks: Track[];
  allTracks: Track[];

  onClose: () => void;

  onInsertBridge: (
    afterTrackId: string,
    bridgeTrackId: string,
  ) => void;

  onReplaceTrack: (
    trackId: string,
    replacementTrackId: string,
  ) => void;

  onApplyOrder: (
    trackIds: string[],
  ) => void;
};

function bpmLabel(
  track: Track,
): string {
  return track.tempo ===
    null
    ? "— BPM"
    : `${Math.round(
        track.tempo,
      )} BPM`;
}

export default function PlaylistRepairPanel({
  isOpen,
  playlistName,
  playlistTracks,
  allTracks,
  onClose,
  onInsertBridge,
  onReplaceTrack,
  onApplyOrder,
}: PlaylistRepairPanelProps) {
  const [
    ignoredIssueIds,
    setIgnoredIssueIds,
  ] =
    useState<Set<string>>(
      new Set(),
    );

  const [
    showAutoRepairPreview,
    setShowAutoRepairPreview,
  ] =
    useState(false);

  const analysis =
    useMemo(
      () =>
        analyzePlaylistRepair(
          playlistTracks,
          allTracks,
        ),
      [
        allTracks,
        playlistTracks,
      ],
    );

  const autoRepairTracks =
    useMemo(
      () =>
        buildAutoRepairOrder(
          playlistTracks,
        ),
      [playlistTracks],
    );

  if (!isOpen) {
    return null;
  }

  const visibleIssues =
    analysis.issues.filter(
      (issue) =>
        !ignoredIssueIds.has(
          issue.id,
        ),
    );

  function ignoreIssue(
    issueId: string,
  ) {
    setIgnoredIssueIds(
      (current) => {
        const next =
          new Set(
            current,
          );

        next.add(
          issueId,
        );

        return next;
      },
    );
  }

  return (
    <aside className="playlist-repair-panel">
      <header className="playlist-repair-panel__header">
        <div>
          <p>
            <WandSparkles
              size={14}
            />
            Playlist Repair
          </p>

          <h2>
            {playlistName}
          </h2>
        </div>

        <button
          type="button"
          aria-label="Close playlist repair"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <section className="playlist-repair-panel__health">
        <div className="playlist-repair-panel__health-score">
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
            Playlist Health
          </small>
        </div>

        <div className="playlist-repair-panel__health-stats">
          <span>
            <CheckCircle2
              size={12}
            />
            {
              analysis.summary
                .excellentCount
            }{" "}
            excellent
          </span>

          <span>
            <AlertTriangle
              size={12}
            />
            {
              analysis.summary
                .warningCount
            }{" "}
            warnings
          </span>

          <span>
            <AlertTriangle
              size={12}
            />
            {
              analysis.summary
                .poorCount
            }{" "}
            poor
          </span>
        </div>
      </section>

      <section className="playlist-repair-panel__categories">
        <div>
          <Gauge size={13} />
          <span>BPM</span>
          <strong>
            {
              analysis.summary
                .bpmProblems
            }
          </strong>
        </div>

        <div>
          <Music2 size={13} />
          <span>
            Key / Camelot
          </span>
          <strong>
            {
              analysis.summary
                .camelotProblems
            }
          </strong>
        </div>

        <div>
          <Zap size={13} />
          <span>Energy</span>
          <strong>
            {
              analysis.summary
                .energyProblems
            }
          </strong>
        </div>

        <div>
          <Sparkles
            size={13}
          />
          <span>Genre</span>
          <strong>
            {
              analysis.summary
                .genreProblems
            }
          </strong>
        </div>
      </section>

      <section className="playlist-repair-panel__auto">
        <div>
          <span>
            Automatic repair
          </span>

          <strong>
            BPM-first playlist sequence
          </strong>

          <p>
            Preview a new order without changing the playlist. BPM is first priority, Key/Camelot second, then Energy, Genre and Popularity.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowAutoRepairPreview(
              (value) =>
                !value,
            )
          }
        >
          <RefreshCw size={13} />
          {showAutoRepairPreview
            ? "Hide preview"
            : "Preview auto repair"}
        </button>
      </section>

      {showAutoRepairPreview && (
        <section className="playlist-repair-preview">
          <header>
            <strong>
              Auto Repair Preview
            </strong>

            <button
              type="button"
              onClick={() => {
                const confirmed =
                  window.confirm(
                    "Apply the Auto Repair order to this playlist?",
                  );

                if (!confirmed) {
                  return;
                }

                onApplyOrder(
                  autoRepairTracks.map(
                    (track) =>
                      track.id,
                  ),
                );

                setShowAutoRepairPreview(
                  false,
                );
              }}
            >
              <WandSparkles
                size={12}
              />
              Apply order
            </button>
          </header>

          <div className="playlist-repair-preview__list">
            {autoRepairTracks
              .slice(
                0,
                25,
              )
              .map(
                (
                  track,
                  index,
                ) => (
                  <div
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
                    </div>

                    <small>
                      {bpmLabel(
                        track,
                      )}{" "}
                      · Key{" "}
                      {track.musicalKey ??
                        "—"}{" "}
                      ·{" "}
                      {getTrackCamelot(
                        track,
                      ) ?? "—"}
                    </small>
                  </div>
                ),
              )}
          </div>

          {autoRepairTracks.length >
            25 && (
            <small className="playlist-repair-preview__more">
              +
              {autoRepairTracks.length -
                25}{" "}
              more tracks
            </small>
          )}
        </section>
      )}

      <div className="playlist-repair-panel__issues">
        <header>
          <span>
            Problems found
          </span>

          <strong>
            {
              visibleIssues.length
            }
          </strong>
        </header>

        {visibleIssues.length ===
        0 ? (
          <div className="playlist-repair-panel__empty">
            <CheckCircle2
              size={30}
            />

            <strong>
              No major problems
            </strong>

            <p>
              Flamingo did not find any warning or poor transitions that need immediate attention.
            </p>
          </div>
        ) : (
          visibleIssues.map(
            (issue) => {
              const suggestion =
                analysis.suggestions.find(
                  (item) =>
                    item.issueId ===
                    issue.id,
                ) ??
                null;

              return (
                <article
                  className={`playlist-repair-issue playlist-repair-issue--${issue.severity}`}
                  key={issue.id}
                >
                  <header>
                    <div>
                      <span>
                        Transition{" "}
                        {issue.position +
                          1}
                      </span>

                      <strong>
                        {issue.title}
                      </strong>
                    </div>

                    <b>
                      {
                        issue.percentage
                      }
                      %
                    </b>
                  </header>

                  <div className="playlist-repair-issue__transition">
                    <div>
                      <strong>
                        {
                          issue.sourceTrack
                            .title
                        }
                      </strong>

                      <small>
                        {bpmLabel(
                          issue.sourceTrack,
                        )}{" "}
                        ·{" "}
                        {issue.sourceTrack
                          .musicalKey ??
                          "—"}{" "}
                        ·{" "}
                        {getTrackCamelot(
                          issue.sourceTrack,
                        ) ?? "—"}
                      </small>
                    </div>

                    <ArrowRight
                      size={14}
                    />

                    <div>
                      <strong>
                        {
                          issue.nextTrack
                            .title
                        }
                      </strong>

                      <small>
                        {bpmLabel(
                          issue.nextTrack,
                        )}{" "}
                        ·{" "}
                        {issue.nextTrack
                          .musicalKey ??
                          "—"}{" "}
                        ·{" "}
                        {getTrackCamelot(
                          issue.nextTrack,
                        ) ?? "—"}
                      </small>
                    </div>
                  </div>

                  <p>
                    {issue.detail}
                  </p>

                  {suggestion?.bridgeTrack && (
                    <div className="playlist-repair-bridge">
                      <span>
                        Suggested bridge
                      </span>

                      <strong>
                        {
                          suggestion.bridgeTrack
                            .title
                        }
                      </strong>

                      <small>
                        {
                          suggestion.bridgeTrack
                            .artist
                        }{" "}
                        ·{" "}
                        {bpmLabel(
                          suggestion.bridgeTrack,
                        )}{" "}
                        · Key{" "}
                        {suggestion.bridgeTrack
                          .musicalKey ??
                          "—"}{" "}
                        ·{" "}
                        {getTrackCamelot(
                          suggestion.bridgeTrack,
                        ) ?? "—"}{" "}
                        ·{" "}
                        {suggestion.bridgePercentage ??
                          0}
                        %
                      </small>
                    </div>
                  )}

                  <div className="playlist-repair-issue__actions">
                    {suggestion?.bridgeTrack && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onInsertBridge(
                              issue.sourceTrack
                                .id,
                              suggestion.bridgeTrack!
                                .id,
                            )
                          }
                        >
                          Insert bridge
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const confirmed =
                              window.confirm(
                                `Replace "${issue.nextTrack.title}" with "${suggestion.bridgeTrack!.title}"?`,
                              );

                            if (!confirmed) {
                              return;
                            }

                            onReplaceTrack(
                              issue.nextTrack
                                .id,
                              suggestion.bridgeTrack!
                                .id,
                            );
                          }}
                        >
                          Replace next
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        ignoreIssue(
                          issue.id,
                        )
                      }
                    >
                      Ignore
                    </button>
                  </div>
                </article>
              );
            },
          )
        )}
      </div>
    </aside>
  );
}
