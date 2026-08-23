import {
  ExternalLink,
  Save,
  UserRound,
  X,
} from "lucide-react";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type {
  Track,
} from "../../types/track";

import {
  getCamelotKey,
} from "../../utils/camelot";

import {
  formatDate,
  formatDuration,
  formatFollowers,
  formatOverallVolume,
} from "../../utils/trackFormatters";

import {
  syncTrackEdit,
} from "../../utils/trackEditSync";

import SupabaseSyncAccount from "../sync/SupabaseSyncAccount";
import TrackEditConfirmationModal, { type TrackEditDiff } from "../sync/TrackEditConfirmationModal";
import { buildTrackEditDiffs } from "../../utils/trackEditDiff";

type EditableTrackFields = {
  title: string;
  artist: string;
  releaseDate: string;
  genre: string;
  spotifyPopularity: string;

  tempo: string;
  musicalKey: string;
  energy: string;

  overallVolume: string;
  rating: string;
  keywords: string;
  comments: string;
  cuePoints: string;
  folder: string;
};

type TrackDetailsPanelProps = {
  track: Track | null;

  onClose: () => void;

  onSave: (
    trackId: string,
    changes: Partial<Track>,
  ) => void;
};

function createFormState(
  track: Track,
): EditableTrackFields {
  return {
    title:
      track.title,

    artist:
      track.artist,

    releaseDate:
      track.releaseDate ?? "",

    genre:
      track.genre ?? "",

    spotifyPopularity:
      track.spotifyPopularity
        ?.toString() ?? "",

    tempo:
      track.tempo
        ?.toString() ?? "",

    musicalKey:
      track.musicalKey ?? "",

    energy:
      track.energy
        ?.toString() ?? "",

    overallVolume:
      track.overallVolume
        ?.toString() ?? "",

    rating:
      track.rating
        ?.toString() ?? "",

    keywords:
      track.keywords
        .join(", "),

    comments:
      track.comments ?? "",

    cuePoints:
      track.cuePoints ?? "",

    folder:
      track.folder ?? "",
  };
}

