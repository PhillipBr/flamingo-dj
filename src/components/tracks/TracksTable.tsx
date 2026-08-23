import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
  Music2,
  RotateCcw,
  Star,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";

import type { Track } from "../../types/track";
import type { TrackColumnId } from "../../types/trackColumn";
import { getCamelotKey } from "../../utils/camelot";
import {
  formatDate,
  formatDuration,
  formatOverallVolume,
  formatTempo,
} from "../../utils/trackFormatters";
import { countryToFlag } from "../../utils/countryFlag";
import "./TracksTable.css";

export type TrackSortField =
  | "title"
  | "artist"
  | "album"
  | "tempo"
  | "musicalKey"
  | "camelot"
  | "energy"
  | "spotifyPopularity"
  | "genre"
  | "country"
  | "durationSeconds"
  | "releaseDate"
  | "overallVolume"
  | "rating"
  | "folder"
  | "dateAdded";

export type TrackSortDirection =
  | "asc"
  | "desc";

type TracksTableProps = {
  tracks: Track[];
  visibleColumns: TrackColumnId[];
  selectedTrackIds: string[];
  sortField: TrackSortField;
  sortDirection: TrackSortDirection;

  onTrackDoubleClick: (
    event: MouseEvent<HTMLTableRowElement>,
    trackId: string,
  ) => void;

  onToggleTrackSelection: (
    trackId: string,
    checked: boolean,
  ) => void;

  onToggleAllVisible: (
    checked: boolean,
  ) => void;

  onOpenTrackDetails: (
    trackId: string,
  ) => void;

  onSort: (
    field: TrackSortField,
  ) => void;

  onOpenContextMenu: (
    event: MouseEvent<HTMLTableRowElement>,
    track: Track,
  ) => void;
};

type SortableHeaderProps = {
  label: string;
  field: TrackSortField;
  activeField: TrackSortField;
  direction: TrackSortDirection;
  onSort: (
    field: TrackSortField,
  ) => void;
};

type SelectAllCheckboxProps = {
  checked: boolean;
  indeterminate: boolean;
  onChange: (
    checked: boolean,
  ) => void;
};

type ColumnDefinition = {
  id: TrackColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortField?: TrackSortField;
};

type ColumnWidths =
  Partial<
    Record<
      TrackColumnId,
      number
    >
  >;

const COLUMN_ORDER_STORAGE_KEY =
  "flamingo-dj-track-column-order-v8";

const COLUMN_WIDTH_STORAGE_KEY =
  "flamingo-dj-track-column-widths-v8";

const COLUMN_DEFINITIONS:
  ColumnDefinition[] = [
  {
    id: "artwork",
    label: "Artwork",
    defaultWidth: 64,
    minWidth: 56,
  },
  {
    id: "title",
    label: "Title",
    defaultWidth: 230,
    minWidth: 140,
    sortField: "title",
  },
  {
    id: "artist",
    label: "Artist",
    defaultWidth: 190,
    minWidth: 120,
    sortField: "artist",
  },
  {
    id: "album",
    label: "Album",
    defaultWidth: 190,
    minWidth: 120,
    sortField: "album",
  },
  {
    id: "tempo",
    label: "BPM",
    defaultWidth: 90,
    minWidth: 72,
    sortField: "tempo",
  },
  {
    id: "musicalKey",
    label: "Key",
    defaultWidth: 88,
    minWidth: 70,
    sortField: "musicalKey",
  },
  {
    id: "camelot",
    label: "Camelot",
    defaultWidth: 94,
    minWidth: 78,
    sortField: "camelot",
  },
  {
    id: "energy",
    label: "Energy",
    defaultWidth: 140,
    minWidth: 100,
    sortField: "energy",
  },
  {
    id: "spotifyPopularity",
    label: "Popularity",
    defaultWidth: 110,
    minWidth: 92,
    sortField:
      "spotifyPopularity",
  },
  {
    id: "genre",
    label: "Genre",
    defaultWidth: 170,
    minWidth: 110,
    sortField: "genre",
  },
  {
    id: "country",
    label: "Country",
    defaultWidth: 120,
    minWidth: 90,
    sortField: "country",
  },
  {
    id: "durationSeconds",
    label: "Duration",
    defaultWidth: 100,
    minWidth: 82,
    sortField:
      "durationSeconds",
  },
  {
    id: "releaseDate",
    label: "Release",
    defaultWidth: 112,
    minWidth: 96,
    sortField: "releaseDate",
  },
  {
    id: "overallVolume",
    label: "Volume",
    defaultWidth: 105,
    minWidth: 88,
    sortField:
      "overallVolume",
  },
  {
    id: "rating",
    label: "Rating",
    defaultWidth: 92,
    minWidth: 78,
    sortField: "rating",
  },
  {
    id: "folder",
    label: "Folder",
    defaultWidth: 155,
    minWidth: 100,
    sortField: "folder",
  },
  {
    id: "dateAdded",
    label: "Date Added",
    defaultWidth: 118,
    minWidth: 96,
    sortField: "dateAdded",
  },
];

