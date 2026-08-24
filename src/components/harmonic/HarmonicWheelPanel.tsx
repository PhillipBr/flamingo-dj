import {
  ChevronDown,
  Filter,
  Music2,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import camelotWheelUrl from "../../assets/dj/camelot-wheel.png";

import {
  DISPLAY_KEYS,
  compatibleKeyLabels,
  keyToCamelot,
  normalizeHarmonicKey,
} from "./harmonicUtils";

import "./HarmonicWheelPanel.css";

const REFERENCE_STORAGE_KEY =
  "flamingo-dj-harmonic-reference-v1";

const FILTER_STORAGE_KEY =
  "flamingo-dj-harmonic-filter-v1";

const ALL_KEYS_VALUE =
  "__ALL_KEYS__";

type HarmonicReference = {
  key: string;
  title?: string;
  artist?: string;
};

function readStoredReference(): HarmonicReference {
  try {
    const raw =
      window.localStorage.getItem(
        REFERENCE_STORAGE_KEY,
      );

    if (!raw) {
      return {
        key: "C#m",
      };
    }

    const parsed =
      JSON.parse(raw) as HarmonicReference;

    return {
      key:
        parsed.key ||
        "C#m",

      title:
        parsed.title,

      artist:
        parsed.artist,
    };
  } catch {
    return {
      key: "C#m",
    };
  }
}

function readStoredFilter():
  | string
  | null {
  try {
    const stored =
      window.localStorage.getItem(
        FILTER_STORAGE_KEY,
      );

    return (
      normalizeHarmonicKey(
        stored,
      )
    );
  } catch {
    return null;
  }
}

function dispatchHarmonicFilter(
  key: string | null,
) {
  window.dispatchEvent(
    new CustomEvent(
      "flamingo-dj-harmonic-filter",
      {
        detail: {
          key,
        },
      },
    ),
  );
}

type HarmonicWheelPanelProps = {
  variant?: "desktop" | "mobile-nav";
};

export default function HarmonicWheelPanel({
  variant = "desktop",
}: HarmonicWheelPanelProps) {
  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  const [
    reference,
    setReference,
  ] = useState<HarmonicReference>(
    readStoredReference,
  );

  const [
    filterKey,
    setFilterKey,
  ] = useState<string | null>(
    readStoredFilter,
  );

  useEffect(() => {
    function handleHarmonicReference(
      event: Event,
    ) {
      const customEvent =
        event as CustomEvent<HarmonicReference>;

      if (
        !customEvent.detail?.key
      ) {
        return;
      }

      const normalized =
        normalizeHarmonicKey(
          customEvent.detail.key,
        );

      if (!normalized) {
        return;
      }

      const next = {
        key: normalized,

        title:
          customEvent.detail.title,

        artist:
          customEvent.detail.artist,
      };

      setReference(next);

      try {
        window.localStorage.setItem(
          REFERENCE_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // Ignore localStorage errors.
      }
    }

    window.addEventListener(
      "flamingo-dj-harmonic-key",
      handleHarmonicReference,
    );

    return () => {
      window.removeEventListener(
        "flamingo-dj-harmonic-key",
        handleHarmonicReference,
      );
    };
  }, []);

  useEffect(() => {
    /*
     * Re-apply a persisted filter when the component mounts.
     * This keeps the table and sidebar synchronized after refresh.
     */
    dispatchHarmonicFilter(
      filterKey,
    );
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setIsOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [isOpen]);

  const camelot =
    useMemo(
      () =>
        keyToCamelot(
          reference.key,
        ),
      [reference.key],
    );

  const compatible =
    useMemo(
      () =>
        compatibleKeyLabels(
          camelot,
        ),
      [camelot],
    );

  function saveReference(
    nextKey: string,
  ) {
    const normalized =
      normalizeHarmonicKey(
        nextKey,
      );

    if (!normalized) {
      return;
    }

    const next: HarmonicReference = {
      key: normalized,
    };

    setReference(next);

    try {
      window.localStorage.setItem(
        REFERENCE_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // Ignore localStorage errors.
    }
  }

  function applyFilter(
    nextKey: string | null,
  ) {
    const normalized =
      normalizeHarmonicKey(
        nextKey,
      );

    setFilterKey(
      normalized,
    );

    try {
      if (normalized) {
        window.localStorage.setItem(
          FILTER_STORAGE_KEY,
          normalized,
        );
      } else {
        window.localStorage.removeItem(
          FILTER_STORAGE_KEY,
        );
      }
    } catch {
      // Ignore localStorage errors.
    }

    dispatchHarmonicFilter(
      normalized,
    );
  }

  function handleFilterSelection(
    value: string,
  ) {
    if (
      value ===
      ALL_KEYS_VALUE
    ) {
      applyFilter(null);
      return;
    }

    saveReference(value);
    applyFilter(value);
  }

  function handleCompatibleKey(
    nextKey: string,
  ) {
    saveReference(
      nextKey,
    );

    /*
     * Compatible chips are also direct filters.
     * This makes harmonic exploration immediate.
     */
    applyFilter(
      nextKey,
    );
  }

  return (
    <section
      className={[
        "harmonic-wheel",
        variant === "mobile-nav"
          ? "harmonic-wheel--mobile-nav"
          : "harmonic-wheel--desktop",
      ].join(" ")}
      aria-label="Harmonic wheel"
    >
      {variant === "mobile-nav" ? (
        <button
          className="sidebar__link sidebar__harmonic-mobile-link"
          type="button"
          aria-expanded={
            isOpen
          }
          aria-label="Open harmonic mixing"
          onClick={() =>
            setIsOpen(true)
          }
        >
          <img
            className="sidebar__harmonic-mobile-icon"
            src={
              camelotWheelUrl
            }
            alt=""
          />

          <span>
            Harmonic
          </span>
        </button>
      ) : (
        <button
          className="harmonic-wheel__toggle"
          type="button"
          aria-expanded={
            isOpen
          }
          onClick={() =>
            setIsOpen(true)
          }
        >
          <span className="harmonic-wheel__toggle-icon">
            <img
              src={
                camelotWheelUrl
              }
              alt=""
            />
          </span>

          <span className="harmonic-wheel__toggle-copy">
            <strong>
              Harmonic
            </strong>

            <span>
              {filterKey
                ? `Filter: ${filterKey} · ${keyToCamelot(filterKey) ?? "—"}`
                : `All keys · Ref ${reference.key}`}
            </span>
          </span>

          <ChevronDown
            size={15}
            aria-hidden="true"
          />
        </button>
      )}

      {isOpen && (
        <div
          className="harmonic-wheel__overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setIsOpen(false);
            }
          }}
        >
          <div
            className="harmonic-wheel__modal"
            role="dialog"
            aria-modal="true"
            aria-label="Harmonic mixing wheel"
          >
            <div className="harmonic-wheel__modal-header">
              <div className="harmonic-wheel__modal-copy">
                <span className="harmonic-wheel__eyebrow">
                  HARMONIC MIXING
                </span>

                <strong>
                  {reference.title ||
                    "Choose a reference key"}
                </strong>

                {reference.artist && (
                  <span className="harmonic-wheel__artist">
                    {reference.artist}
                  </span>
                )}
              </div>

              <button
                className="harmonic-wheel__close"
                type="button"
                aria-label="Close harmonic wheel"
                onClick={() =>
                  setIsOpen(
                    false,
                  )
                }
              >
                <X
                  size={19}
                />
              </button>
            </div>

            <div className="harmonic-wheel__workspace">
              <div className="harmonic-wheel__visual-column">
                <div className="harmonic-wheel__visual">
                  <img
                    src={
                      camelotWheelUrl
                    }
                    alt="Flamingo harmonic key wheel"
                  />

                  <div className="harmonic-wheel__current">
                    <span>
                      {reference.key}
                    </span>

                    <strong>
                      {camelot || "—"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="harmonic-wheel__controls">
                <div className="harmonic-wheel__reference-card">
                  <span>
                    CURRENT REFERENCE
                  </span>

                  <strong>
                    {reference.key}
                  </strong>

                  <b>
                    {camelot || "—"}
                  </b>
                </div>

                <label className="harmonic-wheel__selector">
                  <span>
                    <Filter
                      size={12}
                      aria-hidden="true"
                    />
                    Key filter
                  </span>

                  <select
                    value={
                      filterKey ??
                      ALL_KEYS_VALUE
                    }
                    onChange={(
                      event,
                    ) =>
                      handleFilterSelection(
                        event.target
                          .value,
                      )
                    }
                  >
                    <option
                      value={
                        ALL_KEYS_VALUE
                      }
                    >
                      All keys
                    </option>

                    {DISPLAY_KEYS.map(
                      (key) => (
                        <option
                          key={key}
                          value={key}
                        >
                          {key} ·{" "}
                          {keyToCamelot(
                            key,
                          ) ?? "—"}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div
                  className={[
                    "harmonic-wheel__filter-status",
                    filterKey
                      ? "harmonic-wheel__filter-status--active"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Filter
                    size={14}
                  />

                  {filterKey ? (
                    <span>
                      Table filtered by{" "}
                      <strong>
                        {filterKey}
                      </strong>{" "}
                      ({keyToCamelot(filterKey) ?? "—"})
                    </span>
                  ) : (
                    <span>
                      Showing{" "}
                      <strong>
                        All keys
                      </strong>
                    </span>
                  )}
                </div>

                <div className="harmonic-wheel__compatible">
                  <div className="harmonic-wheel__compatible-title">
                    <Music2
                      size={15}
                    />

                    <span>
                      Compatible keys
                    </span>
                  </div>

                  <div className="harmonic-wheel__chips">
                    {compatible.map(
                      (item) => (
                        <button
                          key={
                            item.camelot
                          }
                          type="button"
                          className={
                            filterKey ===
                            item.key
                              ? "harmonic-wheel__chip harmonic-wheel__chip--current"
                              : "harmonic-wheel__chip"
                          }
                          onClick={() =>
                            handleCompatibleKey(
                              item.key,
                            )
                          }
                        >
                          <strong>
                            {item.key}
                          </strong>

                          <span>
                            {item.camelot}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="harmonic-wheel__guide">
                  <strong>
                    Mixing guide
                  </strong>

                  <p>
                    Select a key to filter the table immediately.
                    Use All keys to restore the complete list.
                    The compatible buttons let you jump between harmonic options.
                  </p>
                </div>

                <p className="harmonic-wheel__hint">
                  Selecting one track updates the harmonic reference without forcing a filter change.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
