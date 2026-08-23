import {
  ArrowRightLeft,
  Copy,
  ListMusic,
  Search,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Playlist } from "../../types/playlist";

export type TransferMode =
  | "copy"
  | "move";

type CopyMoveTracksModalProps = {
  isOpen: boolean;
  mode: TransferMode;
  selectedCount: number;
  currentPlaylistId: string;
  playlists: Playlist[];
  onClose: () => void;
  onConfirm: (
    destinationPlaylistId: string,
  ) => void;
};

export default function CopyMoveTracksModal({
  isOpen,
  mode,
  selectedCount,
  currentPlaylistId,
  playlists,
  onClose,
  onConfirm,
}: CopyMoveTracksModalProps) {
  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    selectedDestinationId,
    setSelectedDestinationId,
  ] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchTerm("");
    setSelectedDestinationId(
      "",
    );
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [isOpen, onClose]);

  const availablePlaylists =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      return playlists.filter(
        (playlist) => {
          if (
            playlist.id ===
            currentPlaylistId
          ) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          return (
            playlist.name
              .toLowerCase()
              .includes(
                normalizedSearch,
              ) ||
            playlist.category
              .toLowerCase()
              .includes(
                normalizedSearch,
              )
          );
        },
      );
    }, [
      currentPlaylistId,
      playlists,
      searchTerm,
    ]);

  if (!isOpen) {
    return null;
  }

  const actionLabel =
    mode === "copy"
      ? "Copy tracks"
      : "Move tracks";

  return (
    <div
      className="playlist-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="copy-move-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-move-modal-title"
      >
        <header className="copy-move-modal__header">
          <div className="copy-move-modal__title">
            <div className="copy-move-modal__icon">
              {mode === "copy" ? (
                <Copy size={20} />
              ) : (
                <ArrowRightLeft
                  size={20}
                />
              )}
            </div>

            <div>
              <p className="page-eyebrow">
                Playlist manager
              </p>

              <h2 id="copy-move-modal-title">
                {actionLabel}
              </h2>

              <span>
                {selectedCount}{" "}
                {selectedCount === 1
                  ? "track"
                  : "tracks"}{" "}
                selected
              </span>
            </div>
          </div>

          <button
            className="playlist-modal__close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="copy-move-modal__content">
          <div className="copy-move-modal__search">
            <Search size={16} />

            <input
              type="search"
              placeholder="Search destination playlist..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(
                  event.target
                    .value,
                )
              }
            />
          </div>

          <div className="copy-move-modal__list">
            {availablePlaylists.length >
            0 ? (
              availablePlaylists.map(
                (playlist) => {
                  const isSelected =
                    selectedDestinationId ===
                    playlist.id;

                  return (
                    <button
                      className={
                        isSelected
                          ? "copy-move-playlist copy-move-playlist--selected"
                          : "copy-move-playlist"
                      }
                      type="button"
                      key={
                        playlist.id
                      }
                      onClick={() =>
                        setSelectedDestinationId(
                          playlist.id,
                        )
                      }
                    >
                      <div className="copy-move-playlist__icon">
                        <ListMusic
                          size={18}
                        />
                      </div>

                      <div className="copy-move-playlist__text">
                        <strong>
                          {
                            playlist.name
                          }
                        </strong>

                        <span>
                          {
                            playlist.category
                          }{" "}
                          ·{" "}
                          {
                            playlist
                              .trackIds
                              .length
                          }{" "}
                          tracks
                        </span>
                      </div>

                      <span className="copy-move-playlist__radio">
                        {isSelected
                          ? "●"
                          : "○"}
                      </span>
                    </button>
                  );
                },
              )
            ) : (
              <div className="copy-move-modal__empty">
                <ListMusic
                  size={24}
                />

                <strong>
                  No destination
                  playlists
                </strong>

                <span>
                  Create another
                  playlist before
                  copying or moving
                  tracks.
                </span>
              </div>
            )}
          </div>
        </div>

        <footer className="copy-move-modal__footer">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="primary-button"
            type="button"
            disabled={
              !selectedDestinationId
            }
            onClick={() => {
              if (
                !selectedDestinationId
              ) {
                return;
              }

              onConfirm(
                selectedDestinationId,
              );
            }}
          >
            {mode === "copy" ? (
              <Copy size={16} />
            ) : (
              <ArrowRightLeft
                size={16}
              />
            )}

            {actionLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
