import {
  Gauge,
  Music2,
  Search,
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
  SetEditorMode,
} from "../../types/setEditor";

import {
  getSetEditorSuggestions,
} from "../../utils/setEditorSuggestions";

import "./SetTrackPickerModal.css";

type SetTrackPickerModalProps = {
  isOpen: boolean;

  mode: SetEditorMode;

  previousTrack: Track | null;
  nextTrack: Track | null;

  candidateTracks: Track[];
  excludedTrackIds: string[];

  onClose: () => void;

  onSelect: (
    trackId: string,
  ) => void;
};

function getArtwork(
  track: Track,
): string | null {
  return (
    track.artworkUrl ??
    null
  );
}

export default function SetTrackPickerModal({
  isOpen,
  mode,
  previousTrack,
  nextTrack,
  candidateTracks,
  excludedTrackIds,
  onClose,
  onSelect,
}: SetTrackPickerModalProps) {
  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const excludedSet =
    useMemo(
      () =>
        new Set(
          excludedTrackIds,
        ),
      [excludedTrackIds],
    );

  const suggestions =
    useMemo(
      () =>
        getSetEditorSuggestions(
          mode,
          previousTrack,
          nextTrack,
          candidateTracks,
          excludedSet,
          18,
        ),
      [
        candidateTracks,
        excludedSet,
        mode,
        nextTrack,
        previousTrack,
      ],
    );

  if (!isOpen) {
    return null;
  }

  const normalizedSearch =
    searchTerm
      .trim()
      .toLowerCase();

  const visibleSuggestions =
    suggestions.filter(
      (suggestion) => {
        if (
          !normalizedSearch
        ) {
          return true;
        }

        const track =
          suggestion.track;

        return (
          track.title
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          track.artist
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          track.genre
            ?.toLowerCase()
            .includes(
              normalizedSearch,
            )
        );
      },
    );

  return (
    <div
      className="set-track-picker-backdrop"
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
        className="set-track-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === "insert"
            ? "Insert track"
            : "Replace track"
        }
      >
        <header className="set-track-picker-modal__header">
          <div>
            <p>
              <Sparkles
                size={14}
              />
              Set Editor
            </p>

            <h2>
              {mode ===
              "insert"
                ? "Insert track"
                : "Replace track"}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close set editor"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="set-track-picker-modal__between">
          <div>
            <span>
              Previous
            </span>

            <strong>
              {previousTrack
                ?.title ??
                "Start of set"}
            </strong>

            <small>
              {previousTrack
                ?.tempo !==
              null &&
              previousTrack
                ?.tempo !==
              undefined
                ? `${Math.round(
                    previousTrack.tempo,
                  )} BPM`
                : "—"}
            </small>
          </div>

          <span>
            →
          </span>

          <div>
            <span>
              Next
            </span>

            <strong>
              {nextTrack
                ?.title ??
                "End of set"}
            </strong>

            <small>
              {nextTrack
                ?.tempo !==
              null &&
              nextTrack
                ?.tempo !==
              undefined
                ? `${Math.round(
                    nextTrack.tempo,
                  )} BPM`
                : "—"}
            </small>
          </div>
        </div>

        <div className="set-track-picker-modal__search">
          <Search size={15} />

          <input
            type="search"
            placeholder="Search suggestions..."
            value={searchTerm}
            onChange={(
              event,
            ) =>
              setSearchTerm(
                event.target
                  .value,
              )
            }
          />
        </div>

        <div className="set-track-picker-modal__hint">
          Priority: BPM first,
          Key/Camelot second,
          then Energy and overall
          compatibility.
        </div>

        <div className="set-track-picker-modal__results">
          {visibleSuggestions.length ===
          0 ? (
            <div className="set-track-picker-modal__empty">
              <Music2
                size={30}
              />

              <strong>
                No suggestions
              </strong>

              <p>
                Try a different
                playlist or remove
                some constraints.
              </p>
            </div>
          ) : (
            visibleSuggestions.map(
              (
                suggestion,
                index,
              ) => {
                const track =
                  suggestion.track;

                const artwork =
                  getArtwork(
                    track,
                  );

                return (
                  <article
                    className="set-track-picker-item"
                    key={
                      track.id
                    }
                  >
                    <div className="set-track-picker-item__rank">
                      {index + 1}
                    </div>

                    <div className="set-track-picker-item__artwork">
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

                    <div className="set-track-picker-item__copy">
                      <div className="set-track-picker-item__title">
                        <div>
                          <strong>
                            {
                              track.title
                            }
                          </strong>

                          <span>
                            {
                              track.artist
                            }
                          </span>
                        </div>

                        <b>
                          {
                            suggestion.percentage
                          }
                          %
                        </b>
                      </div>

                      <div className="set-track-picker-item__facts">
                        <span>
                          <Gauge
                            size={12}
                          />
                          {suggestion.bpm !==
                          null
                            ? `${Math.round(
                                suggestion.bpm,
                              )} BPM`
                            : "— BPM"}
                        </span>

                        <span>
                          Key{" "}
                          {suggestion.musicalKey ??
                            "—"}
                        </span>

                        <span>
                          Camelot{" "}
                          {suggestion.camelot ??
                            "—"}
                        </span>

                        <span>
                          <Zap
                            size={12}
                          />
                          Energy{" "}
                          {track.energy ??
                            "—"}
                        </span>
                      </div>

                      <div className="set-track-picker-item__scores">
                        <span>
                          BPM{" "}
                          {Math.round(
                            suggestion.bpmPriorityScore *
                              100,
                          )}
                          %
                        </span>

                        <span>
                          Camelot{" "}
                          {Math.round(
                            suggestion.camelotScore *
                              100,
                          )}
                          %
                        </span>

                        <span>
                          Compatibility{" "}
                          {Math.round(
                            suggestion.compatibilityScore *
                              100,
                          )}
                          %
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onSelect(
                          track.id,
                        )
                      }
                    >
                      {mode ===
                      "insert"
                        ? "Insert"
                        : "Replace"}
                    </button>
                  </article>
                );
              },
            )
          )}
        </div>
      </section>
    </div>
  );
}
