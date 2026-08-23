import {
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  dedupeKeywords,
  KEYWORD_GROUPS,
  normalizeKeyword,
} from "../../config/keywordGroups";

import type { Track } from "../../types/track";

import "./TrackKeywordsModal.css";

type Props = {
  isOpen: boolean;
  track: Track;
  libraryTracks: Track[];
  onClose: () => void;
  onSave: (
    keywords: string[],
  ) => void;
};

export default function TrackKeywordsModal({
  isOpen,
  track,
  libraryTracks,
  onClose,
  onSave,
}: Props) {
  const [
    keywords,
    setKeywords,
  ] = useState<string[]>([]);

  const [
    customKeyword,
    setCustomKeyword,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setKeywords([
      ...track.keywords,
    ]);

    setCustomKeyword("");
    setSearch("");
  }, [
    isOpen,
    track.id,
    track.keywords,
  ]);

  const libraryKeywords =
    useMemo(() => {
      const counts =
        new Map<
          string,
          {
            label: string;
            count: number;
          }
        >();

      libraryTracks.forEach(
        (item) =>
          item.keywords.forEach(
            (keyword) => {
              const key =
                normalizeKeyword(
                  keyword,
                );

              if (!key) {
                return;
              }

              const current =
                counts.get(key);

              counts.set(
                key,
                {
                  label:
                    current?.label ??
                    keyword,

                  count:
                    (current?.count ??
                      0) + 1,
                },
              );
            },
          ),
      );

      const selected =
        new Set(
          keywords.map(
            normalizeKeyword,
          ),
        );

      const query =
        normalizeKeyword(search);

      return Array.from(
        counts.values(),
      )
        .filter(
          (item) =>
            !selected.has(
              normalizeKeyword(
                item.label,
              ),
            ),
        )
        .filter(
          (item) =>
            !query ||
            normalizeKeyword(
              item.label,
            ).includes(query),
        )
        .sort(
          (a, b) =>
            b.count -
              a.count ||
            a.label.localeCompare(
              b.label,
            ),
        );
    }, [
      keywords,
      libraryTracks,
      search,
    ]);

  if (!isOpen) {
    return null;
  }

  function addKeyword(
    value: string,
  ) {
    if (!value.trim()) {
      return;
    }

    setKeywords(
      (current) =>
        dedupeKeywords([
          ...current,
          value,
        ]),
    );

    setCustomKeyword("");
  }

  function removeKeyword(
    value: string,
  ) {
    const normalized =
      normalizeKeyword(value);

    setKeywords(
      (current) =>
        current.filter(
          (keyword) =>
            normalizeKeyword(
              keyword,
            ) !==
            normalized,
        ),
    );
  }

  return (
    <div
      className="track-keywords-backdrop"
      onMouseDown={onClose}
    >
      <section
        className="track-keywords-modal track-keywords-modal--wide"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="track-keywords-header">
          <div>
            <span>
              TRACK KEYWORDS
            </span>
            <h2>{track.title}</h2>
            <p>{track.artist}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="track-keywords-current">
          <strong>
            Selected
          </strong>

          <div className="track-keywords-chips">
            {keywords.length ===
            0 ? (
              <span className="track-keywords-empty">
                No keywords yet.
              </span>
            ) : (
              keywords.map(
                (keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    className="track-keyword-chip"
                    onClick={() =>
                      removeKeyword(
                        keyword,
                      )
                    }
                  >
                    <Tag size={12} />
                    {keyword}
                    <X size={11} />
                  </button>
                ),
              )
            )}
          </div>
        </div>

        <div className="track-keywords-groups">
          {KEYWORD_GROUPS.map(
            (group) => (
              <div
                key={group.id}
                className="track-keywords-group"
              >
                <div>
                  <strong>
                    {group.label}
                  </strong>
                  <span>
                    {group.description}
                  </span>
                </div>

                <div className="track-keywords-group-options">
                  {group.keywords.map(
                    (keyword) => {
                      const selected =
                        keywords.some(
                          (current) =>
                            normalizeKeyword(
                              current,
                            ) ===
                            normalizeKeyword(
                              keyword,
                            ),
                        );

                      return (
                        <button
                          key={keyword}
                          type="button"
                          className={
                            selected
                              ? "track-keyword-option track-keyword-option--selected"
                              : "track-keyword-option"
                          }
                          onClick={() =>
                            selected
                              ? removeKeyword(
                                  keyword,
                                )
                              : addKeyword(
                                  keyword,
                                )
                          }
                        >
                          {keyword}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="track-keywords-add">
          <input
            value={customKeyword}
            placeholder="Custom keyword..."
            onChange={(event) =>
              setCustomKeyword(
                event.target.value,
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                "Enter"
              ) {
                addKeyword(
                  customKeyword,
                );
              }
            }}
          />

          <button
            type="button"
            disabled={
              !customKeyword.trim()
            }
            onClick={() =>
              addKeyword(
                customKeyword,
              )
            }
          >
            <Plus size={15} />
            Add
          </button>
        </div>

        <div className="track-keywords-separator" />

        <div className="track-keywords-suggested-header">
          <div>
            <strong>
              Existing library keywords
            </strong>
            <span>
              Reuse tags already assigned to tracks.
            </span>
          </div>

          <div className="track-keywords-search">
            <Search size={14} />
            <input
              value={search}
              placeholder="Find keyword..."
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
            />
          </div>
        </div>

        <div className="track-keywords-suggestions">
          {libraryKeywords
            .slice(0, 30)
            .map(
              (item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() =>
                    addKeyword(
                      item.label,
                    )
                  }
                >
                  <Plus size={12} />
                  <span>
                    {item.label}
                  </span>
                  <small>
                    {item.count}
                  </small>
                </button>
              ),
            )}
        </div>

        <footer className="track-keywords-footer">
          <button
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="track-keywords-save"
            onClick={() =>
              onSave(
                dedupeKeywords(
                  keywords,
                ),
              )
            }
          >
            Save keywords
          </button>
        </footer>
      </section>
    </div>
  );
}
