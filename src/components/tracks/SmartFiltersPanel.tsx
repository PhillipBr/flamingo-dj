import {
  CalendarDays,
  Gauge,
  KeyRound,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Track } from "../../types/track";

import {
  EMPTY_SMART_TRACK_FILTERS,
  type SmartTrackFilters,
} from "../../types/smartTrackFilters";

import {
  countActiveSmartFilters,
} from "../../utils/smartTrackFilters";

import "./SmartFiltersPanel.css";

type Props = {
  tracks: Track[];

  filters:
    SmartTrackFilters;

  onChange: (
    filters:
      SmartTrackFilters,
  ) => void;
};

type NumericDrafts = {
  releaseYearFrom: string;
  releaseYearTo: string;
  popularityMin: string;
  popularityMax: string;
  bpmMin: string;
  bpmMax: string;
  energyMin: string;
  energyMax: string;
};

function filterToDrafts(
  filters:
    SmartTrackFilters,
): NumericDrafts {
  return {
    releaseYearFrom:
      filters.releaseYearFrom ===
      null
        ? ""
        : String(
            filters.releaseYearFrom,
          ),

    releaseYearTo:
      filters.releaseYearTo ===
      null
        ? ""
        : String(
            filters.releaseYearTo,
          ),

    popularityMin:
      filters.popularityMin ===
      null
        ? ""
        : String(
            filters.popularityMin,
          ),

    popularityMax:
      filters.popularityMax ===
      null
        ? ""
        : String(
            filters.popularityMax,
          ),

    bpmMin:
      filters.bpmMin ===
      null
        ? ""
        : String(
            filters.bpmMin,
          ),

    bpmMax:
      filters.bpmMax ===
      null
        ? ""
        : String(
            filters.bpmMax,
          ),

    energyMin:
      filters.energyMin ===
      null
        ? ""
        : String(
            filters.energyMin,
          ),

    energyMax:
      filters.energyMax ===
      null
        ? ""
        : String(
            filters.energyMax,
          ),
  };
}

function digitsOnly(
  value: string,
): string {
  return value.replace(
    /[^\d]/g,
    "",
  );
}

function decimalOnly(
  value: string,
): string {
  const cleaned =
    value.replace(
      /[^\d.]/g,
      "",
    );

  const firstDot =
    cleaned.indexOf(".");

  if (
    firstDot === -1
  ) {
    return cleaned;
  }

  return (
    cleaned.slice(
      0,
      firstDot + 1,
    ) +
    cleaned
      .slice(
        firstDot + 1,
      )
      .replace(
        /\./g,
        "",
      )
  );
}

