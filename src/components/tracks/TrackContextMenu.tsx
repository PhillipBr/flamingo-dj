import {
  ListPlus,
  Music2,
  Pencil,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";

import {
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import AddToPlaylistModal from "../playlists/AddToPlaylistModal";
import TrackKeywordsModal from "./TrackKeywordsModal";

import type { Playlist } from "../../types/playlist";
import type { Track } from "../../types/track";

import {
  createPlaylistId,
  loadPlaylists,
  savePlaylists,
} from "../../utils/playlistStorage";

import {
  loadTracks,
  saveTracks,
} from "../../utils/trackStorage";

type TrackContextMenuProps = {
  track: Track;
  x: number;
  y: number;
  isInCurrentSet?: boolean;
  onEdit: () => void;
  onMatch?: () => void;
  onAddToCurrentSet?: () => void;
  onRemoveFromCurrentSet?: () => void;
  onRemove: () => void;
  onClose: () => void;
};

function notifyPlaylistsUpdated() {
  window.dispatchEvent(
    new Event(
      "flamingo-dj-playlists-updated",
    ),
  );
}

function normalizeKeyword(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

export default function TrackContextMenu({
  track,
  x,
  y,
  isInCurrentSet = false,
  onEdit,
  onMatch,
  onAddToCurrentSet,
  onRemoveFromCurrentSet,
  onRemove,
  onClose,
}: TrackContextMenuProps) {
  const menuRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    safePosition,
    setSafePosition,
  ] = useState({
    left: x,
    top: y,
  });

  const [
    isAddToPlaylistOpen,
    setIsAddToPlaylistOpen,
  ] = useState(false);

  const [
    isKeywordsOpen,
    setIsKeywordsOpen,
  ] = useState(false);

  const [
    playlists,
    setPlaylists,
  ] = useState<Playlist[]>(
    loadPlaylists,
  );

  const [
    libraryTracks,
    setLibraryTracks,
  ] = useState<Track[]>(
    loadTracks,
  );

  function handleOpenAddToPlaylist() {
    setPlaylists(
      loadPlaylists(),
    );

    setIsAddToPlaylistOpen(
      true,
    );
  }

  function handleAddToExistingPlaylist(
    destinationPlaylistId: string,
    trackIds: string[],
  ) {
    const latest =
      loadPlaylists();

    const next =
      latest.map(
        (playlist) =>
          playlist.id ===
          destinationPlaylistId
            ? {
                ...playlist,

                trackIds:
                  Array.from(
                    new Set([
                      ...playlist.trackIds,
                      ...trackIds,
                    ]),
                  ),

                updatedAt:
                  new Date()
                    .toISOString(),
              }
            : playlist,
      );

    savePlaylists(next);
    setPlaylists(next);
    notifyPlaylistsUpdated();

    setIsAddToPlaylistOpen(
      false,
    );

    onClose();
  }

  function handleCreateAndAdd(
    name: string,
    trackIds: string[],
  ) {
    const cleanName =
      name.trim();

    if (!cleanName) {
      return;
    }

    const latest =
      loadPlaylists();

    const newPlaylist: Playlist = {
      id:
        createPlaylistId(
          cleanName,
        ),

      name:
        cleanName,

      description:
        "",

      category:
        "Custom",

      trackIds:
        Array.from(
          new Set(
            trackIds,
          ),
        ),

      updatedAt:
        new Date()
          .toISOString(),
    };

    const next = [
      newPlaylist,
      ...latest,
    ];

    savePlaylists(next);
    setPlaylists(next);
    notifyPlaylistsUpdated();

    setIsAddToPlaylistOpen(
      false,
    );

    onClose();
  }

  function handleOpenKeywords() {
    setLibraryTracks(
      loadTracks(),
    );

    setIsKeywordsOpen(
      true,
    );
  }

  function handleSaveKeywords(
    keywords: string[],
  ) {
    const cleaned =
      Array.from(
        new Map(
          keywords
            .map(
              (keyword) =>
                keyword.trim(),
            )
            .filter(Boolean)
            .map(
              (keyword) => [
                normalizeKeyword(
                  keyword,
                ),
                keyword,
              ],
            ),
        ).values(),
      );

    const latest =
      loadTracks();

    const next =
      latest.map(
        (currentTrack) =>
          currentTrack.id ===
          track.id
            ? {
                ...currentTrack,
                keywords:
                  cleaned,
              }
            : currentTrack,
      );

    saveTracks(next);
    setLibraryTracks(next);

    setIsKeywordsOpen(
      false,
    );

    onClose();
  }

  useLayoutEffect(() => {
    if (
      isAddToPlaylistOpen ||
      isKeywordsOpen
    ) {
      return;
    }

    const menu =
      menuRef.current;

    if (!menu) {
      return;
    }

    const padding = 12;

    const rect =
      menu.getBoundingClientRect();

    const maxLeft =
      Math.max(
        padding,
        window.innerWidth -
          rect.width -
          padding,
      );

    const maxTop =
      Math.max(
        padding,
        window.innerHeight -
          Math.min(
            rect.height,
            window.innerHeight -
              padding * 2,
          ) -
          padding,
      );

    setSafePosition({
      left:
        Math.max(
          padding,
          Math.min(
            x,
            maxLeft,
          ),
        ),

      top:
        Math.max(
          padding,
          Math.min(
            y,
            maxTop,
          ),
        ),
    });
  }, [
    x,
    y,
    isAddToPlaylistOpen,
    isKeywordsOpen,
  ]);

  const currentTrack =
    libraryTracks.find(
      (item) =>
        item.id === track.id,
    ) ?? track;

  const isModalOpen =
    isAddToPlaylistOpen ||
    isKeywordsOpen;

  return (
    <>
      {!isModalOpen && (
        <div
          ref={menuRef}
          className="track-context-menu"
          style={{
            left:
              safePosition.left,
            top:
              safePosition.top,
            maxHeight:
              "calc(100vh - 24px)",
            overflowY:
              "auto",
            overscrollBehavior:
              "contain",
          }}
          role="menu"
          aria-label={`Actions for ${track.title}`}
          onClick={(event) =>
            event.stopPropagation()
          }
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="track-context-menu__track">
            <Music2 size={15} />

            <div>
              <strong>
                {track.title}
              </strong>

              <span>
                {track.artist}
              </span>
            </div>
          </div>

          <div className="track-context-menu__separator" />

          <button
            type="button"
            role="menuitem"
            onClick={onEdit}
          >
            <Pencil size={15} />
            <span>
              Open details
            </span>
          </button>

          {onMatch && (
            <button
              type="button"
              role="menuitem"
              onClick={onMatch}
            >
              <Sparkles size={15} />
              <span>
                Match Songs
              </span>
            </button>
          )}

          {isInCurrentSet
            ? onRemoveFromCurrentSet && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={
                    onRemoveFromCurrentSet
                  }
                >
                  <ListPlus size={15} />
                  <span>
                    Remove from Current Set
                  </span>
                </button>
              )
            : onAddToCurrentSet && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={
                    onAddToCurrentSet
                  }
                >
                  <ListPlus size={15} />
                  <span>
                    Add to Current Set
                  </span>
                </button>
              )}

          <button
            type="button"
            role="menuitem"
            onClick={
              handleOpenAddToPlaylist
            }
          >
            <ListPlus size={15} />
            <span>
              Add to Playlist
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={
              handleOpenKeywords
            }
          >
            <Tags size={15} />
            <span>
              Edit Keywords
            </span>
          </button>

          <div className="track-context-menu__separator" />

          <button
            className="track-context-menu__danger"
            type="button"
            role="menuitem"
            onClick={onRemove}
          >
            <Trash2 size={15} />
            <span>
              Remove from playlist
            </span>
          </button>
        </div>
      )}

      <AddToPlaylistModal
        isOpen={
          isAddToPlaylistOpen
        }
        trackIds={[
          track.id,
        ]}
        playlists={
          playlists
        }
        onClose={() => {
          setIsAddToPlaylistOpen(
            false,
          );

          onClose();
        }}
        onAddToExisting={
          handleAddToExistingPlaylist
        }
        onCreateAndAdd={
          handleCreateAndAdd
        }
      />

      <TrackKeywordsModal
        isOpen={
          isKeywordsOpen
        }
        track={
          currentTrack
        }
        libraryTracks={
          libraryTracks
        }
        onClose={() => {
          setIsKeywordsOpen(
            false,
          );

          onClose();
        }}
        onSave={
          handleSaveKeywords
        }
      />
    </>
  );
}
