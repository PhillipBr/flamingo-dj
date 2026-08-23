import {
  Filter,
  RotateCcw,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Track } from "../../types/track";

import {
  EMPTY_TRACK_FILTERS,
  type TrackFilters,
} from "../../types/trackFilters";

import {
  countActiveTrackFilters,
} from "../../utils/trackFilters";

import "./TrackFiltersPanel.css";

type Props = {
  tracks: Track[];
  filters: TrackFilters;

  onChange: (
    filters: TrackFilters,
  ) => void;

  onClear: () => void;
};

type NumericFilterKey =
  | "releaseYearMin"
  | "releaseYearMax"
  | "bpmMin"
  | "bpmMax"
  | "energyMin"
  | "energyMax"
  | "popularityMin"
  | "popularityMax";

function normalize(
  value:
    string | null | undefined,
): string {
  return (value ?? "")
    .trim();
}

function parseNumericText(
  value: string,
): number | null {
  const cleaned =
    value
      .trim()
      .replace(
        ",",
        ".",
      );

  if (!cleaned) {
    return null;
  }

  const parsed =
    Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function numericText(
  value: number | null,
): string {
  return value === null
    ? ""
    : String(value);
}

export default function TrackFiltersPanel({
  tracks,
  filters,
  onChange,
  onClear,
}: Props) {
  const rootRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  const activeCount =
    countActiveTrackFilters(
      filters,
    );

  const countries =
    useMemo(
      () =>
        Array.from(
          new Set(
            tracks
              .map(
                (track) =>
                  normalize(
                    track.country,
                  ),
              )
              .filter(Boolean),
          ),
        ).sort(
          (a, b) =>
            a.localeCompare(b),
        ),
      [tracks],
    );

  const musicalKeys =
    useMemo(
      () =>
        Array.from(
          new Set(
            tracks
              .map(
                (track) =>
                  normalize(
                    track.musicalKey,
                  ),
              )
              .filter(Boolean),
          ),
        ).sort(
          (a, b) =>
            a.localeCompare(b),
        ),
      [tracks],
    );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(
      event: MouseEvent,
    ) {
      const target =
        event.target as Node;

      if (
        rootRef.current?.contains(
          target,
        )
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    isOpen,
  ]);

  function patch(
    next:
      Partial<TrackFilters>,
  ) {
    onChange({
      ...filters,
      ...next,
    });
  }

  function updateNumeric(
    key: NumericFilterKey,
    value: string,
  ) {
    if (
      value.trim() === ""
    ) {
      patch({
        [key]: null,
      });

      return;
    }

    const parsed =
      parseNumericText(
        value,
      );

    if (
      parsed !== null
    ) {
      patch({
        [key]:
          parsed,
      });
    }
  }

  function clearAll() {
    onChange({
      ...EMPTY_TRACK_FILTERS,
    });

    onClear();
  }

  return (
    <div
      ref={rootRef}
      className="track-filters"
    >
      <button
        className={
          activeCount > 0
            ? "track-filters__trigger track-filters__trigger--active"
            : "track-filters__trigger"
        }
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() =>
          setIsOpen(
            (current) =>
              !current,
          )
        }
      >
        <Filter size={15} />
        Filters

        {activeCount > 0 && (
          <span>
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          className="track-filters__panel"
          role="dialog"
          aria-label="Track filters"
        >
          <header className="track-filters__header">
            <div>
              <strong>
                Filters
              </strong>

              <small>
                Combine filters to narrow the playlist.
              </small>
            </div>

            <button
              type="button"
              aria-label="Close filters"
              onClick={() =>
                setIsOpen(
                  false,
                )
              }
            >
              <X size={17} />
            </button>
          </header>

          <div className="track-filters__body">
            <section className="track-filters__section">
              <h3>
                Classification
              </h3>

              <div className="track-filters__classification-grid">
                <label>
                  <span>
                    Country
                  </span>

                  <select
                    value={
                      filters.country
                    }
                    onChange={(
                      event,
                    ) =>
                      patch({
                        country:
                          event
                            .target
                            .value,
                      })
                    }
                  >
                    <option value="all">
                      All countries
                    </option>

                    {countries.map(
                      (country) => (
                        <option
                          key={
                            country
                          }
                          value={
                            country
                          }
                        >
                          {country}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span>
                    Musical key
                  </span>

                  <select
                    value={
                      filters.musicalKey
                    }
                    onChange={(
                      event,
                    ) =>
                      patch({
                        musicalKey:
                          event
                            .target
                            .value,
                      })
                    }
                  >
                    <option value="all">
                      All musical keys
                    </option>

                    {musicalKeys.map(
                      (key) => (
                        <option
                          key={key}
                          value={key}
                        >
                          {key}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="track-filters__keyword">
                  <span>
                    Keyword
                  </span>

                  <input
                    type="text"
                    placeholder="chill, billboard, peak time..."
                    value={
                      filters.keyword
                    }
                    onChange={(
                      event,
                    ) =>
                      patch({
                        keyword:
                          event
                            .target
                            .value,
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <section className="track-filters__section">
              <h3>
                DJ Values
              </h3>

              <div className="track-filters__ranges">
                <RangeRow
                  label="Release Year"
                  minimum={
                    filters.releaseYearMin
                  }
                  maximum={
                    filters.releaseYearMax
                  }
                  minimumPlaceholder="From year"
                  maximumPlaceholder="To year"
                  integerOnly
                  maxLength={4}
                  onMinimumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "releaseYearMin",
                      value,
                    )
                  }
                  onMaximumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "releaseYearMax",
                      value,
                    )
                  }
                />

                <RangeRow
                  label="BPM"
                  minimum={
                    filters.bpmMin
                  }
                  maximum={
                    filters.bpmMax
                  }
                  onMinimumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "bpmMin",
                      value,
                    )
                  }
                  onMaximumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "bpmMax",
                      value,
                    )
                  }
                />

                <RangeRow
                  label="Energy"
                  minimum={
                    filters.energyMin
                  }
                  maximum={
                    filters.energyMax
                  }
                  onMinimumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "energyMin",
                      value,
                    )
                  }
                  onMaximumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "energyMax",
                      value,
                    )
                  }
                />

                <RangeRow
                  label="Popularity"
                  minimum={
                    filters.popularityMin
                  }
                  maximum={
                    filters.popularityMax
                  }
                  integerOnly
                  onMinimumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "popularityMin",
                      value,
                    )
                  }
                  onMaximumChange={(
                    value,
                  ) =>
                    updateNumeric(
                      "popularityMax",
                      value,
                    )
                  }
                />
              </div>
            </section>
          </div>

          <footer className="track-filters__footer">
            <span>
              {activeCount} active
            </span>

            <div>
              <button
                type="button"
                onClick={
                  clearAll
                }
              >
                <RotateCcw
                  size={14}
                />

                Clear all
              </button>

              <button
                className="track-filters__done"
                type="button"
                onClick={() =>
                  setIsOpen(
                    false,
                  )
                }
              >
                Done
              </button>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}

