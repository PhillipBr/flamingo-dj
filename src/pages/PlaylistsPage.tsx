import {
  Clock3,
  ListMusic,
  Plus,
  Search,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import PlaylistActionsMenu from "../components/playlists/PlaylistActionsMenu";
import PlaylistFormModal from "../components/playlists/PlaylistFormModal";
import PlaylistKeywordsModal from "../components/playlists/PlaylistKeywordsModal";

import type {
  Playlist,
  PlaylistFormValues,
} from "../types/playlist";

import {
  createPlaylistId,
  loadPlaylists,
  savePlaylists,
} from "../utils/playlistStorage";

export default function PlaylistsPage() {
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
    isFormOpen,
    setIsFormOpen,
  ] = useState(false);

  const [
    editingPlaylist,
    setEditingPlaylist,
  ] = useState<Playlist | null>(
    null,
  );

  const [
    keywordPlaylist,
    setKeywordPlaylist,
  ] = useState<Playlist | null>(
    null,
  );

  useEffect(() => {
    savePlaylists(
      playlists,
    );
  }, [playlists]);

  const visiblePlaylists =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      if (!normalizedSearch) {
        return playlists;
      }

      return playlists.filter(
        (playlist) =>
          playlist.name
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          playlist.description
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          playlist.category
            .toLowerCase()
            .includes(
              normalizedSearch,
            ) ||
          (playlist.keywords ?? [])
            .some(
              (keyword) =>
                keyword
                  .toLowerCase()
                  .includes(
                    normalizedSearch,
                  ),
            ),
      );
    }, [
      playlists,
      searchTerm,
    ]);

  function openCreateForm() {
    setEditingPlaylist(
      null,
    );

    setIsFormOpen(
      true,
    );
  }

  function openEditForm(
    playlist: Playlist,
  ) {
    setEditingPlaylist(
      playlist,
    );

    setIsFormOpen(
      true,
    );
  }

  function closeForm() {
    setIsFormOpen(
      false,
    );

    setEditingPlaylist(
      null,
    );
  }

  function handleSubmitPlaylist(
    values: PlaylistFormValues,
  ) {
    if (editingPlaylist) {
      setPlaylists(
        (currentPlaylists) =>
          currentPlaylists.map(
            (playlist) =>
              playlist.id ===
              editingPlaylist.id
                ? {
                    ...playlist,
                    ...values,

                    updatedAt:
                      new Date()
                        .toISOString(),
                  }
                : playlist,
          ),
      );

      closeForm();
      return;
    }

    setPlaylists(
      (currentPlaylists) => {
        const newPlaylist:
          Playlist = {
          id:
            createPlaylistId(
              values.name,
            ),

          name:
            values.name,

          description:
            values.description,

          category:
            values.category,

          trackIds: [],

          keywords: [],

          updatedAt:
            new Date()
              .toISOString(),
        };

        return [
          newPlaylist,
          ...currentPlaylists,
        ];
      },
    );

    closeForm();
  }

  function openKeywords(
    playlist: Playlist,
  ) {
    setKeywordPlaylist(
      playlist,
    );
  }

  function closeKeywords() {
    setKeywordPlaylist(
      null,
    );
  }

  function handleSavePlaylistKeywords(
    playlistId: string,
    keywords: string[],
  ) {
    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.map(
          (playlist) =>
            playlist.id ===
            playlistId
              ? {
                  ...playlist,
                  keywords: [
                    ...keywords,
                  ],
                  updatedAt:
                    new Date()
                      .toISOString(),
                }
              : playlist,
        ),
    );

    closeKeywords();
  }

  function handleDuplicatePlaylist(
    playlist: Playlist,
  ) {
    setPlaylists(
      (currentPlaylists) => {
        const duplicatedName =
          `${playlist.name} Copy`;

        const duplicatedPlaylist:
          Playlist = {
          ...playlist,

          id:
            createPlaylistId(
              duplicatedName,
            ),

          name:
            duplicatedName,

          trackIds: [
            ...playlist.trackIds,
          ],

          updatedAt:
            new Date()
              .toISOString(),
        };

        const sourceIndex =
          currentPlaylists
            .findIndex(
              (
                currentPlaylist,
              ) =>
                currentPlaylist.id ===
                playlist.id,
            );

        if (sourceIndex === -1) {
          return [
            duplicatedPlaylist,
            ...currentPlaylists,
          ];
        }

        const updatedPlaylists = [
          ...currentPlaylists,
        ];

        updatedPlaylists.splice(
          sourceIndex + 1,
          0,
          duplicatedPlaylist,
        );

        return updatedPlaylists;
      },
    );
  }

  function handleDeletePlaylist(
    playlist: Playlist,
  ) {
    const shouldDelete =
      window.confirm(
        `Delete "${playlist.name}"?\n\nThis removes the playlist from the library. The original tracks will not be deleted.`,
      );

    if (!shouldDelete) {
      return;
    }

    setPlaylists(
      (currentPlaylists) =>
        currentPlaylists.filter(
          (
            currentPlaylist,
          ) =>
            currentPlaylist.id !==
            playlist.id,
        ),
    );
  }

  return (
    <>
      <section className="page playlists-page">
        <header className="page-header playlists-page__header">
          <div>
            <p className="page-eyebrow">
              DJ library
            </p>

            <h1>
              Playlists
            </h1>

            <p className="page-description">
              Organize your music and
              prepare collections for
              your DJ sets.
            </p>
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={
              openCreateForm
            }
          >
            <Plus size={17} />

            New playlist
          </button>
        </header>

        <div className="playlists-toolbar">
          <div className="playlists-search">
            <Search size={17} />

            <input
              type="search"
              placeholder="Search playlists..."
              aria-label="Search playlists"
              value={
                searchTerm
              }
              onChange={(
                event,
              ) =>
                setSearchTerm(
                  event.target.value,
                )
              }
            />
          </div>

          <span className="playlists-count">
            {
              visiblePlaylists.length
            }{" "}
            {
              visiblePlaylists.length ===
              1
                ? "playlist"
                : "playlists"
            }
          </span>
        </div>

        <div className="playlists-list">
          <div className="playlists-list__header">
            <span>
              Name
            </span>

            <span>
              Category
            </span>

            <span>
              Tracks
            </span>

            <span>
              Updated
            </span>

            <span
              aria-hidden="true"
            />
          </div>

          {
            visiblePlaylists.length >
            0 ? (
              visiblePlaylists.map(
                (playlist) => (
                  <div
                    className="playlist-row"
                    key={
                      playlist.id
                    }
                  >
                    <Link
                      className="playlist-row__link"
                      to={`/playlists/${playlist.id}`}
                    >
                      <div className="playlist-row__main">
                        <div className="playlist-row__icon">
                          <ListMusic
                            size={20}
                          />
                        </div>

                        <div className="playlist-row__text">
                          <strong>
                            {
                              playlist.name
                            }
                          </strong>

                          <p>
                            {
                              playlist.description ||
                              "No description"
                            }
                          </p>
                        </div>
                      </div>

                      <span className="playlist-row__category">
                        {
                          playlist.category
                        }
                      </span>

                      <span className="playlist-row__tracks">
                        {
                          playlist
                            .trackIds
                            .length
                        }
                      </span>

                      <span className="playlist-row__updated">
                        <Clock3
                          size={14}
                        />

                        {
                          playlist.updatedAt
                        }
                      </span>
                    </Link>

                    <PlaylistActionsMenu
                      onEdit={() =>
                        openEditForm(
                          playlist,
                        )
                      }
                      onEditKeywords={() =>
                        openKeywords(
                          playlist,
                        )
                      }
                      onDuplicate={() =>
                        handleDuplicatePlaylist(
                          playlist,
                        )
                      }
                      onDelete={() =>
                        handleDeletePlaylist(
                          playlist,
                        )
                      }
                    />
                  </div>
                ),
              )
            ) : (
              <div className="playlists-empty">
                <div className="playlists-empty__icon">
                  <ListMusic
                    size={25}
                  />
                </div>

                <h2>
                  No playlists found
                </h2>

                <p>
                  {
                    searchTerm.trim()
                      ? "Try another search term."
                      : "Create your first playlist to start organizing tracks."
                  }
                </p>

                {
                  !searchTerm.trim() && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={
                        openCreateForm
                      }
                    >
                      <Plus
                        size={17}
                      />

                      New playlist
                    </button>
                  )
                }
              </div>
            )
          }
        </div>
      </section>

      <PlaylistFormModal
        isOpen={
          isFormOpen
        }
        playlist={
          editingPlaylist
        }
        onClose={
          closeForm
        }
        onSubmit={
          handleSubmitPlaylist
        }
      />

      <PlaylistKeywordsModal
        isOpen={
          keywordPlaylist !==
          null
        }
        playlist={
          keywordPlaylist
        }
        allPlaylists={
          playlists
        }
        onClose={
          closeKeywords
        }
        onSave={
          handleSavePlaylistKeywords
        }
      />
    </>
  );
}