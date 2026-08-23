import {
  Clock3,
  GripVertical,
  ListMusic,
  Music2,
  Plus,
  RefreshCw,
  Sparkles,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";

import {
  useState,
  type DragEvent,
} from "react";

import type { Track } from "../../types/track";
import type {
  CurrentSet,
  CurrentSetItem,
} from "../../types/setlist";

import {
  calculateCurrentSetSeconds,
  formatSetDuration,
} from "../../utils/currentSetStorage";

import "./CurrentSetPanel.css";

type CurrentSetPanelProps = {
  isOpen: boolean;
  currentSet: CurrentSet;
  tracks: Track[];

  onClose: () => void;

  onAnalyzeSet: () => void;
  onSaveAsPlaylist: () => void;

  onInsertTrack: (
    insertIndex: number,
  ) => void;

  onReplaceTrack: (
    replaceIndex: number,
  ) => void;

  onRemoveTrack: (
    trackId: string,
  ) => void;

  onClear: () => void;

  onReorder: (
    sourceIndex: number,
    targetIndex: number,
  ) => void;

  onSetReference: (
    trackId: string,
  ) => void;

  onChangePlannedSeconds: (
    trackId: string,
    plannedPlaySeconds: number,
  ) => void;
};

type ResolvedItem = {
  item: CurrentSetItem;
  track: Track;
};

function getArtworkUrl(
  track: Track,
): string | null {
  return track.artworkUrl ?? null;
}

export default function CurrentSetPanel({
  isOpen,
  currentSet,
  tracks,
  onClose,
  onAnalyzeSet,
  onSaveAsPlaylist,
  onInsertTrack,
  onReplaceTrack,
  onRemoveTrack,
  onClear,
  onReorder,
  onSetReference,
  onChangePlannedSeconds,
}: CurrentSetPanelProps) {
  const [
    draggedIndex,
    setDraggedIndex,
  ] =
    useState<number | null>(
      null,
    );

  if (!isOpen) {
    return null;
  }

  const trackById =
    new Map(
      tracks.map(
        (track) => [
          track.id,
          track,
        ],
      ),
    );

  const resolvedItems =
    currentSet.items
      .map(
        (
          item,
        ): ResolvedItem | null => {
          const track =
            trackById.get(
              item.trackId,
            );

          if (!track) {
            return null;
          }

          return {
            item,
            track,
          };
        },
      )
      .filter(
        (
          item,
        ): item is ResolvedItem =>
          item !== null,
      );

  const totalSeconds =
    calculateCurrentSetSeconds(
      currentSet,
    );

  function handleDragStart(
    event: DragEvent<HTMLElement>,
    index: number,
  ) {
    setDraggedIndex(index);

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      String(index),
    );
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    targetIndex: number,
  ) {
    event.preventDefault();

    const sourceIndex =
      draggedIndex ??
      Number(
        event.dataTransfer.getData(
          "text/plain",
        ),
      );

    if (
      !Number.isInteger(
        sourceIndex,
      ) ||
      sourceIndex ===
        targetIndex
    ) {
      setDraggedIndex(null);
      return;
    }

    onReorder(
      sourceIndex,
      targetIndex,
    );

    setDraggedIndex(null);
  }

  return (
    <aside
      className="current-set-panel"
      aria-label="Current set"
    >
      <header className="current-set-panel__header">
        <div>
          <p className="current-set-panel__eyebrow">
            <ListMusic size={14} />
            Current Set
          </p>

          <h2>
            {currentSet.name}
          </h2>
        </div>

        <button
          className="current-set-panel__close"
          type="button"
          aria-label="Close current set"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <section className="current-set-panel__summary">
        <div>
          <strong>
            {resolvedItems.length}
          </strong>

          <span>
            tracks
          </span>
        </div>

        <div>
          <strong>
            {formatSetDuration(
              totalSeconds,
            )}
          </strong>

          <span>
            planned duration
          </span>
        </div>
      </section>

      <div className="current-set-panel__toolbar">
        <p>
          Drag tracks to change
          their order.
        </p>

        <div className="current-set-panel__toolbar-actions">
          <button
            type="button"
            disabled={
              resolvedItems.length ===
              0
            }
            onClick={
              onSaveAsPlaylist
            }
          >
            <Save size={14} />
            Save as playlist
          </button>

          <button
            type="button"
            disabled={
              resolvedItems.length <
              2
            }
            onClick={
              onAnalyzeSet
            }
          >
            <Sparkles size={14} />
            Analyze set
          </button>

          <button
            type="button"
            disabled={
              resolvedItems.length ===
              0
            }
            onClick={onClear}
          >
            <Trash2 size={14} />
            Clear set
          </button>
        </div>
      </div>

      <div className="current-set-panel__list">
        {resolvedItems.length ===
        0 ? (
          <div className="current-set-panel__empty">
            <Music2 size={30} />

            <strong>
              Your set is empty
            </strong>

            <p>
              Open Match Songs and
              add recommendations to
              start building a set.
            </p>
          </div>
        ) : (
          resolvedItems.map(
            (
              {
                item,
                track,
              },
              index,
            ) => {
              const artwork =
                getArtworkUrl(
                  track,
                );

              return (
                <article
                  className={[
                    "current-set-item",
                    draggedIndex ===
                    index
                      ? "current-set-item--dragging"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={track.id}
                  draggable
                  onDragStart={(
                    event,
                  ) =>
                    handleDragStart(
                      event,
                      index,
                    )
                  }
                  onDragOver={(
                    event,
                  ) => {
                    event.preventDefault();

                    event.dataTransfer.dropEffect =
                      "move";
                  }}
                  onDrop={(
                    event,
                  ) =>
                    handleDrop(
                      event,
                      index,
                    )
                  }
                  onDragEnd={() =>
                    setDraggedIndex(
                      null,
                    )
                  }
                >
                  <div className="current-set-item__drag">
                    <GripVertical
                      size={16}
                    />
                  </div>

                  <div className="current-set-item__position">
                    {index + 1}
                  </div>

                  <div className="current-set-item__artwork">
                    {artwork ? (
                      <img
                        src={artwork}
                        alt=""
                        draggable={
                          false
                        }
                      />
                    ) : (
                      <Music2
                        size={18}
                      />
                    )}
                  </div>

                  <div className="current-set-item__main">
                    <strong
                      title={
                        track.title
                      }
                    >
                      {track.title}
                    </strong>

                    <p
                      title={
                        track.artist
                      }
                    >
                      {track.artist}
                    </p>

                    <div className="current-set-item__metadata">
                      <span>
                        {track.tempo !==
                        null
                          ? `${Math.round(
                              track.tempo,
                            )} BPM`
                          : "— BPM"}
                      </span>

                      <span>
                        {track.musicalKey ??
                          "—"}
                      </span>

                      <span>
                        Energy{" "}
                        {track.energy ??
                          "—"}
                      </span>
                    </div>

                    <label className="current-set-item__planned-time">
                      <Clock3
                        size={13}
                      />

                      <span>
                        Planned
                      </span>

                      <input
                        type="number"
                        min="10"
                        max="600"
                        step="5"
                        value={
                          item.plannedPlaySeconds
                        }
                        onChange={(
                          event,
                        ) =>
                          onChangePlannedSeconds(
                            track.id,
                            Number(
                              event
                                .target
                                .value,
                            ),
                          )
                        }
                      />

                      <span>
                        sec
                      </span>
                    </label>

                    <div className="current-set-item__actions">
                      <button
                        type="button"
                        onClick={() =>
                          onInsertTrack(
                            index + 1,
                          )
                        }
                      >
                        <Plus size={13} />
                        Insert after
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onReplaceTrack(
                            index,
                          )
                        }
                      >
                        <RefreshCw
                          size={13}
                        />
                        Replace
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onSetReference(
                            track.id,
                          )
                        }
                      >
                        <Play size={13} />
                        Match from here
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onRemoveTrack(
                            track.id,
                          )
                        }
                      >
                        <Trash2
                          size={13}
                        />
                        Remove
                      </button>
                    </div>
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