function toNumberOrNull(
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

function clamp(
  value: number | null,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) {
    return null;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

export default function SmartFiltersPanel({
  tracks,
  filters,
  onChange,
}: Props) {
  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  const [
    drafts,
    setDrafts,
  ] =
    useState<NumericDrafts>(
      () =>
        filterToDrafts(
          filters,
        ),
    );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDrafts(
      filterToDrafts(
        filters,
      ),
    );
  }, [
    filters,
    isOpen,
  ]);

  const keys =
    useMemo(
      () =>
        Array.from(
          new Set(
            tracks
              .map(
                (track) =>
                  track
                    .musicalKey
                    ?.trim(),
              )
              .filter(
                (
                  value,
                ): value is string =>
                  Boolean(
                    value,
                  ),
              ),
          ),
        ).sort(
          (a, b) =>
            a.localeCompare(
              b,
            ),
        ),
      [tracks],
    );

  const activeCount =
    countActiveSmartFilters(
      filters,
    );

  function patch(
    next:
      Partial<SmartTrackFilters>,
  ) {
    onChange({
      ...filters,
      ...next,
    });
  }

  function updateDraft(
    field:
      keyof NumericDrafts,
    value: string,
    mode:
      | "integer"
      | "decimal" =
      "integer",
  ) {
    const cleaned =
      mode === "decimal"
        ? decimalOnly(
            value,
          )
        : digitsOnly(
            value,
          );

    setDrafts(
      (current) => ({
        ...current,
        [field]:
          cleaned,
      }),
    );
  }

  function commitDraft(
    field:
      keyof NumericDrafts,
  ) {
    const raw =
      drafts[field];

    if (
      field ===
        "releaseYearFrom" ||
      field ===
        "releaseYearTo"
    ) {
      const parsed =
        clamp(
          toNumberOrNull(
            raw,
          ),
          1900,
          2100,
        );

      patch({
        [field]:
          parsed === null
            ? null
            : Math.round(
                parsed,
              ),
      });

      return;
    }

    if (
      field ===
        "popularityMin" ||
      field ===
        "popularityMax"
    ) {
      patch({
        [field]:
          clamp(
            toNumberOrNull(
              raw,
            ),
            0,
            100,
          ),
      });

      return;
    }

    if (
      field ===
        "energyMin" ||
      field ===
        "energyMax"
    ) {
      patch({
        [field]:
          clamp(
            toNumberOrNull(
              raw,
            ),
            0,
            10,
          ),
      });

      return;
    }

    patch({
      [field]:
        toNumberOrNull(
          raw,
        ),
    });
  }

  function toggleKey(
    key: string,
  ) {
    const exists =
      filters
        .musicalKeys
        .includes(
          key,
        );

    patch({
      musicalKeys:
        exists
          ? filters
              .musicalKeys
              .filter(
                (item) =>
                  item !==
                  key,
              )
          : [
              ...filters
                .musicalKeys,
              key,
            ],
    });
  }

  function applyPreset(
    preset:
      | "new"
      | "popular"
      | "peak"
      | "chill",
  ) {
    if (
      preset === "new"
    ) {
      const currentYear =
        new Date()
          .getFullYear();

      const next = {
        releaseYearFrom:
          currentYear - 1,

        releaseYearTo:
          currentYear,
      };

      patch(next);

      setDrafts(
        (current) => ({
          ...current,

          releaseYearFrom:
            String(
              next
                .releaseYearFrom,
            ),

          releaseYearTo:
            String(
              next
                .releaseYearTo,
            ),
        }),
      );

      return;
    }

    if (
      preset === "popular"
    ) {
      patch({
        popularityMin:
          80,

        popularityMax:
          100,
      });

      setDrafts(
        (current) => ({
          ...current,

          popularityMin:
            "80",

          popularityMax:
            "100",
        }),
      );

      return;
    }

    if (
      preset === "peak"
    ) {
      patch({
        energyMin:
          7,

        energyMax:
          10,
      });

      setDrafts(
        (current) => ({
          ...current,

          energyMin:
            "7",

          energyMax:
            "10",
        }),
      );

      return;
    }

    patch({
      energyMin:
        1,

      energyMax:
        5,
    });

    setDrafts(
      (current) => ({
        ...current,

        energyMin:
          "1",

        energyMax:
          "5",
      }),
    );
  }

  function resetFilters() {
    onChange({
      ...EMPTY_SMART_TRACK_FILTERS,
    });

    setDrafts(
      filterToDrafts({
        ...EMPTY_SMART_TRACK_FILTERS,
      }),
    );
  }

  function handleDone() {
    (
      Object.keys(
        drafts,
      ) as Array<
        keyof NumericDrafts
      >
    ).forEach(
      commitDraft,
    );

    setIsOpen(false);
  }

  return (
    <div className="smart-filters">
      <button
        className="smart-filters__trigger"
        type="button"
        onClick={() =>
          setIsOpen(
            (current) =>
              !current,
          )
        }
      >
        <SlidersHorizontal
          size={16}
        />

        SMART FILTERS

        {activeCount > 0 && (
          <span>
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="smart-filters__panel">
          <header>
            <div>
              <strong>
                Smart Filters
              </strong>

              <small>
                Objective metadata filters
              </small>
            </div>

            <button
              type="button"
              aria-label="Close smart filters"
              onClick={() =>
                setIsOpen(
                  false,
                )
              }
            >
              <X
                size={16}
              />
            </button>
          </header>

          <div className="smart-filters__presets">
            <button
              type="button"
              onClick={() =>
                applyPreset(
                  "new",
                )
              }
            >
              <CalendarDays
                size={13}
              />

              New releases
            </button>

            <button
              type="button"
              onClick={() =>
                applyPreset(
                  "popular",
                )
              }
            >
              <Sparkles
                size={13}
              />

              Most popular
            </button>

            <button
              type="button"
              onClick={() =>
                applyPreset(
                  "peak",
                )
              }
            >
              <Zap
                size={13}
              />

              Peak energy
            </button>

            <button
              type="button"
              onClick={() =>
                applyPreset(
                  "chill",
                )
              }
            >
              <Gauge
                size={13}
              />

              Chill energy
            </button>
          </div>

          <section>
            <label>
              <span>
                <CalendarDays
                  size={14}
                />

                Release Year
              </span>

              <div className="smart-filters__range">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="From year"
                  value={
                    drafts
                      .releaseYearFrom
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "releaseYearFrom",
                      event
                        .target
                        .value,
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "releaseYearFrom",
                    )
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      commitDraft(
                        "releaseYearFrom",
                      );
                    }
                  }}
                />

                <span>
                  to
                </span>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="To year"
                  value={
                    drafts
                      .releaseYearTo
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "releaseYearTo",
                      event
                        .target
                        .value,
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "releaseYearTo",
                    )
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      commitDraft(
                        "releaseYearTo",
                      );
                    }
                  }}
                />
              </div>
            </label>
          </section>

          <section>
            <label>
              <span>
                <Sparkles
                  size={14}
                />

                Popularity
              </span>

              <div className="smart-filters__range">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Min"
                  value={
                    drafts
                      .popularityMin
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "popularityMin",
                      event
                        .target
                        .value,
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "popularityMin",
                    )
                  }
                />

                <span>
                  to
                </span>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Max"
                  value={
                    drafts
                      .popularityMax
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "popularityMax",
                      event
                        .target
                        .value,
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "popularityMax",
                    )
                  }
                />
              </div>
            </label>
          </section>

          <section>
            <div className="smart-filters__label">
              <KeyRound
                size={14}
              />

              Musical Key
            </div>

            <div className="smart-filters__keys">
              {keys.map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      filters
                        .musicalKeys
                        .includes(
                          key,
                        )
                        ? "is-active"
                        : ""
                    }
                    onClick={() =>
                      toggleKey(
                        key,
                      )
                    }
                  >
                    {key}
                  </button>
                ),
              )}
            </div>
          </section>

          <section className="smart-filters__two-columns">
            <label>
              <span>
                <Gauge
                  size={14}
                />

                BPM
              </span>

              <div className="smart-filters__range">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Min"
                  value={
                    drafts
                      .bpmMin
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "bpmMin",
                      event
                        .target
                        .value,
                      "decimal",
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "bpmMin",
                    )
                  }
                />

                <span>
                  to
                </span>

                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Max"
                  value={
                    drafts
                      .bpmMax
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "bpmMax",
                      event
                        .target
                        .value,
                      "decimal",
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "bpmMax",
                    )
                  }
                />
              </div>
            </label>

            <label>
              <span>
                <Zap
                  size={14}
                />

                Energy
              </span>

              <div className="smart-filters__range">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Min"
                  value={
                    drafts
                      .energyMin
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "energyMin",
                      event
                        .target
                        .value,
                      "decimal",
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "energyMin",
                    )
                  }
                />

                <span>
                  to
                </span>

                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Max"
                  value={
                    drafts
                      .energyMax
                  }
                  onChange={(
                    event,
                  ) =>
                    updateDraft(
                      "energyMax",
                      event
                        .target
                        .value,
                      "decimal",
                    )
                  }
                  onBlur={() =>
                    commitDraft(
                      "energyMax",
                    )
                  }
                />
              </div>
            </label>
          </section>

          <footer>
            <button
              type="button"
              onClick={
                resetFilters
              }
            >
              Reset
            </button>

            <button
              type="button"
              onClick={
                handleDone
              }
            >
              Done
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
