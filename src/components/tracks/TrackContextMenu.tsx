import {
  ArrowRightLeft,
  ExternalLink,
  ListPlus,
  Music2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import AddToPlaylistModal from "../playlists/AddToPlaylistModal";

import type { Playlist } from "../../types/playlist";
import type { Track } from "../../types/track";

import {
  createPlaylistId,
  loadPlaylists,
  savePlaylists,
} from "../../utils/playlistStorage";

type PlaylistActionMode =
  | "add"
  | "move";

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

function getCurrentPlaylistId():
  | string
  | null {
  const match =
    window.location.pathname.match(
      /\/playlists\/([^/?#]+)/,
    );

  return match?.[1]
    ? decodeURIComponent(
        match[1],
      )
    : null;
}

function openSpotify(
  spotifyUrl:
    | string
    | null
    | undefined,
) {
  if (!spotifyUrl) {
    window.alert(
      "Spotify link is not available for this track.",
    );

    return;
  }

  window.open(
    spotifyUrl,
    "_blank",
    "noopener,noreferrer",
  );
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
    playlistActionMode,
    setPlaylistActionMode,
  ] =
    useState<PlaylistActionMode | null>(
      null,
    );

  const [
    playlists,
    setPlaylists,
  ] = useState<Playlist[]>(
    loadPlaylists,
  );

  function handleOpenPlaylistAction(
    mode: PlaylistActionMode,
  ) {
    setPlaylists(
      loadPlaylists(),
    );

    setPlaylistActionMode(
      mode,
    );
  }

  function applyPlaylistAction(
    destinationPlaylistId: string,
    trackIds: string[],
  ) {
    const latest =
      loadPlaylists();

    const currentPlaylistId =
      getCurrentPlaylistId();

    const movedTrackIdSet =
      new Set(
        trackIds,
      );

    const next =
      latest.map(
        (playlist) => {
          if (
            playlist.id ===
            destinationPlaylistId
          ) {
            return {
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
            };
          }

          if (
            playlistActionMode ===
              "move" &&
            currentPlaylistId &&
            playlist.id ===
              currentPlaylistId
          ) {
            return {
              ...playlist,

              trackIds:
                playlist.trackIds.filter(
                  (trackId) =>
                    !movedTrackIdSet.has(
                      trackId,
                    ),
                ),

              updatedAt:
                new Date()
                  .toISOString(),
            };
          }

          return playlist;
        },
      );

    savePlaylists(next);
    setPlaylists(next);

    notifyPlaylistsUpdated();

    setPlaylistActionMode(
      null,
    );

    onClose();

    if (
      playlistActionMode ===
      "move"
    ) {
      /*
       * PlaylistDetailPage keeps its own playlist state.
       * Reloading only after a context-menu move keeps the
       * operation deterministic without duplicating parent logic.
       */
      window.location.reload();
    }
  }

  function handleAddToExistingPlaylist(
    destinationPlaylistId: string,
    trackIds: string[],
  ) {
    applyPlaylistAction(
      destinationPlaylistId,
      trackIds,
    );
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

    let next = [
      newPlaylist,
      ...latest,
    ];

    if (
      playlistActionMode ===
      "move"
    ) {
      const currentPlaylistId =
        getCurrentPlaylistId();

      const movedTrackIdSet =
        new Set(
          trackIds,
        );

      if (currentPlaylistId) {
        next =
          next.map(
            (playlist) =>
              playlist.id ===
              currentPlaylistId
                ? {
                    ...playlist,

                    trackIds:
                      playlist.trackIds.filter(
                        (trackId) =>
                          !movedTrackIdSet.has(
                            trackId,
                          ),
                      ),

                    updatedAt:
                      new Date()
                        .toISOString(),
                  }
                : playlist,
          );
      }
    }

    savePlaylists(next);
    setPlaylists(next);

    notifyPlaylistsUpdated();

    setPlaylistActionMode(
      null,
    );

    onClose();

    if (
      playlistActionMode ===
      "move"
    ) {
      window.location.reload();
    }
  }

  useLayoutEffect(() => {
    if (playlistActionMode) {
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
    playlistActionMode,
  ]);

  return (
    <>
      {!playlistActionMode && (
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

          {onMatch && (
            <button
              className="track-context-menu__primary"
              type="button"
              role="menuitem"
              onClick={
                onMatch
              }
            >
              <Sparkles size={15} />

              <span>
                Match Songs
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={
              onEdit
            }
          >
            <Pencil size={15} />

            <span>
              Edit Track
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleOpenPlaylistAction(
                "move",
              )
            }
          >
            <ArrowRightLeft
              size={15}
            />

            <span>
              Move to Playlist
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleOpenPlaylistAction(
                "add",
              )
            }
          >
            <ListPlus size={15} />

            <span>
              Add to Playlist
            </span>
          </button>

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
            disabled={
              !track.spotifyUrl
            }
            title={
              track.spotifyUrl
                ? "Open this track in Spotify"
                : "Spotify link unavailable"
            }
            onClick={() => {
              openSpotify(
                track.spotifyUrl,
              );

              if (
                track.spotifyUrl
              ) {
                onClose();
              }
            }}
          >
            <ExternalLink
              size={15}
            />

            <span>
              Open in Spotify
            </span>
          </button>

          <div className="track-context-menu__separator" />

          <button
            className="track-context-menu__danger"
            type="button"
            role="menuitem"
            onClick={
              onRemove
            }
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
          playlistActionMode !==
          null
        }
        trackIds={[
          track.id,
        ]}
        playlists={
          playlists
        }
        onClose={() => {
          setPlaylistActionMode(
            null,
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
    </>
  );
}
