import {
  ListMusic,
  Plus,
  Search,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Playlist } from "../../types/playlist";

import "./AddToPlaylistModal.css";

type AddToPlaylistModalProps = {
  isOpen: boolean;
  trackIds: string[];
  playlists: Playlist[];
  onClose: () => void;
  onAddToExisting: (
    playlistId: string,
    trackIds: string[],
  ) => void;
  onCreateAndAdd: (
    name: string,
    trackIds: string[],
  ) => void;
};

export default function AddToPlaylistModal({
  isOpen,
  trackIds,
  playlists,
  onClose,
  onAddToExisting,
  onCreateAndAdd,
}: AddToPlaylistModalProps) {
  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    newPlaylistName,
    setNewPlaylistName,
  ] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchTerm("");
    setNewPlaylistName("");
  }, [
    isOpen,
  ]);

  const filteredPlaylists =
    useMemo(() => {
      const query =
        searchTerm
          .trim()
          .toLowerCase();

      return playlists
        .filter(
          (playlist) =>
            !query ||
            playlist.name
              .toLowerCase()
              .includes(
                query,
              ),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
            ),
        );
    }, [
      playlists,
      searchTerm,
    ]);

  if (!isOpen) {
    return null;
  }

  function handleCreate() {
    const cleanName =
      newPlaylistName.trim();

    if (!cleanName) {
      return;
    }

    onCreateAndAdd(
      cleanName,
      trackIds,
    );
  }

  return (
    <div
      className="add-to-playlist-backdrop"
      onMouseDown={onClose}
    >
      <section
        className="add-to-playlist-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="add-to-playlist-header">
          <div>
            <span className="add-to-playlist-eyebrow">
              ADD TO PLAYLIST
            </span>

            <h2>
              Copy{" "}
              {trackIds.length === 1
                ? "1 track"
                : `${trackIds.length} tracks`}
            </h2>

            <p>
              The source playlist will not be changed.
            </p>
          </div>

          <button
            type="button"
            className="add-to-playlist-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="add-to-playlist-search">
          <Search size={16} />

          <input
            type="search"
            value={searchTerm}
            placeholder="Search playlists..."
            onChange={(event) =>
              setSearchTerm(
                event.target.value,
              )
            }
          />
        </div>

        <div className="add-to-playlist-list">
          {filteredPlaylists.map(
            (playlist) => {
              const alreadyAdded =
                trackIds.every(
                  (trackId) =>
                    playlist.trackIds.includes(
                      trackId,
                    ),
                );

              return (
                <button
                  key={playlist.id}
                  type="button"
                  className="add-to-playlist-row"
                  disabled={alreadyAdded}
                  onClick={() =>
                    onAddToExisting(
                      playlist.id,
                      trackIds,
                    )
                  }
                >
                  <ListMusic size={17} />

                  <div>
                    <strong>
                      {playlist.name}
                    </strong>

                    <span>
                      {playlist.trackIds.length} tracks
                      {alreadyAdded
                        ? " · already added"
                        : ""}
                    </span>
                  </div>
                </button>
              );
            },
          )}

          {filteredPlaylists.length ===
            0 && (
            <p className="add-to-playlist-empty">
              No matching playlists.
            </p>
          )}
        </div>

        <div className="add-to-playlist-separator" />

        <div className="add-to-playlist-create">
          <label>
            Create new playlist

            <input
              value={newPlaylistName}
              placeholder="Playlist name..."
              onChange={(event) =>
                setNewPlaylistName(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  handleCreate();
                }
              }}
            />
          </label>

          <button
            type="button"
            className="add-to-playlist-new"
            disabled={
              !newPlaylistName.trim()
            }
            onClick={handleCreate}
          >
            <Plus size={17} />
            Create & Add
          </button>
        </div>
      </section>
    </div>
  );
}