function parseOptionalNumber(
  value: string,
): number | null {
  const cleaned =
    value.trim();

  if (!cleaned) {
    return null;
  }

  const parsed =
    Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function parseKeywords(
  value: string,
): string[] {
  const seen =
    new Set<string>();

  const output:
    string[] = [];

  value
    .split(/[,;|]/)
    .map(
      (keyword) =>
        keyword.trim(),
    )
    .filter(Boolean)
    .forEach(
      (keyword) => {
        const key =
          keyword.toLowerCase();

        if (
          seen.has(key)
        ) {
          return;
        }

        seen.add(key);
        output.push(keyword);
      },
    );

  return output;
}

export default function TrackDetailsPanel({
  track,
  onClose,
  onSave,
}: TrackDetailsPanelProps) {
  const [
    formState,
    setFormState,
  ] =
    useState<EditableTrackFields | null>(
      track
        ? createFormState(track)
        : null,
    );

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    saveMessage,
    setSaveMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [lastDiffs,setLastDiffs]=useState<TrackEditDiff[]>([]);
  const [confirmationOpen,setConfirmationOpen]=useState(false);
  const [confirmationLocalJson,setConfirmationLocalJson]=useState(false);
  const [confirmationSupabase,setConfirmationSupabase]=useState(false);

  useEffect(() => {
    setFormState(
      track
        ? createFormState(track)
        : null,
    );

    setSaveMessage(null);
  }, [
    track,
  ]);

  function updateField(
    field:
      keyof EditableTrackFields,
    value: string,
  ) {
    setFormState(
      (current) =>
        current
          ? {
              ...current,
              [field]:
                value,
            }
          : current,
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !track ||
      !formState ||
      isSaving
    ) {
      return;
    }

    const changes:
      Partial<Track> = {
      title:
        formState.title
          .trim() ||
        track.title,

      artist:
        formState.artist
          .trim() ||
        track.artist,

      releaseDate:
        formState.releaseDate
          .trim() ||
        null,

      genre:
        formState.genre
          .trim() ||
        null,

      spotifyPopularity:
        parseOptionalNumber(
          formState
            .spotifyPopularity,
        ),

      tempo:
        parseOptionalNumber(
          formState.tempo,
        ),

      musicalKey:
        formState.musicalKey
          .trim() ||
        null,

      energy:
        parseOptionalNumber(
          formState.energy,
        ),

      overallVolume:
        parseOptionalNumber(
          formState
            .overallVolume,
        ),

      rating:
        parseOptionalNumber(
          formState.rating,
        ),

      keywords:
        parseKeywords(
          formState.keywords,
        ),

      comments:
        formState.comments
          .trim() ||
        null,

      cuePoints:
        formState.cuePoints
          .trim() ||
        null,

      folder:
        formState.folder
          .trim() ||
        null,
    };

    const editDiffs = buildTrackEditDiffs(track, changes);
    if (editDiffs.length === 0) { setSaveMessage("No changes detected."); return; }

    setIsSaving(true);
    setSaveMessage(
      "Saving...",
    );

    /*
     * Immediate UI/localStorage update.
     */
    onSave(
      track.id,
      changes,
    );

    /*
     * Permanent sync:
     * - local JSON while using Vite
     * - Supabase pending edit queue
     */
    const result =
      await syncTrackEdit(
        track,
        changes,
      );

    setLastDiffs(editDiffs);
    setConfirmationLocalJson(result.localJsonSaved);
    setConfirmationSupabase(result.supabaseQueued);
    setConfirmationOpen(true);

    if (
      result.supabaseQueued
    ) {
      setSaveMessage(
        import.meta.env.DEV
          ? (
              result.localJsonSaved
                ? "Saved to JSON + queued for MASTER/DJ sync."
                : "Queued in Supabase. Local JSON write was unavailable."
            )
          : "Queued in Supabase for MASTER/DJ sync.",
      );
    } else {
      setSaveMessage(
        result.warnings
          .join(" ") ||
        "Saved locally, but database sync failed.",
      );
    }

    setIsSaving(false);
  }

  if (
    !track ||
    !formState
  ) {
    return null;
  }

  const artistDetails =
    track.artistDetails;

  return (
    <aside className="track-details-panel">
      <div className="track-details-panel__header">
        <div>
          <p className="page-eyebrow">
            Track details
          </p>

          <h2>
            {track.title}
          </h2>

          <span>
            {track.artist}
          </span>
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close track details"
        >
          <X size={18} />
        </button>
      </div>

      <div className="track-details-panel__artwork">
        {track.artworkUrl ? (
          <img
            src={
              track.artworkUrl
            }
            alt={`${track.title} artwork`}
          />
        ) : (
          <span>
            {track.title
              .trim()
              .slice(0, 1)
              .toUpperCase() ||
              "♪"}
          </span>
        )}
      </div>

      <form
        className="track-details-form"
        onSubmit={
          handleSubmit
        }
      >
        <section className="track-details-section">
          <div className="track-details-section__title">
            <h3>
              Catalog metadata
            </h3>
          </div>

          <div className="track-details-form__grid">
            <label>
              <span>
                Title
              </span>

              <input
                type="text"
                value={
                  formState.title
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "title",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Artist
              </span>

              <input
                type="text"
                value={
                  formState.artist
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "artist",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Release date
              </span>

              <input
                type="text"
                placeholder="2026-08-22"
                value={
                  formState
                    .releaseDate
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "releaseDate",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Genre
              </span>

              <input
                type="text"
                value={
                  formState.genre
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "genre",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Spotify popularity
              </span>

              <input
                type="text"
                inputMode="numeric"
                value={
                  formState
                    .spotifyPopularity
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "spotifyPopularity",
                    event
                      .target
                      .value
                      .replace(
                        /[^\d]/g,
                        "",
                      ),
                  )
                }
              />
            </label>
          </div>
        </section>

        <section className="track-details-section">
          <div className="track-details-section__title">
            <h3>
              DJ metadata
            </h3>
          </div>

          <div className="track-details-form__grid">
            <label>
              <span>
                BPM
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  formState.tempo
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "tempo",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Key
              </span>

              <input
                type="text"
                value={
                  formState
                    .musicalKey
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "musicalKey",
                    event
                      .target
                      .value,
                  )
                }
                placeholder="F#m"
              />
            </label>

            <label>
              <span>
                Camelot
              </span>

              <input
                type="text"
                value={
                  getCamelotKey(
                    formState
                      .musicalKey ||
                    null,
                  )
                }
                readOnly
              />
            </label>

            <label>
              <span>
                Energy
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  formState.energy
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "energy",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Overall volume
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  formState
                    .overallVolume
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "overallVolume",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Rating
              </span>

              <input
                type="text"
                inputMode="numeric"
                value={
                  formState.rating
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "rating",
                    event
                      .target
                      .value,
                  )
                }
              />
            </label>
          </div>

          <p className="track-details-form__helper">
            Current volume:{" "}
            {formatOverallVolume(
              parseOptionalNumber(
                formState
                  .overallVolume,
              ),
            )}
          </p>

          <label>
            <span>
              Cue points
            </span>

            <textarea
              rows={3}
              value={
                formState.cuePoints
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "cuePoints",
                  event
                    .target
                    .value,
                )
              }
            />
          </label>
        </section>

        <section className="track-details-section">
          <div className="track-details-section__title">
            <h3>
              Organization
            </h3>
          </div>

          <label>
            <span>
              Keywords
            </span>

            <input
              type="text"
              value={
                formState.keywords
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "keywords",
                  event
                    .target
                    .value,
                )
              }
              placeholder="chill, peak time, billboard"
            />
          </label>

          <label>
            <span>
              Folder
            </span>

            <input
              type="text"
              value={
                formState.folder
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "folder",
                  event
                    .target
                    .value,
                )
              }
            />
          </label>

          <label>
            <span>
              Comments
            </span>

            <textarea
              rows={4}
              value={
                formState.comments
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "comments",
                  event
                    .target
                    .value,
                )
              }
            />
          </label>
        </section>

        <SupabaseSyncAccount />

        {saveMessage && (
          <p className="track-details-form__helper">
            {saveMessage}
          </p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={
            isSaving
          }
        >
          <Save size={16} />

          {isSaving
            ? "Saving..."
            : "Save changes"}
        </button>
      </form>

      <section className="track-details-section">
        <dl className="track-details-metadata">
          <div>
            <dt>
              Song ID
            </dt>

            <dd>
              {track.externalSongId ??
                track.id}
            </dd>
          </div>

          <div>
            <dt>
              Album
            </dt>

            <dd>
              {track.album ??
                "—"}
            </dd>
          </div>

          <div>
            <dt>
              Duration
            </dt>

            <dd>
              {formatDuration(
                track.durationSeconds,
              )}
            </dd>
          </div>

          <div>
            <dt>
              Date added
            </dt>

            <dd>
              {formatDate(
                track.dateAdded,
              )}
            </dd>
          </div>
        </dl>

        {track.spotifyUrl && (
          <a
            className="track-details-external-link"
            href={
              track.spotifyUrl
            }
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink
              size={14}
            />
            Open track in Spotify
          </a>
        )}
      </section>

      <section className="track-details-section track-artist-section">
        <div className="track-details-section__title">
          <h3>
            Artist information
          </h3>
        </div>

        {artistDetails ? (
          <>
            <div className="track-artist-card">
              <div className="track-artist-card__image">
                {artistDetails.imageUrl ? (
                  <img
                    src={
                      artistDetails.imageUrl
                    }
                    alt={`${track.artist} artist`}
                  />
                ) : (
                  <UserRound
                    size={24}
                  />
                )}
              </div>

              <div>
                <strong>
                  {track.artist}
                </strong>

                <span>
                  {artistDetails
                    .genres
                    .length > 0
                    ? artistDetails
                        .genres
                        .join(", ")
                    : "No artist genres"}
                </span>
              </div>
            </div>

            <dl className="track-details-metadata">
              <div>
                <dt>
                  Artist ID
                </dt>

                <dd>
                  {artistDetails.artistId ??
                    "—"}
                </dd>
              </div>

              <div>
                <dt>
                  Country
                </dt>

                <dd>
                  {artistDetails.country ??
                    "—"}
                </dd>
              </div>

              <div>
                <dt>
                  Popularity
                </dt>

                <dd>
                  {artistDetails.popularity ??
                    "—"}
                </dd>
              </div>

              <div>
                <dt>
                  Followers
                </dt>

                <dd>
                  {formatFollowers(
                    artistDetails.followers,
                  )}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="track-details-empty-copy">
            No artist information available.
          </p>
        )}
      </section>

      <TrackEditConfirmationModal isOpen={confirmationOpen} songId={track.externalSongId ?? track.id} title={formState.title.trim() || track.title} artist={formState.artist.trim() || track.artist} diffs={lastDiffs} localJsonSaved={confirmationLocalJson} supabaseQueued={confirmationSupabase} onClose={() => setConfirmationOpen(false)} />
    </aside>
  );
}
