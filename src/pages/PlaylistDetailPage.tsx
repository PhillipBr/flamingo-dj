import {
  ArrowLeft,
  Filter,
  Search,
  Sparkles,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import CopyMoveTracksModal, {
  type TransferMode,
} from "../components/playlists/CopyMoveTracksModal";

import BulkActionsBar from "../components/tracks/BulkActionsBar";
import ColumnManager from "../components/tracks/ColumnManager";
import CurrentSetPanel from "../components/tracks/CurrentSetPanel";
import SaveCurrentSetModal from "../components/tracks/SaveCurrentSetModal";
import SetTrackPickerModal from "../components/tracks/SetTrackPickerModal";
import SetAnalysisPanel from "../components/tracks/SetAnalysisPanel";
import PlaylistRepairPanel from "../components/tracks/PlaylistRepairPanel";
import SetJourneyPanel from "../components/tracks/SetJourneyPanel";
import MatchSongsPanel from "../components/tracks/MatchSongsPanel";
import SetlistGeneratorModal from "../components/tracks/SetlistGeneratorModal";
import TrackContextMenu from "../components/tracks/TrackContextMenu";
import TrackDetailsPanel from "../components/tracks/TrackDetailsPanel";
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
import type {
  SetlistEventPlan,
  SetlistInsertMode,
} from "../types/setlistGenerator";
import type { SetEditorRequest } from "../types/setEditor";
import type { Track } from "../types/track";
import type { TrackColumnId } from "../types/trackColumn";

import {
  EMPTY_TRACK_FILTERS,
  type TrackFilters,
} from "../types/trackFilters";


import {
  loadPlaylists,
  savePlaylists,
} from "../utils/playlistStorage";

import {
  createCurrentSetItem,
  loadCurrentSet,
  saveCurrentSet,
} from "../utils/currentSetStorage";

import {
  loadEventPlan,
  saveEventPlan,
} from "../utils/eventPlanStorage";

import {
  loadTracks,
  saveTracks,
} from "../utils/trackStorage";

import {
  sanitizeTrackFilters,
  trackMatchesFilters,
} from "../utils/trackFilters";


import { sortTracks } from "../utils/trackSorting";


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

function normalizeKeyword(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

export default function PlaylistDetailPage() {
  const { playlistId } =
    useParams();

  const [
    playlists,
    setPlaylists,
  ] = useState<Playlist[]>(
    loadPlaylists,
  );

  const [
    tracks,
    setTracks,
  ] = useState<Track[]>(
    loadTracks,
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
    currentSet,
    setCurrentSet,
  ] = useState<CurrentSet>(
    loadCurrentSet,
  );

  const [
    eventPlan,
    setEventPlan,
  ] =
    useState<SetlistEventPlan | null>(
      loadEventPlan,
    );

  const [
    isCurrentSetOpen,
    setIsCurrentSetOpen,
  ] = useState(false);

  const [
    isSetAnalysisOpen,
    setIsSetAnalysisOpen,
  ] = useState(false);

  const [
    isPlaylistRepairOpen,
    setIsPlaylistRepairOpen,
  ] = useState(false);

  const [
    isSetJourneyOpen,
    setIsSetJourneyOpen,
  ] = useState(false);

  const [
    isSaveCurrentSetOpen,
    setIsSaveCurrentSetOpen,
  ] = useState(false);

  const [
    setEditorRequest,
    setSetEditorRequest,
  ] =
    useState<SetEditorRequest | null>(
      null,
    );

  const [
    isSetlistGeneratorOpen,
    setIsSetlistGeneratorOpen,
  ] = useState(false);

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
      "spotifyPopularity",
    );

  const [
    sortDirection,
    setSortDirection,
  ] =
    useState<TrackSortDirection>(
      "desc",
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

  const playlist =
    playlists.find(
      (item) =>
        item.id === playlistId,
    );

  useLazyTrackExtras({
    tracks,
    setTracks,
    visibleColumns,
    playlistTrackIds: playlist?.trackIds,
    detailTrackId: detailsTrackId,
    genreFilter,
    advancedFilters,
    searchTerm,
  });

  const playlistTracks =
    useMemo(() => {
      if (!playlist) {
        return [];
      }

      const playlistTrackIdSet =
        new Set(
          playlist.trackIds,
        );

      return tracks.filter(
        (track) =>
          playlistTrackIdSet.has(
            track.id,
          ),
      );
    }, [playlist, tracks]);

  const playlistOrderedTracks =
    useMemo(() => {
      if (!playlist) {
        return [];
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

      return playlist.trackIds
        .map(
          (trackId) =>
            trackById.get(
              trackId,
            ) ?? null,
        )
        .filter(
          (
            track,
          ): track is Track =>
            track !== null,
        );
    }, [
      playlist,
      tracks,
    ]);

  const selectedDetailsTrack =
    playlistTracks.find(
      (track) =>
        track.id ===
        detailsTrackId,
    ) ?? null;

  const selectedMatchTrack =
    playlistTracks.find(
      (track) =>
        track.id ===
        matchTrackId,
    ) ?? null;

  const currentSetTracks =
    useMemo(() => {
      const trackById =
        new Map(
          tracks.map(
            (track) => [
              track.id,
              track,
            ],
          ),
        );

      return currentSet.items
        .map(
          (item) =>
            trackById.get(
              item.trackId,
            ) ?? null,
        )
        .filter(
          (
            track,
          ): track is Track =>
            track !== null,
        );
    }, [
      currentSet.items,
      tracks,
    ]);

  const selectedTrackIdSet =
    useMemo(
      () =>
        new Set(
          selectedTrackIds,
        ),
      [selectedTrackIds],
    );

  useEffect(() => {
    savePlaylists(
      playlists,
    );
  }, [playlists]);

  useEffect(() => {
    saveTracks(
      tracks,
    );
  }, [tracks]);

  useEffect(() => {
    saveCurrentSet(
      currentSet,
    );
  }, [currentSet]);

  useEffect(() => {
    saveEventPlan(
      eventPlan,
    );
  }, [eventPlan]);

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
      setTransferMode(null);
      setIsSaveCurrentSetOpen(false);
      setSetEditorRequest(null);
      setIsSetlistGeneratorOpen(false);
      setIsSetAnalysisOpen(false);
      setIsPlaylistRepairOpen(false);
      setIsSetJourneyOpen(false);
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
        playlistTracks.map(
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
  }, [playlistTracks]);

  const availableGenres =
    useMemo(() => {
      return Array.from(
        new Set(
          playlistTracks
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
    }, [playlistTracks]);

  const visibleTracks =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      const filteredTracks =
        playlistTracks.filter(
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

      return sortTracks(
        filteredTracks,
        sortField,
        sortDirection,
      );
    }, [
      advancedFilters,
      genreFilter,
      playlistTracks,
      searchTerm,
      sortDirection,
      sortField,
    ]);

  function updateSelectedTracks(
    updater: (
      track: Track,
    ) => Track,
  ) {
    setTracks(
      (currentTracks) =>
        currentTracks.map(
          (track) =>
            selectedTrackIdSet.has(
              track.id,
            )
              ? updater(track)
              : track,
        ),
    );
  }

  function handleBulkSetFolder(
    folder: string | null,
  ) {
    updateSelectedTracks(
      (track) => ({
        ...track,
        folder,
      }),
    );
  }

  function handleBulkAddKeyword(
    keyword: string,
  ) {
    const normalizedNewKeyword =
      normalizeKeyword(
        keyword,
      );

    updateSelectedTracks(
      (track) => {
        const keywordExists =
          track.keywords.some(
            (currentKeyword) =>
              normalizeKeyword(
                currentKeyword,
              ) ===
              normalizedNewKeyword,
          );

        if (keywordExists) {
          return track;
        }

        return {
          ...track,

          keywords: [
            ...track.keywords,
            keyword,
          ],
        };
      },
    );
  }

  function handleBulkRemoveKeyword(
    keyword: string,
  ) {
    const normalizedKeywordToRemove =
      normalizeKeyword(
        keyword,
      );

    updateSelectedTracks(
      (track) => ({
        ...track,

        keywords:
          track.keywords.filter(
            (currentKeyword) =>
              normalizeKeyword(
                currentKeyword,
              ) !==
              normalizedKeywordToRemove,
          ),
      }),
    );
  }

  function handleBulkSetRating(
    rating: number | null,
  ) {
    updateSelectedTracks(
      (track) => ({
        ...track,
        rating,
      }),
    );
  }

  function handleBulkSetEnergy(
    energy: number | null,
  ) {
    updateSelectedTracks(
      (track) => ({
        ...track,
        energy,
      }),
    );
  }

  function removeTrackIdsFromCurrentPlaylist(
    trackIdsToRemove: string[],
  ) {
    if (!playlistId) {
      return;
    }

    const removeIdSet =
      new Set(
        trackIdsToRemove,
      );

    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (currentPlaylist) =>
            currentPlaylist.id ===
            playlistId
              ? {
                  ...currentPlaylist,

                  trackIds:
                    currentPlaylist.trackIds.filter(
                      (trackId) =>
                        !removeIdSet.has(
                          trackId,
                        ),
                    ),

                  updatedAt:
                    "Today",
                }
              : currentPlaylist,
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
        `Remove ${selectedCount} ${
          selectedCount === 1
            ? "track"
            : "tracks"
        } from this playlist?`,
      );

    if (!shouldDelete) {
      return;
    }

    removeTrackIdsFromCurrentPlaylist(
      selectedTrackIds,
    );

    if (
      detailsTrackId &&
      selectedTrackIdSet.has(
        detailsTrackId,
      )
    ) {
      setDetailsTrackId(null);
    }

    if (
      matchTrackId &&
      selectedTrackIdSet.has(
        matchTrackId,
      )
    ) {
      setMatchTrackId(null);
    }

    setSelectedTrackIds([]);
    setLastSelectedTrackId(
      null,
    );
    setContextMenu(null);
  }

  function handleTransferTracks(
    destinationPlaylistId: string,
  ) {
    if (
      !playlistId ||
      !transferMode ||
      selectedTrackIds.length ===
        0
    ) {
      return;
    }

    const transferredTrackIds = [
      ...selectedTrackIds,
    ];

    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (currentPlaylist) => {
            if (
              currentPlaylist.id ===
              destinationPlaylistId
            ) {
              return {
                ...currentPlaylist,

                trackIds:
                  Array.from(
                    new Set([
                      ...currentPlaylist.trackIds,
                      ...transferredTrackIds,
                    ]),
                  ),

                updatedAt:
                  "Today",
              };
            }

            if (
              transferMode ===
                "move" &&
              currentPlaylist.id ===
                playlistId
            ) {
              const transferredIdSet =
                new Set(
                  transferredTrackIds,
                );

              return {
                ...currentPlaylist,

                trackIds:
                  currentPlaylist.trackIds.filter(
                    (trackId) =>
                      !transferredIdSet.has(
                        trackId,
                      ),
                  ),

                updatedAt:
                  "Today",
              };
            }

            return currentPlaylist;
          },
        ),
    );

    const destinationPlaylist =
      playlists.find(
        (currentPlaylist) =>
          currentPlaylist.id ===
          destinationPlaylistId,
      );

    window.alert(
      `${
        transferredTrackIds.length
      } ${
        transferredTrackIds.length ===
        1
          ? "track"
          : "tracks"
      } ${
        transferMode === "copy"
          ? "copied"
          : "moved"
      } to "${
        destinationPlaylist?.name ??
        "playlist"
      }".`,
    );

    setTransferMode(null);

    if (
      transferMode === "move"
    ) {
      setSelectedTrackIds([]);
      setLastSelectedTrackId(
        null,
      );
      setDetailsTrackId(null);
      setMatchTrackId(null);
    }
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

    setSortDirection(
      field ===
        "spotifyPopularity"
        ? "desc"
        : "asc",
    );
  }

  function handleTrackDoubleClick(
    event: MouseEvent<HTMLTableRowElement>,
    trackId: string,
  ) {
    const clickedElement =
      event.target as HTMLElement;

    if (
      clickedElement.closest(
        "input, button, a, select, textarea",
      )
    ) {
      return;
    }
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

  function handleClearCurrentSet() {
    const shouldClear =
      window.confirm(
        "Clear every track from the current set?",
      );

    if (!shouldClear) {
      return;
    }

    setCurrentSet(
      (currentValue) => ({
        ...currentValue,
        items: [],
        updatedAt:
          new Date().toISOString(),
      }),
    );
  }

  function handleReorderCurrentSet(
    sourceIndex: number,
    targetIndex: number,
  ) {
    setCurrentSet(
      (currentValue) => {
        if (
          sourceIndex < 0 ||
          targetIndex < 0 ||
          sourceIndex >=
            currentValue.items
              .length ||
          targetIndex >=
            currentValue.items
              .length
        ) {
          return currentValue;
        }

        const nextItems = [
          ...currentValue.items,
        ];

        const [movedItem] =
          nextItems.splice(
            sourceIndex,
            1,
          );

        nextItems.splice(
          targetIndex,
          0,
          movedItem,
        );

        return {
          ...currentValue,
          items: nextItems,
          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleChangePlannedSeconds(
    trackId: string,
    plannedPlaySeconds: number,
  ) {
    if (
      !Number.isFinite(
        plannedPlaySeconds,
      )
    ) {
      return;
    }

    setCurrentSet(
      (currentValue) => ({
        ...currentValue,
        items:
          currentValue.items.map(
            (item) =>
              item.trackId ===
              trackId
                ? {
                    ...item,
                    plannedPlaySeconds:
                      Math.min(
                        600,
                        Math.max(
                          10,
                          Math.round(
                            plannedPlaySeconds,
                          ),
                        ),
                      ),
                  }
                : item,
          ),
        updatedAt:
          new Date().toISOString(),
      }),
    );
  }

  function handleApplyGeneratedSetlist(
    generatedTracks: Track[],
    mode: SetlistInsertMode,
    plannedPlaySeconds = 60,
    generatedEventPlan?: SetlistEventPlan,
  ) {
    const safePlannedPlaySeconds =
      Math.max(
        10,
        Math.min(
          600,
          Math.round(
            plannedPlaySeconds,
          ),
        ),
      );

    const generatedItems =
      generatedTracks.map(
        (generatedTrack) =>
          createCurrentSetItem(
            generatedTrack.id,
            safePlannedPlaySeconds,
          ),
      );

    setCurrentSet(
      (currentValue) => {
        if (
          mode === "replace"
        ) {
          return {
            ...currentValue,
            items:
              generatedItems,
            updatedAt:
              new Date().toISOString(),
          };
        }

        const existingTrackIds =
          new Set(
            currentValue.items.map(
              (item) =>
                item.trackId,
            ),
          );

        const uniqueGeneratedItems =
          generatedItems.filter(
            (item) =>
              !existingTrackIds.has(
                item.trackId,
              ),
          );

        return {
          ...currentValue,
          items: [
            ...currentValue.items,
            ...uniqueGeneratedItems,
          ],
          updatedAt:
            new Date().toISOString(),
        };
      },
    );

    if (
      generatedEventPlan
    ) {
      /*
       * A Journey plan maps cleanly when replacing the Current Set.
       * For append mode we still store the latest plan as a reference,
       * but the audit may naturally report lower compliance for the
       * pre-existing tracks.
       */
      setEventPlan(
        generatedEventPlan,
      );
    }

    setIsSetlistGeneratorOpen(
      false,
    );

    setDetailsTrackId(null);
    setMatchTrackId(null);
    setIsCurrentSetOpen(true);
  }
  function createPlaylistId(
    name: string,
  ): string {
    const slug =
      name
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-",
        )
        .replace(
          /^-+|-+$/g,
          "",
        );

    return `${
      slug ||
      "dj-set"
    }-${Date.now()}`;
  }

  function handleOpenSaveCurrentSet() {
    if (
      currentSet.items.length ===
      0
    ) {
      return;
    }

    setContextMenu(null);
    setDetailsTrackId(null);
    setMatchTrackId(null);
    setIsSetlistGeneratorOpen(false);

    setIsSetAnalysisOpen(false);

    setIsSaveCurrentSetOpen(
      true,
    );
  }

  function handleSaveCurrentSetAsPlaylist(
    name: string,
    description: string,
    category: string,
  ) {
    if (
      currentSet.items.length ===
      0
    ) {
      return;
    }

    const newPlaylist: Playlist = {
      id:
        createPlaylistId(
          name,
        ),

      name,
      description,
      category,

      trackIds:
        currentSet.items.map(
          (item) =>
            item.trackId,
        ),

      updatedAt: "Today",
    };

    setPlaylists(
      (currentPlaylists) => [
        newPlaylist,
        ...currentPlaylists,
      ],
    );

    setIsSaveCurrentSetOpen(
      false,
    );

    window.alert(
      `"${name}" saved with ${newPlaylist.trackIds.length} ${
        newPlaylist.trackIds.length ===
        1
          ? "track"
          : "tracks"
      }.`,
    );
  }

  function handleOpenSetAnalysis() {
    setDetailsTrackId(null);
    setMatchTrackId(null);
    setIsSetlistGeneratorOpen(false);
    setIsCurrentSetOpen(false);
    setIsSetAnalysisOpen(true);
  }

  function handleReplaceCurrentSetTrack(
    currentTrackId: string,
    replacementTrackId: string,
  ) {
    setCurrentSet(
      (currentValue) => {
        if (
          currentValue.items.some(
            (item) =>
              item.trackId ===
              replacementTrackId,
          )
        ) {
          return currentValue;
        }

        return {
          ...currentValue,

          items:
            currentValue.items.map(
              (item) =>
                item.trackId ===
                currentTrackId
                  ? {
                      ...item,
                      trackId:
                        replacementTrackId,
                    }
                  : item,
            ),

          updatedAt:
            new Date().toISOString(),
        };
      },
    );
  }

  function handleOpenInsertTrack(
    insertIndex: number,
  ) {
    setContextMenu(null);
    setSetEditorRequest({
      mode: "insert",
      insertIndex,
    });
  }

  function handleOpenReplaceTrack(
    replaceIndex: number,
  ) {
    setContextMenu(null);
    setSetEditorRequest({
      mode: "replace",
      insertIndex:
        replaceIndex,
    });
  }

  function handleApplySetEditorTrack(
    trackId: string,
  ) {
    if (
      !setEditorRequest
    ) {
      return;
    }

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

        const nextItems = [
          ...currentValue.items,
        ];

        if (
          setEditorRequest.mode ===
          "insert"
        ) {
          const safeIndex =
            Math.max(
              0,
              Math.min(
                setEditorRequest.insertIndex,
                nextItems.length,
              ),
            );

          nextItems.splice(
            safeIndex,
            0,
            createCurrentSetItem(
              trackId,
            ),
          );
        } else {
          const replaceIndex =
            setEditorRequest.insertIndex;

          if (
            replaceIndex < 0 ||
            replaceIndex >=
              nextItems.length
          ) {
            return currentValue;
          }

          nextItems[
            replaceIndex
          ] = {
            ...nextItems[
              replaceIndex
            ],
            trackId,
          };
        }

        return {
          ...currentValue,
          items:
            nextItems,
          updatedAt:
            new Date().toISOString(),
        };
      },
    );

    setSetEditorRequest(null);
  }
  function handleRepairInsertBridge(
    afterTrackId: string,
    bridgeTrackId: string,
  ) {
    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (currentPlaylist) => {
            if (
              currentPlaylist.id !==
              playlistId
            ) {
              return currentPlaylist;
            }

            if (
              currentPlaylist.trackIds.includes(
                bridgeTrackId,
              )
            ) {
              return currentPlaylist;
            }

            const sourceIndex =
              currentPlaylist.trackIds.indexOf(
                afterTrackId,
              );

            if (
              sourceIndex < 0
            ) {
              return currentPlaylist;
            }

            const trackIds = [
              ...currentPlaylist.trackIds,
            ];

            trackIds.splice(
              sourceIndex + 1,
              0,
              bridgeTrackId,
            );

            return {
              ...currentPlaylist,
              trackIds,
              updatedAt:
                "Today",
            };
          },
        ),
    );
  }

  function handleRepairReplaceTrack(
    trackId: string,
    replacementTrackId: string,
  ) {
    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (currentPlaylist) => {
            if (
              currentPlaylist.id !==
              playlistId
            ) {
              return currentPlaylist;
            }

            if (
              currentPlaylist.trackIds.includes(
                replacementTrackId,
              )
            ) {
              return currentPlaylist;
            }

            return {
              ...currentPlaylist,

              trackIds:
                currentPlaylist.trackIds.map(
                  (currentTrackId) =>
                    currentTrackId ===
                    trackId
                      ? replacementTrackId
                      : currentTrackId,
                ),

              updatedAt:
                "Today",
            };
          },
        ),
    );
  }

  function handleRepairApplyOrder(
    trackIds: string[],
  ) {
    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (currentPlaylist) =>
            currentPlaylist.id ===
            playlistId
              ? {
                  ...currentPlaylist,
                  trackIds,
                  updatedAt:
                    "Today",
                }
              : currentPlaylist,
        ),
    );

    setSelectedTrackIds([]);
    setLastSelectedTrackId(
      null,
    );
  }
  function handleSetCurrentSetReference(
    trackId: string,
  ) {
    setIsCurrentSetOpen(false);
    setDetailsTrackId(null);
    setMatchTrackId(
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
    setIsCurrentSetOpen(false);
    setIsSetlistGeneratorOpen(false);
    setIsSetAnalysisOpen(false);
    setMatchTrackId(
      selectedTrackIds[0],
    );
    setContextMenu(null);
  }

  function handleOpenTrackDetails(
    trackId: string,
  ) {
    setMatchTrackId(null);
    setIsCurrentSetOpen(false);
    setIsSetlistGeneratorOpen(false);
    setIsSetAnalysisOpen(false);

    setDetailsTrackId(
      trackId,
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
    const shouldRemove =
      window.confirm(
        "Remove this track from the playlist?",
      );

    if (!shouldRemove) {
      return;
    }

    removeTrackIdsFromCurrentPlaylist([
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

  if (!playlist) {
    return (
      <section className="page">
        <h1>
          Playlist not found
        </h1>

        <Link
          className="back-link"
          to="/playlists"
        >
          Return to playlists
        </Link>
      </section>
    );
  }

  return (
    <>
      <section
        className={`page playlist-detail-page ${
          selectedDetailsTrack ||
          selectedMatchTrack ||
          isCurrentSetOpen ||
          isSetJourneyOpen
            ? "playlist-detail-page--panel-open"
            : ""
        }`}
      >
        <Link
          className="back-link"
          to="/playlists"
        >
          <ArrowLeft size={16} />
          Back to playlists
        </Link>

        <header className="page-header playlist-detail-page__header">
          <div>
            <p className="page-eyebrow">
              {playlist.category}
            </p>

            <h1>
              {playlist.name}
            </h1>

            <p className="page-description">
              {playlist.description}
            </p>
          </div>

          <div className="playlist-detail-page__summary">
            <strong>
              {visibleTracks.length}
            </strong>

            <span>
              visible{" "}
              {visibleTracks.length ===
              1
                ? "track"
                : "tracks"}
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
              tracks={
                playlistTracks
              }
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
          onCopySelected={() =>
            setTransferMode(
              "copy",
            )
          }
          onMoveSelected={() =>
            setTransferMode(
              "move",
            )
          }
          onSetFolder={
            handleBulkSetFolder
          }
          onAddKeyword={
            handleBulkAddKeyword
          }
          onRemoveKeyword={
            handleBulkRemoveKeyword
          }
          onSetRating={
            handleBulkSetRating
          }
          onSetEnergy={
            handleBulkSetEnergy
          }
          onDeleteSelected={
            handleDeleteSelected
          }
          onClearSelection={
            handleClearSelection
          }
        />

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
          playlistTracks
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

      <SetlistGeneratorModal
        isOpen={
          isSetlistGeneratorOpen
        }
        tracks={
          playlistTracks
        }
        selectedTrack={
          selectedTrackIds.length ===
          1
            ? playlistTracks.find(
                (track) =>
                  track.id ===
                  selectedTrackIds[0],
              ) ?? null
            : null
        }
        onClose={() =>
          setIsSetlistGeneratorOpen(
            false,
          )
        }
        onApply={
          handleApplyGeneratedSetlist
        }
      />

      <CurrentSetPanel
        isOpen={
          isCurrentSetOpen
        }
        currentSet={
          currentSet
        }
        tracks={tracks}
        onClose={() =>
          setIsCurrentSetOpen(
            false,
          )
        }
        onAnalyzeSet={
          handleOpenSetAnalysis
        }
        onSaveAsPlaylist={
          handleOpenSaveCurrentSet
        }
        onInsertTrack={
          handleOpenInsertTrack
        }
        onReplaceTrack={
          handleOpenReplaceTrack
        }
        onRemoveTrack={
          handleRemoveTrackFromCurrentSet
        }
        onClear={
          handleClearCurrentSet
        }
        onReorder={
          handleReorderCurrentSet
        }
        onSetReference={
          handleSetCurrentSetReference
        }
        onChangePlannedSeconds={
          handleChangePlannedSeconds
        }
      />

      <SetTrackPickerModal
        isOpen={
          setEditorRequest !==
          null
        }
        mode={
          setEditorRequest
            ?.mode ??
          "insert"
        }
        previousTrack={
          setEditorRequest
            ? currentSetTracks[
                setEditorRequest.mode ===
                "insert"
                  ? setEditorRequest.insertIndex -
                    1
                  : setEditorRequest.insertIndex -
                    1
              ] ?? null
            : null
        }
        nextTrack={
          setEditorRequest
            ? currentSetTracks[
                setEditorRequest.mode ===
                "insert"
                  ? setEditorRequest.insertIndex
                  : setEditorRequest.insertIndex +
                    1
              ] ?? null
            : null
        }
        candidateTracks={
          playlistTracks
        }
        excludedTrackIds={
          currentSet.items
            .filter(
              (
                _,
                index,
              ) =>
                !(
                  setEditorRequest
                    ?.mode ===
                    "replace" &&
                  index ===
                    setEditorRequest.insertIndex
                ),
            )
            .map(
              (item) =>
                item.trackId,
            )
        }
        onClose={() =>
          setSetEditorRequest(
            null,
          )
        }
        onSelect={
          handleApplySetEditorTrack
        }
      />

      <SetJourneyPanel
        isOpen={
          isSetJourneyOpen
        }
        currentSet={
          currentSet
        }
        tracks={
          tracks
        }
        eventPlan={
          eventPlan
        }
        onClose={() =>
          setIsSetJourneyOpen(
            false,
          )
        }
      />

      <PlaylistRepairPanel
        isOpen={
          isPlaylistRepairOpen
        }
        playlistName={
          playlist.name
        }
        playlistTracks={
          playlistOrderedTracks
        }
        allTracks={
          tracks
        }
        onClose={() =>
          setIsPlaylistRepairOpen(
            false,
          )
        }
        onInsertBridge={
          handleRepairInsertBridge
        }
        onReplaceTrack={
          handleRepairReplaceTrack
        }
        onApplyOrder={
          handleRepairApplyOrder
        }
      />

      <SetAnalysisPanel
        isOpen={
          isSetAnalysisOpen
        }
        setTracks={
          currentSetTracks
        }
        candidateTracks={
          playlistTracks
        }
        onClose={() =>
          setIsSetAnalysisOpen(
            false,
          )
        }
        onReplaceTrack={
          handleReplaceCurrentSetTrack
        }
      />

      <SaveCurrentSetModal
        isOpen={
          isSaveCurrentSetOpen
        }
        trackCount={
          currentSet.items.length
        }
        defaultName={
          `${playlist.name} Set`
        }
        onClose={() =>
          setIsSaveCurrentSetOpen(
            false,
          )
        }
        onSave={
          handleSaveCurrentSetAsPlaylist
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
            setIsCurrentSetOpen(false);
            setIsSetlistGeneratorOpen(false);
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
        currentPlaylistId={
          playlist.id
        }
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
