import {
  Plus,
  Search,
  Tags,
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

import type { Playlist } from "../../types/playlist";

import "./PlaylistKeywordsModal.css";

type Props = {
  isOpen: boolean;
  playlist: Playlist | null;
  allPlaylists: Playlist[];
  onClose: () => void;
  onSave: (
    playlistId: string,
    keywords: string[],
  ) => void;
};

export default function PlaylistKeywordsModal({
  isOpen,
  playlist,
  allPlaylists,
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
    if (!isOpen || !playlist) {
      return;
    }

    setKeywords([
      ...(playlist.keywords ?? []),
    ]);

    setCustomKeyword("");
    setSearch("");
  }, [
    isOpen,
    playlist,
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

      allPlaylists.forEach(
        (item) =>
          (item.keywords ?? [])
            .forEach(
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
      allPlaylists,
      keywords,
      search,
    ]);

  if (!isOpen || !playlist) {
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
      className="playlist-keywords-backdrop"
      onMouseDown={onClose}
    >
      <section
        className="playlist-keywords-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="playlist-keywords-header">
          <div>
            <span>
              PLAYLIST KEYWORDS
            </span>

            <h2>
              {playlist.name}
            </h2>

            <p>
              Suggested tags + your own custom keywords.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="playlist-keywords-selected">
          <strong>
            Selected
          </strong>

          <div className="playlist-keywords-chips">
            {keywords.length ===
            0 ? (
              <span className="playlist-keywords-empty">
                No keywords yet.
              </span>
            ) : (
              keywords.map(
                (keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() =>
                      removeKeyword(
                        keyword,
                      )
                    }
                  >
                    <Tags size={12} />
                    {keyword}
                    <X size={11} />
                  </button>
                ),
              )
            )}
          </div>
        </div>

        <div className="playlist-keywords-groups">
          {KEYWORD_GROUPS.map(
            (group) => (
              <div
                key={group.id}
                className="playlist-keywords-group"
              >
                <div>
                  <strong>
                    {group.label}
                  </strong>

                  <span>
                    {group.description}
                  </span>
                </div>

                <div className="playlist-keywords-options">
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
                              ? "playlist-keyword-option playlist-keyword-option--selected"
                              : "playlist-keyword-option"
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

        <div className="playlist-keywords-custom">
          <label>
            Custom keyword

            <div>
              <input
                value={customKeyword}
                placeholder="e.g. mamacitas, sunset terrace..."
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
          </label>
        </div>

        <div className="playlist-keywords-library">
          <div className="playlist-keywords-library-header">
            <div>
              <strong>
                Existing playlist keywords
              </strong>

              <span>
                Reuse tags from your library.
              </span>
            </div>

            <div className="playlist-keywords-search">
              <Search size={14} />

              <input
                value={search}
                placeholder="Search..."
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
              />
            </div>
          </div>

          <div className="playlist-keywords-library-list">
            {libraryKeywords
              .slice(0, 24)
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
                    {item.label}
                    <small>
                      {item.count}
                    </small>
                  </button>
                ),
              )}

            {libraryKeywords.length ===
              0 && (
              <span className="playlist-keywords-empty">
                No additional library keywords.
              </span>
            )}
          </div>
        </div>

        <footer className="playlist-keywords-footer">
          <button
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="playlist-keywords-save"
            onClick={() =>
              onSave(
                playlist.id,
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
