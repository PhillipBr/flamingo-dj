import {
  FolderOpen,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import type { Track } from "../../types/track";

import {
  getTrackCamelot,
} from "../../utils/matchSongs";

import type {
  LibraryTrackSourceMap,
} from "../../utils/liveLibrarySources";

import {
  getPrimaryTrackSource,
} from "../../utils/liveLibrarySources";

import {
  EMPTY_LIVE_QUICK_SEARCH_FILTERS,
  searchLiveLibrary,
  type LiveQuickSearchFilters,
} from "../../utils/liveQuickSearch";

import "./LiveQuickSearch.css";

type LiveQuickSearchProps = {
  tracks: readonly Track[];
  excludedTrackIds: ReadonlySet<string>;
  sourceMap: LibraryTrackSourceMap;

  onPlayNext: (
    trackId: string,
  ) => void;

  onAddAfterNext: (
    trackId: string,
  ) => void;
};

function parseNumber(
  value: string,
): number | null {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed =
    Number(trimmed);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

export default function LiveQuickSearch({
  tracks,
  excludedTrackIds,
  sourceMap,
  onPlayNext,
  onAddAfterNext,
}: LiveQuickSearchProps) {
  const [
    filters,
    setFilters,
  ] =
    useState<LiveQuickSearchFilters>(
      EMPTY_LIVE_QUICK_SEARCH_FILTERS,
    );

  const [
    showFilters,
    setShowFilters,
  ] =
    useState(false);

  const hasSearch =
    filters.query.trim() ||
    filters.genre.trim() ||
    filters.musicalKey.trim() ||
    filters.bpmMin !== null ||
    filters.bpmMax !== null ||
    filters.energyMin !== null ||
    filters.energyMax !== null;

  const results =
    useMemo(
      () =>
        hasSearch
          ? searchLiveLibrary(
              tracks,
              filters,
              excludedTrackIds,
              40,
            )
          : [],
      [
        excludedTrackIds,
        filters,
        hasSearch,
        tracks,
      ],
    );

  function update(
    patch: Partial<LiveQuickSearchFilters>,
  ) {
    setFilters(
      (current) => ({
        ...current,
        ...patch,
      }),
    );
  }

  function clear() {
    setFilters({
      ...EMPTY_LIVE_QUICK_SEARCH_FILTERS,
    });
  }

  return (
    <section className="live-quick-search">
      <header>
        <div>
          <Search size={16} />

          <div>
            <span>
              Whole Library
            </span>

            <h2>
              Quick Search
            </h2>
          </div>
        </div>

        <small>
          Title · Artist · Album · Genre · Keywords
        </small>
      </header>

      <div className="live-quick-search__bar">
        <Search size={14} />

        <input
          value={filters.query}
          onChange={(event) =>
            update({
              query:
                event.target.value,
            })
          }
          placeholder="Search Bad Bunny, bachata, reggaeton..."
        />

        <button
          type="button"
          className={
            showFilters
              ? "live-quick-search__filter-button live-quick-search__filter-button--active"
              : "live-quick-search__filter-button"
          }
          onClick={() =>
            setShowFilters(
              (value) => !value,
            )
          }
        >
          <SlidersHorizontal
            size={13}
          />
          Filters
        </button>

        {hasSearch && (
          <button
            type="button"
            className="live-quick-search__clear"
            onClick={clear}
          >
            <X size={13} />
            Clear
          </button>
        )}
      </div>

      {showFilters && (
        <div className="live-quick-search__filters">
          <label>
            <span>BPM min</span>
            <input
              type="number"
              value={
                filters.bpmMin ??
                ""
              }
              onChange={(event) =>
                update({
                  bpmMin:
                    parseNumber(
                      event.target
                        .value,
                    ),
                })
              }
            />
          </label>

          <label>
            <span>BPM max</span>
            <input
              type="number"
              value={
                filters.bpmMax ??
                ""
              }
              onChange={(event) =>
                update({
                  bpmMax:
                    parseNumber(
                      event.target
                        .value,
                    ),
                })
              }
            />
          </label>

          <label>
            <span>Energy min</span>
            <input
              type="number"
              value={
                filters.energyMin ??
                ""
              }
              onChange={(event) =>
                update({
                  energyMin:
                    parseNumber(
                      event.target
                        .value,
                    ),
                })
              }
            />
          </label>

          <label>
            <span>Energy max</span>
            <input
              type="number"
              value={
                filters.energyMax ??
                ""
              }
              onChange={(event) =>
                update({
                  energyMax:
                    parseNumber(
                      event.target
                        .value,
                    ),
                })
              }
            />
          </label>

          <label>
            <span>Genre</span>
            <input
              value={
                filters.genre
              }
              onChange={(event) =>
                update({
                  genre:
                    event.target
                      .value,
                })
              }
              placeholder="reggaeton"
            />
          </label>

          <label>
            <span>Key</span>
            <input
              value={
                filters.musicalKey
              }
              onChange={(event) =>
                update({
                  musicalKey:
                    event.target
                      .value,
                })
              }
              placeholder="Am"
            />
          </label>
        </div>
      )}

      {!hasSearch ? (
        <div className="live-quick-search__empty">
          Search the complete DJ Library without leaving Live Mode.
        </div>
      ) : (
        <>
          <div className="live-quick-search__summary">
            <strong>
              {results.length}
            </strong>{" "}
            result
            {results.length === 1
              ? ""
              : "s"}
            {" "}shown
          </div>

          <div className="live-quick-search__results">
            {results.map(
              (track) => {
                const source =
                  getPrimaryTrackSource(
                    track.id,
                    sourceMap,
                  );

                return (
                  <article
                    key={track.id}
                  >
                    <div className="live-quick-search__track">
                      <strong>
                        {track.title}
                      </strong>

                      <span>
                        {track.artist}
                      </span>

                      <small>
                        {track.tempo !==
                        null
                          ? `${Math.round(
                              track.tempo,
                            )} BPM`
                          : "— BPM"}{" "}
                        · Key{" "}
                        {track.musicalKey ??
                          "—"}{" "}
                        ·{" "}
                        {getTrackCamelot(
                          track,
                        ) ?? "—"}{" "}
                        · Energy{" "}
                        {track.energy ??
                          "—"}{" "}
                        · Pop{" "}
                        {track.spotifyPopularity ??
                          "—"}
                      </small>

                      <small className="live-quick-search__source">
                        <FolderOpen
                          size={10}
                        />

                        {source
                          ? `Source: ${source.playlistName}`
                          : "Source: DJ Library"}
                      </small>
                    </div>

                    <div className="live-quick-search__actions">
                      <button
                        type="button"
                        onClick={() =>
                          onPlayNext(
                            track.id,
                          )
                        }
                      >
                        <Radio
                          size={11}
                        />
                        Play next
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onAddAfterNext(
                            track.id,
                          )
                        }
                      >
                        <Plus
                          size={11}
                        />
                        Add after
                      </button>

                      {source && (
                        <Link
                          to={`/playlists/${source.playlistId}`}
                        >
                          Open playlist
                        </Link>
                      )}
                    </div>
                  </article>
                );
              },
            )}
          </div>
        </>
      )}
    </section>
  );
}