type RangeRowProps = {
  label: string;

  minimum: number | null;
  maximum: number | null;

  minimumPlaceholder?: string;
  maximumPlaceholder?: string;

  integerOnly?: boolean;
  maxLength?: number;

  onMinimumChange:
    (value: string) => void;

  onMaximumChange:
    (value: string) => void;
};

function RangeRow({
  label,
  minimum,
  maximum,
  minimumPlaceholder = "Minimum",
  maximumPlaceholder = "Maximum",
  integerOnly = false,
  maxLength,
  onMinimumChange,
  onMaximumChange,
}: RangeRowProps) {
  function clean(
    value: string,
  ): string {
    if (
      integerOnly
    ) {
      return value.replace(
        /[^\d]/g,
        "",
      );
    }

    return value.replace(
      /[^\d.,-]/g,
      "",
    );
  }

  return (
    <div className="track-filters__range-row">
      <strong>
        {label}
      </strong>

      <div>
        <label>
          <span>
            Minimum
          </span>

          <input
            type="text"
            inputMode={
              integerOnly
                ? "numeric"
                : "decimal"
            }
            maxLength={
              maxLength
            }
            placeholder={
              minimumPlaceholder
            }
            value={
              numericText(
                minimum,
              )
            }
            onChange={(
              event,
            ) =>
              onMinimumChange(
                clean(
                  event
                    .target
                    .value,
                ),
              )
            }
          />
        </label>

        <em>—</em>

        <label>
          <span>
            Maximum
          </span>

          <input
            type="text"
            inputMode={
              integerOnly
                ? "numeric"
                : "decimal"
            }
            maxLength={
              maxLength
            }
            placeholder={
              maximumPlaceholder
            }
            value={
              numericText(
                maximum,
              )
            }
            onChange={(
              event,
            ) =>
              onMaximumChange(
                clean(
                  event
                    .target
                    .value,
                ),
              )
            }
          />
        </label>
      </div>
    </div>
  );
}