const DEFAULT_COLUMN_ORDER =
  COLUMN_DEFINITIONS.map(
    (column) =>
      column.id,
  );

function isKnownColumnId(
  value: unknown,
): value is TrackColumnId {
  return (
    typeof value ===
      "string" &&
    COLUMN_DEFINITIONS.some(
      (column) =>
        column.id === value,
    )
  );
}

function loadColumnOrder():
  TrackColumnId[] {
  try {
    const stored =
      localStorage.getItem(
        COLUMN_ORDER_STORAGE_KEY,
      );

    if (!stored) {
      return [
        ...DEFAULT_COLUMN_ORDER,
      ];
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (
      !Array.isArray(parsed)
    ) {
      return [
        ...DEFAULT_COLUMN_ORDER,
      ];
    }

    return Array.from(
      new Set([
        ...parsed.filter(
          isKnownColumnId,
        ),
        ...DEFAULT_COLUMN_ORDER,
      ]),
    );
  } catch {
    return [
      ...DEFAULT_COLUMN_ORDER,
    ];
  }
}

function loadColumnWidths():
  ColumnWidths {
  try {
    const stored =
      localStorage.getItem(
        COLUMN_WIDTH_STORAGE_KEY,
      );

    if (!stored) {
      return {};
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const widths:
      ColumnWidths = {};

    for (
      const column of
        COLUMN_DEFINITIONS
    ) {
      const value =
        (
          parsed as Record<
            string,
            unknown
          >
        )[column.id];

      if (
        typeof value ===
          "number" &&
        Number.isFinite(
          value,
        )
      ) {
        widths[column.id] =
          Math.max(
            column.minWidth,
            Math.round(value),
          );
      }
    }

    return widths;
  } catch {
    return {};
  }
}

function SortableHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: SortableHeaderProps) {
  const active =
    field === activeField;

  return (
    <button
      className={`tracks-table__sort ${
        active
          ? "tracks-table__sort--active"
          : ""
      }`}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSort(field);
      }}
    >
      <span>
        {label}
      </span>

      {!active && (
        <ArrowUpDown
          size={13}
        />
      )}

      {active &&
        direction === "asc" && (
          <ArrowUp
            size={13}
          />
        )}

      {active &&
        direction === "desc" && (
          <ArrowDown
            size={13}
          />
        )}
    </button>
  );
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: SelectAllCheckboxProps) {
  const checkboxRef =
    useRef<
      HTMLInputElement | null
    >(null);

  useEffect(() => {
    if (
      checkboxRef.current
    ) {
      checkboxRef.current.indeterminate =
        indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      className="tracks-table__checkbox"
      type="checkbox"
      checked={checked}
      aria-label="Select all visible tracks"
      onChange={(event) =>
        onChange(
          event.target.checked,
        )
      }
    />
  );
}

function getPopularityClass(
  popularity: number | null,
): string {
  if (
    popularity === null
  ) {
    return "popularity-badge--neutral";
  }

  if (
    popularity >= 90
  ) {
    return "popularity-badge--very-high";
  }

  if (
    popularity >= 79
  ) {
    return "popularity-badge--high";
  }

  if (
    popularity >= 60
  ) {
    return "popularity-badge--medium";
  }

  return "popularity-badge--neutral";
}

function getTrackInitial(
  track: Track,
): string {
  const initial =
    track.title
      .trim()
      .charAt(0);

  return initial
    ? initial.toUpperCase()
    : "♪";
}

function renderRating(
  rating: number | null,
) {
  if (
    rating === null
  ) {
    return (
      <span className="tracks-table__empty">
        —
      </span>
    );
  }

  const normalized =
    Math.min(
      Math.max(
        Math.round(
          rating,
        ),
        0,
      ),
      5,
    );

  return (
    <div
      className="track-rating"
      aria-label={`${normalized} out of 5 stars`}
    >
      <Star size={13} />
      <span>
        {normalized}
      </span>
    </div>
  );
}

function getColumnDefinition(
  columnId: TrackColumnId,
): ColumnDefinition {
  const definition =
    COLUMN_DEFINITIONS.find(
      (column) =>
        column.id === columnId,
    );

  if (!definition) {
    throw new Error(
      `Unknown track column: ${columnId}`,
    );
  }

  return definition;
}

function renderArtwork(
  track: Track,
) {
  const artworkContent =
    track.artworkUrl ? (
      <img
        className="tracks-table__artwork-image"
        src={track.artworkUrl}
        alt={`${track.title} artwork`}
        loading="lazy"
        draggable={false}
      />
    ) : (
      <span className="tracks-table__artwork-fallback">
        {getTrackInitial(
          track,
        )}
      </span>
    );

  if (
    !track.spotifyUrl
  ) {
    return (
      <div className="tracks-table__artwork-wrapper">
        {artworkContent}
      </div>
    );
  }

  return (
    <div className="tracks-table__artwork-wrapper">
      <a
        href={
          track.spotifyUrl
        }
        target="_blank"
        rel="noopener noreferrer"
        title={`Open "${track.title}" in Spotify`}
        aria-label={`Open ${track.title} by ${track.artist} in Spotify`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent:
            "center",
          width: "100%",
          height: "100%",
          cursor: "pointer",
        }}
        onClick={(
          event,
        ) => {
          event.stopPropagation();
        }}
        onDoubleClick={(
          event,
        ) => {
          event.stopPropagation();
        }}
        onContextMenu={(
          event,
        ) => {
          /*
           * Keep native browser/Spotify link
           * context menu on the artwork itself.
           */
          event.stopPropagation();
        }}
      >
        {artworkContent}
      </a>
    </div>
  );
}

function renderCell(
  track: Track,
  columnId: TrackColumnId,
) {
  const normalizedEnergy =
    Math.min(
      Math.max(
        track.energy ?? 0,
        0,
      ),
      10,
    );

  switch (columnId) {
    case "artwork":
      return renderArtwork(
        track,
      );

    case "title":
      return (
        <div className="track-title-cell__text">
          <strong
            title={track.title}
          >
            {track.title}
          </strong>
        </div>
      );

    case "artist":
      return (
        <span
          title={track.artist}
        >
          {track.artist}
        </span>
      );

    case "album":
      return (
        <span
          title={
            track.album ??
            undefined
          }
        >
          {track.album ?? "—"}
        </span>
      );

    case "tempo":
      return formatTempo(
        track.tempo,
      );

    case "musicalKey":
      return (
        <span className="key-badge">
          {track.musicalKey ??
            "—"}
        </span>
      );

    case "camelot":
      return (
        <span className="camelot-badge">
          {getCamelotKey(
            track.musicalKey,
          )}
        </span>
      );

    case "energy":
      return (
        <div className="energy-cell">
          <span>
            {track.energy ??
              "—"}
          </span>

          <div
            className="energy-bar"
            aria-label={`Energy ${
              track.energy ??
              "unknown"
            }`}
          >
            <div
              className="energy-bar__value"
              style={{
                width:
                  `${normalizedEnergy * 10}%`,
              }}
            />
          </div>
        </div>
      );

    case "spotifyPopularity":
      return (
        <span
          className={`popularity-badge ${
            getPopularityClass(
              track.spotifyPopularity,
            )
          }`}
        >
          {track.spotifyPopularity ??
            "—"}
        </span>
      );

    case "genre":
      return (
        <span
          title={
            track.genre ??
            undefined
          }
        >
          {track.genre ?? "—"}
        </span>
      );

    case "country":
      return (
        <span
          className="country-cell"
          title={
            track.country ??
            undefined
          }
        >
          {track.country ? (
            <>
              {countryToFlag(
                track.country,
              )}{" "}
              {track.country}
            </>
          ) : (
            "—"
          )}
        </span>
      );

    case "durationSeconds":
      return formatDuration(
        track.durationSeconds,
      );

    case "releaseDate":
      return formatDate(
        track.releaseDate,
      );

    case "overallVolume":
      return formatOverallVolume(
        track.overallVolume,
      );

    case "rating":
      return renderRating(
        track.rating,
      );

    case "folder":
      return (
        <span
          title={
            track.folder ??
            undefined
          }
        >
          {track.folder ?? "—"}
        </span>
      );

    case "dateAdded":
      return formatDate(
        track.dateAdded,
      );

    default:
      return "—";
  }
}

export default function TracksTable({
  tracks,
  visibleColumns,
  selectedTrackIds,
  sortField,
  sortDirection,
  onTrackDoubleClick,
  onToggleTrackSelection,
  onToggleAllVisible,
  onSort,
  onOpenContextMenu,
}: TracksTableProps) {
  const [
    columnOrder,
    setColumnOrder,
  ] =
    useState<
      TrackColumnId[]
    >(loadColumnOrder);

  const [
    columnWidths,
    setColumnWidths,
  ] =
    useState<
      ColumnWidths
    >(loadColumnWidths);

  const [
    draggedColumnId,
    setDraggedColumnId,
  ] =
    useState<
      TrackColumnId | null
    >(null);

  const [
    dragOverColumnId,
    setDragOverColumnId,
  ] =
    useState<
      TrackColumnId | null
    >(null);

  const resizeStateRef =
    useRef<{
      columnId:
        TrackColumnId;
      startX: number;
      startWidth:
        number;
      minWidth:
        number;
    } | null>(
      null,
    );

  useEffect(() => {
    localStorage.setItem(
      COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(
        columnOrder,
      ),
    );
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem(
      COLUMN_WIDTH_STORAGE_KEY,
      JSON.stringify(
        columnWidths,
      ),
    );
  }, [columnWidths]);

  useEffect(() => {
    function handleMouseMove(
      event:
        globalThis.MouseEvent,
    ) {
      const state =
        resizeStateRef.current;

      if (!state) {
        return;
      }

      const nextWidth =
        Math.max(
          state.minWidth,
          state.startWidth +
            event.clientX -
            state.startX,
        );

      setColumnWidths(
        (current) => ({
          ...current,
          [state.columnId]:
            Math.round(
              nextWidth,
            ),
        }),
      );
    }

    function handleMouseUp() {
      if (
        !resizeStateRef.current
      ) {
        return;
      }

      resizeStateRef.current =
        null;

      document.body.classList.remove(
        "tracks-table--resizing",
      );
    }

    window.addEventListener(
      "mousemove",
      handleMouseMove,
    );

    window.addEventListener(
      "mouseup",
      handleMouseUp,
    );

    return () => {
      window.removeEventListener(
        "mousemove",
        handleMouseMove,
      );

      window.removeEventListener(
        "mouseup",
        handleMouseUp,
      );

      document.body.classList.remove(
        "tracks-table--resizing",
      );
    };
  }, []);

  useEffect(() => {
    setColumnOrder(
      (current) =>
        Array.from(
          new Set([
            ...current,
            ...visibleColumns,
          ]),
        ),
    );
  }, [visibleColumns]);

  const orderedVisibleColumns =
    useMemo(
      () =>
        columnOrder.filter(
          (columnId) =>
            visibleColumns.includes(
              columnId,
            ),
        ),
      [
        columnOrder,
        visibleColumns,
      ],
    );

  if (
    tracks.length === 0
  ) {
    return (
      <div className="tracks-empty-state">
        <Music2
          size={30}
        />

        <h2>
          No tracks found
        </h2>

        <p>
          Try changing the search or filter settings.
        </p>
      </div>
    );
  }

  const selectedTrackIdSet =
    new Set(
      selectedTrackIds,
    );

  const selectedVisibleCount =
    tracks.reduce(
      (
        count,
        track,
      ) =>
        selectedTrackIdSet.has(
          track.id,
        )
          ? count + 1
          : count,
      0,
    );

  const areAllVisibleSelected =
    tracks.length > 0 &&
    selectedVisibleCount ===
      tracks.length;

  const areSomeVisibleSelected =
    selectedVisibleCount > 0 &&
    selectedVisibleCount <
      tracks.length;

  function getColumnWidth(
    columnId:
      TrackColumnId,
  ): number {
    const definition =
      getColumnDefinition(
        columnId,
      );

    return (
      columnWidths[
        columnId
      ] ??
      definition.defaultWidth
    );
  }

  function handleColumnDragStart(
    event:
      DragEvent<HTMLTableCellElement>,
    columnId:
      TrackColumnId,
  ) {
    if (
      resizeStateRef.current
    ) {
      event.preventDefault();
      return;
    }

    setDraggedColumnId(
      columnId,
    );

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      columnId,
    );
  }

  function handleColumnDragOver(
    event:
      DragEvent<HTMLTableCellElement>,
    columnId:
      TrackColumnId,
  ) {
    event.preventDefault();

    if (
      draggedColumnId ===
      columnId
    ) {
      return;
    }

    event.dataTransfer.dropEffect =
      "move";

    setDragOverColumnId(
      columnId,
    );
  }

  function handleColumnDrop(
    event:
      DragEvent<HTMLTableCellElement>,
    targetColumnId:
      TrackColumnId,
  ) {
    event.preventDefault();

    const sourceColumnId =
      draggedColumnId ??
      event.dataTransfer.getData(
        "text/plain",
      );

    if (
      !isKnownColumnId(
        sourceColumnId,
      ) ||
      sourceColumnId ===
        targetColumnId
    ) {
      setDraggedColumnId(
        null,
      );

      setDragOverColumnId(
        null,
      );

      return;
    }

    setColumnOrder(
      (current) => {
        const sourceIndex =
          current.indexOf(
            sourceColumnId,
          );

        const targetIndex =
          current.indexOf(
            targetColumnId,
          );

        if (
          sourceIndex ===
            -1 ||
          targetIndex ===
            -1
        ) {
          return current;
        }

        const next = [
          ...current,
        ];

        next.splice(
          sourceIndex,
          1,
        );

        const adjustedTarget =
          sourceIndex <
          targetIndex
            ? targetIndex -
              1
            : targetIndex;

        next.splice(
          adjustedTarget,
          0,
          sourceColumnId,
        );

        return next;
      },
    );

    setDraggedColumnId(
      null,
    );

    setDragOverColumnId(
      null,
    );
  }

  function handleResizeStart(
    event:
      MouseEvent<HTMLSpanElement>,
    columnId:
      TrackColumnId,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const definition =
      getColumnDefinition(
        columnId,
      );

    resizeStateRef.current =
      {
        columnId,
        startX:
          event.clientX,
        startWidth:
          getColumnWidth(
            columnId,
          ),
        minWidth:
          definition.minWidth,
      };

    document.body.classList.add(
      "tracks-table--resizing",
    );
  }

  function handleResetColumnLayout() {
    setColumnOrder([
      ...DEFAULT_COLUMN_ORDER,
    ]);

    setColumnWidths(
      {},
    );
  }

  return (
    <div className="tracks-table-section">
      <div className="tracks-table-layout-toolbar">
        <span>
          Drag headers to reorder. Drag their right edge to resize.
        </span>

        <button
          type="button"
          onClick={
            handleResetColumnLayout
          }
        >
          <RotateCcw
            size={14}
          />
          Reset layout
        </button>
      </div>

      <div className="tracks-table-wrapper">
        <table className="tracks-table">
          <thead>
            <tr>
              <th className="tracks-table__selection-column tracks-table__fixed-column">
                <SelectAllCheckbox
                  checked={
                    areAllVisibleSelected
                  }
                  indeterminate={
                    areSomeVisibleSelected
                  }
                  onChange={
                    onToggleAllVisible
                  }
                />
              </th>

              <th className="tracks-table__index tracks-table__fixed-column">
                #
              </th>

              {orderedVisibleColumns.map(
                (
                  columnId,
                ) => {
                  const definition =
                    getColumnDefinition(
                      columnId,
                    );

                  const width =
                    getColumnWidth(
                      columnId,
                    );

                  const isDragging =
                    draggedColumnId ===
                    columnId;

                  const isTarget =
                    dragOverColumnId ===
                    columnId;

                  return (
                    <th
                      key={
                        columnId
                      }
                      draggable
                      className={[
                        "tracks-table__draggable-header",
                        isDragging
                          ? "tracks-table__draggable-header--dragging"
                          : "",
                        isTarget
                          ? "tracks-table__draggable-header--drag-target"
                          : "",
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(
                          " ",
                        )}
                      style={{
                        width,
                        minWidth:
                          width,
                        maxWidth:
                          width,
                      }}
                      onDragStart={(
                        event,
                      ) =>
                        handleColumnDragStart(
                          event,
                          columnId,
                        )
                      }
                      onDragOver={(
                        event,
                      ) =>
                        handleColumnDragOver(
                          event,
                          columnId,
                        )
                      }
                      onDrop={(
                        event,
                      ) =>
                        handleColumnDrop(
                          event,
                          columnId,
                        )
                      }
                      onDragEnd={() => {
                        setDraggedColumnId(
                          null,
                        );
                        setDragOverColumnId(
                          null,
                        );
                      }}
                    >
                      <div className="tracks-table__header-content">
                        <GripVertical
                          className="tracks-table__drag-handle"
                          size={14}
                        />

                        {definition.sortField ? (
                          <SortableHeader
                            label={
                              definition.label
                            }
                            field={
                              definition.sortField
                            }
                            activeField={
                              sortField
                            }
                            direction={
                              sortDirection
                            }
                            onSort={
                              onSort
                            }
                          />
                        ) : (
                          <span className="tracks-table__plain-header">
                            {
                              definition.label
                            }
                          </span>
                        )}
                      </div>

                      <span
                        className="tracks-table__resize-handle"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${definition.label} column`}
                        onMouseDown={(
                          event,
                        ) =>
                          handleResizeStart(
                            event,
                            columnId,
                          )
                        }
                        onDoubleClick={(
                          event,
                        ) => {
                          event.preventDefault();
                          event.stopPropagation();

                          setColumnWidths(
                            (
                              current,
                            ) => {
                              const next =
                                {
                                  ...current,
                                };

                              delete next[
                                columnId
                              ];

                              return next;
                            },
                          );
                        }}
                      />
                    </th>
                  );
                },
              )}
            </tr>
          </thead>

          <tbody>
            {tracks.map(
              (
                track,
                index,
              ) => {
                const isSelected =
                  selectedTrackIdSet.has(
                    track.id,
                  );

                return (
                  <tr
                    key={
                      track.id
                    }
                    className={
                      isSelected
                        ? "tracks-table__row--selected"
                        : ""
                    }
                    onDoubleClick={(
                      event,
                    ) =>
                      onTrackDoubleClick(
                        event,
                        track.id,
                      )
                    }
                    onContextMenu={(
                      event,
                    ) =>
                      onOpenContextMenu(
                        event,
                        track,
                      )
                    }
                  >
                    <td className="tracks-table__selection-cell tracks-table__fixed-column">
                      <input
                        className="tracks-table__checkbox"
                        type="checkbox"
                        checked={
                          isSelected
                        }
                        aria-label={`Select ${track.title}`}
                        onClick={(
                          event,
                        ) =>
                          event.stopPropagation()
                        }
                        onDoubleClick={(
                          event,
                        ) =>
                          event.stopPropagation()
                        }
                        onChange={(
                          event,
                        ) =>
                          onToggleTrackSelection(
                            track.id,
                            event
                              .target
                              .checked,
                          )
                        }
                      />
                    </td>

                    <td className="tracks-table__index tracks-table__fixed-column">
                      {index + 1}
                    </td>

                    {orderedVisibleColumns.map(
                      (
                        columnId,
                      ) => {
                        const width =
                          getColumnWidth(
                            columnId,
                          );

                        const numeric =
                          [
                            "tempo",
                            "durationSeconds",
                            "overallVolume",
                          ].includes(
                            columnId,
                          );

                        return (
                          <td
                            key={
                              columnId
                            }
                            className={
                              numeric
                                ? "tracks-table__numeric"
                                : undefined
                            }
                            style={{
                              width,
                              minWidth:
                                width,
                              maxWidth:
                                width,
                            }}
                          >
                            <div className="tracks-table__cell-content">
                              {renderCell(
                                track,
                                columnId,
                              )}
                            </div>
                          </td>
                        );
                      },
                    )}
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
