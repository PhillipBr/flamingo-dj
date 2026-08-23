import {
  Filter,
  Music2,
  Search,
  Sparkles,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import CopyMoveTracksModal, {
  type TransferMode,
} from "../components/playlists/CopyMoveTracksModal";

import BulkActionsBar from "../components/tracks/BulkActionsBar";
import ColumnManager from "../components/tracks/ColumnManager";
import TrackContextMenu from "../components/tracks/TrackContextMenu";
import TrackDetailsPanel from "../components/tracks/TrackDetailsPanel";
import MatchSongsPanel from "../components/tracks/MatchSongsPanel";
import TrackFiltersPanel from "../components/tracks/TrackFiltersPanel";

import TracksTable, {
  type TrackSortDirection,
  type TrackSortField,
} from "../components/tracks/TracksTable";

import {
  DEFAULT_VISIBLE_TRACK_COLUMNS,
  LOCKED_TRACK_COLUMNS,
  TRACK_COLUMNS,
} from "../config/trackColumns";

import type { Playlist } from "../types/playlist";
import type { CurrentSet } from "../types/setlist";
import type { Track } from "../types/track";
import type { TrackColumnId } from "../types/trackColumn";

import {
  EMPTY_TRACK_FILTERS,
  type TrackFilters,
} from "../types/trackFilters";


import { getCamelotKey } from "../utils/camelot";

import {
  loadPlaylists,
  savePlaylists,
} from "../utils/playlistStorage";

import {
  loadTracks,
  saveTracks,
} from "../utils/trackStorage";

import {
  createCurrentSetItem,
  loadCurrentSet,
  saveCurrentSet,
} from "../utils/currentSetStorage";

import {
  sanitizeTrackFilters,
  trackMatchesFilters,
} from "../utils/trackFilters";



import { useLazyTrackExtras } from "../hooks/useLazyTrackExtras";

type ContextMenuState = {
  track: Track;
  x: number;
  y: number;
} | null;

const COLUMN_STORAGE_KEY =
  "flamingo-dj-visible-track-columns-v8";

const FILTER_STORAGE_KEY =
  "flamingo-dj-advanced-track-filters";

function isTrackColumnId(
  value: unknown,
): value is TrackColumnId {
  return (
    typeof value === "string" &&
    TRACK_COLUMNS.some(
      (column) =>
        column.id === value,
    )
  );
}

function loadVisibleColumns(): TrackColumnId[] {
  try {
    const storedValue =
      localStorage.getItem(
        COLUMN_STORAGE_KEY,
      );

    if (!storedValue) {
      return [
        ...DEFAULT_VISIBLE_TRACK_COLUMNS,
      ];
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [
        ...DEFAULT_VISIBLE_TRACK_COLUMNS,
      ];
    }

    const validColumns =
      parsedValue.filter(
        isTrackColumnId,
      );

    const columnsWithRequiredFields =
      Array.from(
        new Set([
          ...LOCKED_TRACK_COLUMNS,
          ...validColumns,
        ]),
      );

    return TRACK_COLUMNS
      .filter((column) =>
        columnsWithRequiredFields.includes(
          column.id,
        ),
      )
      .map(
        (column) =>
          column.id,
      );
  } catch {
    return [
      ...DEFAULT_VISIBLE_TRACK_COLUMNS,
    ];
  }
}

function loadTrackFilters(): TrackFilters {
  try {
    const storedValue =
      localStorage.getItem(
        FILTER_STORAGE_KEY,
      );

    if (!storedValue) {
      return {
        ...EMPTY_TRACK_FILTERS,
      };
    }

    const parsedValue: unknown =
      JSON.parse(storedValue);

    return sanitizeTrackFilters(
      parsedValue,
    );
  } catch {
    return {
      ...EMPTY_TRACK_FILTERS,
    };
  }
}

function getComparableValue(
  track: Track,
  field: TrackSortField,
): string | number {
  if (field === "camelot") {
    return getCamelotKey(
      track.musicalKey,
    ).toLowerCase();
  }

  const value = track[field];

  if (
    typeof value === "number"
  ) {
    return value;
  }

  return (
    value
      ?.toString()
      .toLowerCase() ?? ""
  );
}


export default function TracksPage() {
  const [
    tracks,
    setTracks,
  ] = useState<Track[]>(
    loadTracks,
  );

  const [
    playlists,
    setPlaylists,
  ] = useState<Playlist[]>(
    loadPlaylists,
  );

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    genreFilter,
    setGenreFilter,
  ] = useState("all");

  const [
    advancedFilters,
    setAdvancedFilters,
  ] = useState<TrackFilters>(
    loadTrackFilters,
  );


  const [
    selectedTrackIds,
    setSelectedTrackIds,
  ] = useState<string[]>([]);

  const [
    lastSelectedTrackId,
    setLastSelectedTrackId,
  ] = useState<string | null>(
    null,
  );

  const [
    detailsTrackId,
    setDetailsTrackId,
  ] = useState<string | null>(
    null,
  );

  const [
    matchTrackId,
    setMatchTrackId,
  ] = useState<string | null>(
    null,
  );

  const [
    spotifyTrackId,
    setSpotifyTrackId,
  ] = useState<string | null>(
    null,
  );

  const spotifyWindowRef =
    useRef<Window | null>(
      null,
    );

  const [
    currentSet,
    setCurrentSet,
  ] = useState<CurrentSet>(
    loadCurrentSet,
  );

  const [
    contextMenu,
    setContextMenu,
  ] =
    useState<ContextMenuState>(
      null,
    );

  const [
    sortField,
    setSortField,
  ] =
    useState<TrackSortField>(
      "title",
    );

  const [
    sortDirection,
    setSortDirection,
  ] =
    useState<TrackSortDirection>(
      "asc",
    );

  const [
    visibleColumns,
    setVisibleColumns,
  ] = useState<TrackColumnId[]>(
    loadVisibleColumns,
  );

  const [
    transferMode,
    setTransferMode,
  ] =
    useState<TransferMode | null>(
      null,
    );

  useLazyTrackExtras({
    tracks,
    setTracks,
    visibleColumns,
    detailTrackId: detailsTrackId ?? spotifyTrackId,
    genreFilter,
    advancedFilters,
    searchTerm,
  });

  const selectedDetailsTrack =
    tracks.find(
      (track) =>
        track.id ===
        detailsTrackId,
    ) ?? null;

  const selectedMatchTrack =
    tracks.find(
      (track) =>
        track.id ===
        matchTrackId,
    ) ?? null;

  useEffect(() => {
    if (!spotifyTrackId) {
      return;
    }

    const spotifyTrack =
      tracks.find(
        (track) =>
          track.id ===
          spotifyTrackId,
      );

    if (
      !spotifyTrack ||
      !spotifyTrack.spotifyUrl
    ) {
      return;
    }

    const pendingWindow =
      spotifyWindowRef.current;

    if (
      pendingWindow &&
      !pendingWindow.closed
    ) {
      pendingWindow.location.href =
        spotifyTrack.spotifyUrl;
    } else {
      window.open(
        spotifyTrack.spotifyUrl,
        "_blank",
        "noopener,noreferrer",
      );
    }

    spotifyWindowRef.current =
      null;
    setSpotifyTrackId(null);
  }, [
    spotifyTrackId,
    tracks,
  ]);



  useEffect(() => {
    saveTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    savePlaylists(playlists);
  }, [playlists]);

  useEffect(() => {
    saveCurrentSet(
      currentSet,
    );
  }, [currentSet]);

  useEffect(() => {
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      JSON.stringify(
        visibleColumns,
      ),
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify(
        advancedFilters,
      ),
    );
  }, [advancedFilters]);

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null);
    }

    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (
        event.key !== "Escape"
      ) {
        return;
      }

      setContextMenu(null);
      setDetailsTrackId(null);
      setMatchTrackId(null);
      setSpotifyTrackId(null);

      if (
        spotifyWindowRef.current &&
        !spotifyWindowRef.current.closed
      ) {
        spotifyWindowRef.current.close();
      }

      spotifyWindowRef.current =
        null;

      setTransferMode(null);
    }

    window.addEventListener(
      "click",
      closeContextMenu,
    );

    window.addEventListener(
      "resize",
      closeContextMenu,
    );

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "click",
        closeContextMenu,
      );

      window.removeEventListener(
        "resize",
        closeContextMenu,
      );

      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, []);

  useEffect(() => {
    const existingTrackIds =
      new Set(
        tracks.map(
          (track) =>
            track.id,
        ),
      );

    setSelectedTrackIds(
      (currentIds) =>
        currentIds.filter(
          (trackId) =>
            existingTrackIds.has(
              trackId,
            ),
        ),
    );

    if (
      detailsTrackId &&
      !existingTrackIds.has(
        detailsTrackId,
      )
    ) {
      setDetailsTrackId(null);
    }

    if (
      matchTrackId &&
      !existingTrackIds.has(
        matchTrackId,
      )
    ) {
      setMatchTrackId(null);
    }

    if (
      spotifyTrackId &&
      !existingTrackIds.has(
        spotifyTrackId,
      )
    ) {
      setSpotifyTrackId(null);
    }
  }, [detailsTrackId, matchTrackId, spotifyTrackId, tracks]);

  const availableGenres =
    useMemo(() => {
      return Array.from(
        new Set(
          tracks
            .map(
              (track) =>
                track.genre,
            )
            .filter(
              (
                genre,
              ): genre is string =>
                Boolean(genre),
            ),
        ),
      ).sort(
        (
          firstGenre,
          secondGenre,
        ) =>
          firstGenre.localeCompare(
            secondGenre,
          ),
      );
    }, [tracks]);

  const visibleTracks =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      const filteredTracks =
        tracks.filter(
          (track) => {
            const matchesSearch =
              normalizedSearch
                .length === 0 ||
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
              track.album
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              track.genre
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              track.country
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              track.folder
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              track.comments
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              track.externalSongId
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              track.keywords.some(
                (keyword) =>
                  keyword
                    .toLowerCase()
                    .includes(
                      normalizedSearch,
                    ),
              );

            const matchesGenre =
              genreFilter ===
                "all" ||
              track.genre ===
                genreFilter;

            const matchesAdvancedFilters =
              trackMatchesFilters(
                track,
                advancedFilters,
              );


            return (
              matchesSearch &&
              matchesGenre &&
              matchesAdvancedFilters
            );
          },
        );

      return [
        ...filteredTracks,
      ].sort(
        (
          firstTrack,
          secondTrack,
        ) => {
          const firstValue =
            getComparableValue(
              firstTrack,
              sortField,
            );

          const secondValue =
            getComparableValue(
              secondTrack,
              sortField,
            );

          if (
            firstValue <
            secondValue
          ) {
            return sortDirection ===
              "asc"
              ? -1
              : 1;
          }

          if (
            firstValue >
            secondValue
          ) {
            return sortDirection ===
              "asc"
              ? 1
              : -1;
          }

          return 0;
        },
      );
    }, [
      advancedFilters,
      genreFilter,
      searchTerm,
      sortDirection,
      sortField,
      tracks,
    ]);

  function removeTracksFromCatalog(
    trackIdsToRemove: string[],
  ) {
    const removeIdSet =
      new Set(
        trackIdsToRemove,
      );

    setTracks(
      (currentTracks) =>
        currentTracks.filter(
          (track) =>
            !removeIdSet.has(
              track.id,
            ),
        ),
    );

    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (playlist) => {
            const updatedTrackIds =
              playlist.trackIds.filter(
                (trackId) =>
                  !removeIdSet.has(
                    trackId,
                  ),
              );

            if (
              updatedTrackIds.length ===
              playlist.trackIds.length
            ) {
              return playlist;
            }

            return {
              ...playlist,
              trackIds:
                updatedTrackIds,
              updatedAt: "Today",
            };
          },
        ),
    );
  }

  function handleDeleteSelected() {
    if (
      selectedTrackIds.length ===
      0
    ) {
      return;
    }

    const selectedCount =
      selectedTrackIds.length;

    const shouldDelete =
      window.confirm(
        `Permanently delete ${selectedCount} ${
          selectedCount === 1
            ? "track"
            : "tracks"
        } from the DJ library?\n\nThe tracks will also be removed from every playlist.`,
      );

    if (!shouldDelete) {
      return;
    }

    removeTracksFromCatalog(
      selectedTrackIds,
    );

    setSelectedTrackIds([]);
    setLastSelectedTrackId(
      null,
    );
    setDetailsTrackId(null);
    setContextMenu(null);
  }

  function handleTransferTracks(
    destinationPlaylistId: string,
  ) {
    if (
      !transferMode ||
      selectedTrackIds.length ===
        0
    ) {
      return;
    }

    const transferredTrackIds = [
      ...selectedTrackIds,
    ];

    const transferredTrackIdSet =
      new Set(
        transferredTrackIds,
      );

    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
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
                      ...transferredTrackIds,
                    ]),
                  ),

                updatedAt:
                  "Today",
              };
            }

            if (
              transferMode ===
              "move"
            ) {
              const updatedTrackIds =
                playlist.trackIds.filter(
                  (trackId) =>
                    !transferredTrackIdSet.has(
                      trackId,
                    ),
                );

              if (
                updatedTrackIds.length ===
                playlist.trackIds.length
              ) {
                return playlist;
              }

              return {
                ...playlist,
                trackIds:
                  updatedTrackIds,
                updatedAt:
                  "Today",
              };
            }

            return playlist;
          },
        ),
    );

    const destinationPlaylist =
      playlists.find(
        (playlist) =>
          playlist.id ===
          destinationPlaylistId,
      );

    const actionText =
      transferMode === "copy"
        ? "added"
        : "moved";

    window.alert(
      `${
        transferredTrackIds.length
      } ${
        transferredTrackIds.length ===
        1
          ? "track"
          : "tracks"
      } ${actionText} to "${
        destinationPlaylist?.name ??
        "playlist"
      }".`,
    );

    setTransferMode(null);
    setSelectedTrackIds([]);
    setLastSelectedTrackId(
      null,
    );
  }

  function handleSort(
    field: TrackSortField,
  ) {
    if (
      field === sortField
    ) {
      setSortDirection(
        (
          currentDirection,
        ) =>
          currentDirection ===
          "asc"
            ? "desc"
            : "asc",
      );

      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  function handleTrackDoubleClick(
    event: MouseEvent<HTMLTableRowElement>,
    trackId: string,
  ) {
    const isRangeSelection =
      event.shiftKey;

    const isToggleSelection =
      event.ctrlKey ||
      event.metaKey;

    if (
      isRangeSelection &&
      lastSelectedTrackId
    ) {
      const lastIndex =
        visibleTracks.findIndex(
          (track) =>
            track.id ===
            lastSelectedTrackId,
        );

      const currentIndex =
        visibleTracks.findIndex(
          (track) =>
            track.id ===
            trackId,
        );

      if (
        lastIndex !== -1 &&
        currentIndex !== -1
      ) {
        const startIndex =
          Math.min(
            lastIndex,
            currentIndex,
          );

        const endIndex =
          Math.max(
            lastIndex,
            currentIndex,
          );

        const rangeIds =
          visibleTracks
            .slice(
              startIndex,
              endIndex + 1,
            )
            .map(
              (track) =>
                track.id,
            );

        setSelectedTrackIds(
          (currentIds) =>
            isToggleSelection
              ? Array.from(
                  new Set([
                    ...currentIds,
                    ...rangeIds,
                  ]),
                )
              : rangeIds,
        );

        setLastSelectedTrackId(
          trackId,
        );

        return;
      }
    }

    if (isToggleSelection) {
      setSelectedTrackIds(
        (currentIds) =>
          currentIds.includes(
            trackId,
          )
            ? currentIds.filter(
                (id) =>
                  id !== trackId,
              )
            : [
                ...currentIds,
                trackId,
              ],
      );

      setLastSelectedTrackId(
        trackId,
      );

      return;
    }

    setSelectedTrackIds([
      trackId,
    ]);

    setLastSelectedTrackId(
      trackId,
    );
  }

  function handleToggleTrackSelection(
    trackId: string,
    checked: boolean,
  ) {
    setSelectedTrackIds(
      (currentIds) => {
        if (checked) {
          return currentIds.includes(
            trackId,
          )
            ? currentIds
            : [
                ...currentIds,
                trackId,
              ];
        }

        return currentIds.filter(
          (id) =>
            id !== trackId,
        );
      },
    );

    setLastSelectedTrackId(
      trackId,
    );
  }

  function handleToggleAllVisible(
    checked: boolean,
  ) {
    const visibleTrackIds =
      visibleTracks.map(
        (track) =>
          track.id,
      );

    setSelectedTrackIds(
      (currentIds) => {
        if (checked) {
          return Array.from(
            new Set([
              ...currentIds,
              ...visibleTrackIds,
            ]),
          );
        }

        const visibleTrackIdSet =
          new Set(
            visibleTrackIds,
          );

        return currentIds.filter(
          (id) =>
            !visibleTrackIdSet.has(
              id,
            ),
        );
      },
    );

    if (
      checked &&
      visibleTrackIds.length > 0
    ) {
      setLastSelectedTrackId(
        visibleTrackIds[
          visibleTrackIds.length -
            1
        ],
      );
    }
  }

  function handleClearSelection() {
    setSelectedTrackIds([]);
    setLastSelectedTrackId(
      null,
    );
  }

  function handleToggleColumn(
    columnId: TrackColumnId,
  ) {
    if (
      LOCKED_TRACK_COLUMNS.includes(
        columnId,
      )
    ) {
      return;
    }

    setVisibleColumns(
      (currentColumns) => {
        const isVisible =
          currentColumns.includes(
            columnId,
          );

        const updatedColumns =
          isVisible
            ? currentColumns.filter(
                (
                  currentColumn,
                ) =>
                  currentColumn !==
                  columnId,
              )
            : [
                ...currentColumns,
                columnId,
              ];

        return TRACK_COLUMNS
          .filter(
            (column) =>
              updatedColumns.includes(
                column.id,
              ),
          )
          .map(
            (column) =>
              column.id,
          );
      },
    );
  }

  function handleResetColumns() {
    setVisibleColumns([
      ...DEFAULT_VISIBLE_TRACK_COLUMNS,
    ]);
  }

  function handleClearAdvancedFilters() {
    setAdvancedFilters({
      ...EMPTY_TRACK_FILTERS,
    });
  }

  function handleOpenContextMenu(
    event: MouseEvent<HTMLTableRowElement>,
    track: Track,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 220;
    const menuHeight = 190;

    const adjustedX =
      Math.min(
        event.clientX,
        window.innerWidth -
          menuWidth -
          12,
      );

    const adjustedY =
      Math.min(
        event.clientY,
        window.innerHeight -
          menuHeight -
          12,
      );

    if (
      !selectedTrackIds.includes(
        track.id,
      )
    ) {
      setSelectedTrackIds([
        track.id,
      ]);

      setLastSelectedTrackId(
        track.id,
      );
    }

    setContextMenu({
      track,

      x: Math.max(
        adjustedX,
        12,
      ),

      y: Math.max(
        adjustedY,
        12,
      ),
    });
  }

  function handleOpenTrackDetails(
    trackId: string,
  ) {
    setMatchTrackId(null);
    setContextMenu(null);

    setDetailsTrackId(
      trackId,
    );
  }

  function handleOpenMatchPanel() {
    if (
      selectedTrackIds.length !==
      1
    ) {
      return;
    }

    setDetailsTrackId(null);
    setContextMenu(null);

    setMatchTrackId(
      selectedTrackIds[0],
    );
  }

  function handleEditSelectedTrack() {
    if (
      selectedTrackIds.length !==
      1
    ) {
      return;
    }

    handleOpenTrackDetails(
      selectedTrackIds[0],
    );
  }

  function handleOpenSelectedSpotify() {
    if (
      selectedTrackIds.length !==
      1
    ) {
      return;
    }

    const trackId =
      selectedTrackIds[0];

    const selectedTrack =
      tracks.find(
        (track) =>
          track.id === trackId,
      );

    if (!selectedTrack) {
      return;
    }

    if (selectedTrack.spotifyUrl) {
      window.open(
        selectedTrack.spotifyUrl,
        "_blank",
        "noopener,noreferrer",
      );

      return;
    }

    const pendingWindow =
      window.open(
        "",
        "_blank",
      );

    spotifyWindowRef.current =
      pendingWindow;

    if (pendingWindow) {
      try {
        pendingWindow.document.title =
          `Opening ${selectedTrack.title} in Spotify...`;

        pendingWindow.document.body.innerHTML =
          "<p style='font-family:system-ui;padding:24px'>Loading Spotify track…</p>";
      } catch {
        // Browser security settings may prevent document access.
      }
    }

    setSpotifyTrackId(
      trackId,
    );
  }

  function handleAddTrackToCurrentSet(
    trackId: string,
  ) {
    setCurrentSet(
      (currentValue) => {
        if (
          currentValue.items.some(
            (item) =>
              item.trackId ===
              trackId,
          )
        ) {
          return currentValue;
        }

        return {
          ...currentValue,
          items: [
            ...currentValue.items,
            createCurrentSetItem(
              trackId,
            ),
          ],
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleRemoveTrackFromCurrentSet(
    trackId: string,
  ) {
    setCurrentSet(
      (currentValue) => ({
        ...currentValue,
        items:
          currentValue.items.filter(
            (item) =>
              item.trackId !==
              trackId,
          ),
        updatedAt:
          new Date().toISOString(),
      }),
    );
  }

  function handleSaveTrack(
    trackId: string,
    changes: Partial<Track>,
  ) {
    setTracks(
      (currentTracks) =>
        currentTracks.map(
          (track) =>
            track.id === trackId
              ? {
                  ...track,
                  ...changes,

                  keywords:
                    changes.keywords
                      ? [
                          ...changes.keywords,
                        ]
                      : track.keywords,

                  artistDetails:
                    changes.artistDetails ===
                    undefined
                      ? track.artistDetails
                      : changes.artistDetails,
                }
              : track,
        ),
    );
  }

  function handleRemoveTrack(
    trackId: string,
  ) {
    const trackToDelete =
      tracks.find(
        (track) =>
          track.id === trackId,
      );

    const shouldDelete =
      window.confirm(
        `Permanently delete "${
          trackToDelete?.title ??
          "this track"
        }" from the DJ library?\n\nIt will also be removed from every playlist.`,
      );

    if (!shouldDelete) {
      return;
    }

    removeTracksFromCatalog([
      trackId,
    ]);

    setSelectedTrackIds(
      (currentIds) =>
        currentIds.filter(
          (id) =>
            id !== trackId,
        ),
    );

    if (
      lastSelectedTrackId ===
      trackId
    ) {
      setLastSelectedTrackId(
        null,
      );
    }

    if (
      detailsTrackId ===
      trackId
    ) {
      setDetailsTrackId(null);
    }

    if (
      matchTrackId ===
      trackId
    ) {
      setMatchTrackId(null);
    }

    setContextMenu(null);
  }

  return (
    <>
      <section
        className={`page tracks-page ${
          selectedDetailsTrack ||
          selectedMatchTrack
            ? "tracks-page--panel-open"
            : ""
        }`}
      >
        <header className="page-header tracks-page__header">
          <div>
            <p className="page-eyebrow">
              DJ library
            </p>

            <h1>Tracks</h1>

            <p className="page-description">
              Browse, filter and edit
              the global FlamingoApp DJ
              track catalog.
            </p>
          </div>

          <div className="playlist-detail-page__summary">
            <strong>
              {tracks.length}
            </strong>

            <span>
              {tracks.length === 1
                ? "track"
                : "tracks"}{" "}
              in library
            </span>
          </div>
        </header>

        <div className="tracks-toolbar">
          <div className="tracks-toolbar__search">
            <Search size={17} />

            <input
              type="search"
              placeholder="Search title, artist, album, genre, country or keyword..."
              aria-label="Search tracks"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(
                  event.target.value,
                )
              }
            />
          </div>

          <div className="tracks-toolbar__actions">
            <label className="tracks-toolbar__select">
              <Filter size={16} />

              <select
                value={genreFilter}
                onChange={(event) =>
                  setGenreFilter(
                    event.target.value,
                  )
                }
                aria-label="Filter tracks by genre"
              >
                <option value="all">
                  All genres
                </option>

                {availableGenres.map(
                  (genre) => (
                    <option
                      key={genre}
                      value={genre}
                    >
                      {genre}
                    </option>
                  ),
                )}
              </select>
            </label>


            <button
              className="tracks-toolbar__match-button"
              type="button"
              disabled={
                selectedTrackIds.length !==
                1
              }
              title={
                selectedTrackIds.length ===
                1
                  ? "Find compatible tracks"
                  : "Select exactly one track to use Match"
              }
              onClick={
                handleOpenMatchPanel
              }
            >
              <Sparkles size={16} />
              MATCH
            </button>

            <TrackFiltersPanel
              tracks={tracks}
              filters={
                advancedFilters
              }
              onChange={
                setAdvancedFilters
              }
              onClear={
                handleClearAdvancedFilters
              }
            />

            <ColumnManager
              visibleColumns={
                visibleColumns
              }
              onToggleColumn={
                handleToggleColumn
              }
              onReset={
                handleResetColumns
              }
            />
          </div>
        </div>

        <BulkActionsBar
          selectedCount={
            selectedTrackIds.length
          }
          onMatchSelected={
            handleOpenMatchPanel
          }
          onEditSelected={
            handleEditSelectedTrack
          }
          onMoveSelected={() =>
            setTransferMode(
              "move",
            )
          }
          onAddSelected={() =>
            setTransferMode(
              "copy",
            )
          }
          onOpenSpotifySelected={
            handleOpenSelectedSpotify
          }
          onDeleteSelected={
            handleDeleteSelected
          }
          onClearSelection={
            handleClearSelection
          }
        />

        {visibleTracks.length > 0 ? (
          <TracksTable
            tracks={visibleTracks}
            visibleColumns={
              visibleColumns
            }
            selectedTrackIds={
              selectedTrackIds
            }
            sortField={sortField}
            sortDirection={
              sortDirection
            }
            onTrackDoubleClick={
              handleTrackDoubleClick
            }
            onToggleTrackSelection={
              handleToggleTrackSelection
            }
            onToggleAllVisible={
              handleToggleAllVisible
            }
            onOpenTrackDetails={
              handleOpenTrackDetails
            }
            onSort={handleSort}
            onOpenContextMenu={
              handleOpenContextMenu
            }
          />
        ) : (
          <div className="playlists-empty">
            <div className="playlists-empty__icon">
              <Music2 size={25} />
            </div>

            <h2>
              No tracks found
            </h2>

            <p>
              {tracks.length === 0
                ? "The DJ library is currently empty."
                : "Try changing the search term or track filters."}
            </p>
          </div>
        )}
      </section>

      <TrackDetailsPanel
        track={
          selectedDetailsTrack
        }
        onClose={() =>
          setDetailsTrackId(
            null,
          )
        }
        onSave={
          handleSaveTrack
        }
      />

      <MatchSongsPanel
        track={
          selectedMatchTrack
        }
        tracks={
          tracks
        }
        onClose={() =>
          setMatchTrackId(
            null,
          )
        }
        onOpenTrackDetails={
          handleOpenTrackDetails
        }
        onAddToSet={
          handleAddTrackToCurrentSet
        }
        currentSetTrackIds={
          currentSet.items.map(
            (item) =>
              item.trackId,
          )
        }
      />

      {contextMenu && (
        <TrackContextMenu
          track={
            contextMenu.track
          }
          x={contextMenu.x}
          y={contextMenu.y}
          isInCurrentSet={
            currentSet.items.some(
              (item) =>
                item.trackId ===
                contextMenu.track.id,
            )
          }
          onEdit={() => {
            handleOpenTrackDetails(
              contextMenu.track.id,
            );

            setContextMenu(null);
          }}
          onMatch={() => {
            setDetailsTrackId(null);
            setMatchTrackId(
              contextMenu.track.id,
            );

            setContextMenu(null);
          }}
          onAddToCurrentSet={() => {
            handleAddTrackToCurrentSet(
              contextMenu.track.id,
            );

            setContextMenu(null);
          }}
          onRemoveFromCurrentSet={() => {
            handleRemoveTrackFromCurrentSet(
              contextMenu.track.id,
            );

            setContextMenu(null);
          }}
          onRemove={() =>
            handleRemoveTrack(
              contextMenu.track.id,
            )
          }
          onClose={() =>
            setContextMenu(null)
          }
        />
      )}

      <CopyMoveTracksModal
        isOpen={
          transferMode !== null
        }
        mode={
          transferMode ?? "copy"
        }
        selectedCount={
          selectedTrackIds.length
        }
        currentPlaylistId=""
        playlists={playlists}
        onClose={() =>
          setTransferMode(null)
        }
        onConfirm={
          handleTransferTracks
        }
      />
    </>
  );
}
