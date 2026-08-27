import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  Track,
} from "../../types/track";

import {
  beginSpotifyAuthorization,
  isSpotifyConnected,
} from "../../utils/spotifyApi";

import {
  compareSpotifyAndFlamingoPlaylist,
  createSpotifyPlaylistFromFlamingo,
  pushFlamingoPlaylistToSpotify,
  readSpotifyPlaylistTracks,
  type SpotifyPlaylistSyncComparison,
} from "../../utils/playlistSpotifySync";

import {
  hydrateTracksWithSpotifyUrls,
} from "../../utils/trackExtraLoader";

import {
  loadPlaylistSyncLocal,
  loadPlaylistSyncRecord,
  persistPlaylistSync,
} from "../../utils/playlistCloudSync";

import {
  DEFAULT_PARTY_SORT_SETTINGS,
  sortTracksForParty,
  type PartySortResult,
  type PartySortSettings,
  type PartySortStyle,
} from "../../utils/partySort";

import "./SpotifyPlaylistSyncPanel.css";

type Props = {
  playlistId: string;
  playlistName: string;

  initialSpotifyPlaylistId:
    | string
    | null;

  initialSpotifyPlaylistName?:
    | string
    | null;

  playlistTracks:
    Track[];

  allTracks:
    Track[];

  onApplyOrderedTracks: (
    orderedTracks:
      Track[],
  ) => void;
};

export default function SpotifyPlaylistSyncPanel({
  playlistId,
  playlistName,
  initialSpotifyPlaylistId,
  initialSpotifyPlaylistName,
  playlistTracks,
  allTracks,
  onApplyOrderedTracks,
}: Props) {
  const localRecord =
    loadPlaylistSyncLocal(
      playlistId,
    );

  const [
    spotifyPlaylistId,
    setSpotifyPlaylistId,
  ] =
    useState<string | null>(
      localRecord
        ?.spotifyPlaylistId ??
      initialSpotifyPlaylistId,
    );

  const [
    spotifyPlaylistName,
    setSpotifyPlaylistName,
  ] =
    useState<string | null>(
      localRecord
        ?.spotifyPlaylistName ??
      initialSpotifyPlaylistName ??
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      "pull" |
      "push" |
      "party" |
      null
    >(
      null,
    );

  const [
    comparison,
    setComparison,
  ] =
    useState<SpotifyPlaylistSyncComparison | null>(
      null,
    );

  const [
    partyOpen,
    setPartyOpen,
  ] =
    useState(
      false,
    );

  const [
    partySettings,
    setPartySettings,
  ] =
    useState<PartySortSettings>({
      ...DEFAULT_PARTY_SORT_SETTINGS,
    });

  const [
    partyPreview,
    setPartyPreview,
  ] =
    useState<PartySortResult | null>(
      null,
    );

  const [
    status,
    setStatus,
  ] =
    useState("");

  const effectiveSpotifyName =
    spotifyPlaylistName ??
    spotifyPlaylistId;

  useEffect(() => {
    let cancelled =
      false;

    void loadPlaylistSyncRecord(
      playlistId,
    ).then(
      (record) => {
        if (
          cancelled ||
          !record
        ) {
          return;
        }

        setSpotifyPlaylistId(
          record.spotifyPlaylistId,
        );

        setSpotifyPlaylistName(
          record.spotifyPlaylistName,
        );
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [
    playlistId,
  ]);

  const currentOrderSummary =
    useMemo(
      () => {
        if (
          !playlistTracks.length
        ) {
          return "0 tracks";
        }

        const bpms =
          playlistTracks
            .map(
              (track) =>
                Number(
                  track.tempo,
                ),
            )
            .filter(
              (
                value,
              ) =>
                Number.isFinite(
                  value,
                ) &&
                value >
                  0,
            );

        if (
          !bpms.length
        ) {
          return `${playlistTracks.length} tracks`;
        }

        return (
          `${playlistTracks.length} tracks · ` +
          `${Math.round(
            Math.min(
              ...bpms,
            ),
          )}-${Math.round(
            Math.max(
              ...bpms,
            ),
          )} BPM`
        );
      },
      [
        playlistTracks,
      ],
    );

  async function ensureConnected() {
    if (
      isSpotifyConnected()
    ) {
      return true;
    }

    await beginSpotifyAuthorization(
      window.location.hash ||
        "#/playlists",
    );

    return false;
  }

  async function persistCurrentOrder(
    trackIds: string[],
    direction:
      | "spotify_to_flamingo"
      | "flamingo_to_spotify"
      | "create_spotify"
      | "party_sort",
    nextSpotifyPlaylistId =
      spotifyPlaylistId,
    nextSpotifyPlaylistName =
      spotifyPlaylistName,
  ) {
    return persistPlaylistSync({
      flamingoPlaylistId:
        playlistId,

      flamingoPlaylistName:
        playlistName,

      spotifyPlaylistId:
        nextSpotifyPlaylistId,

      spotifyPlaylistName:
        nextSpotifyPlaylistName,

      trackIds,

      lastDirection:
        direction,

      lastSyncedAt:
        new Date().toISOString(),
    });
  }

  async function handlePush() {
    if (
      !(await ensureConnected())
    ) {
      return;
    }

    setBusy(
      "push",
    );

    try {
      setStatus(
        "Loading Spotify URLs...",
      );

      const hydrated =
        await hydrateTracksWithSpotifyUrls(
          playlistTracks,
        );

      if (
        !spotifyPlaylistId
      ) {
        const result =
          await createSpotifyPlaylistFromFlamingo(
            playlistName,
            hydrated.tracks,
          );

        setSpotifyPlaylistId(
          result.playlist.id,
        );

        setSpotifyPlaylistName(
          result.playlist.name,
        );

        const persisted =
          await persistCurrentOrder(
            playlistTracks.map(
              (track) =>
                track.id,
            ),
            "create_spotify",
            result.playlist.id,
            result.playlist.name,
          );

        setStatus(
          `Spotify playlist created · ${result.resolved} tracks · association saved ${
            persisted.cloudSaved
              ? "to Supabase"
              : "locally"
          }.`,
        );

        return;
      }

      if (
        !window.confirm(
          `Push Flamingo → Spotify?\n\n${playlistTracks.length} tracks will replace Spotify membership AND preserve the current Party/Play Order.`,
        )
      ) {
        return;
      }

      const result =
        await pushFlamingoPlaylistToSpotify(
          spotifyPlaylistId,
          hydrated.tracks,
        );

      const persisted =
        await persistCurrentOrder(
          playlistTracks.map(
            (track) =>
              track.id,
          ),
          "flamingo_to_spotify",
        );

      setStatus(
        `Push complete · ${result.resolved}/${result.requested} tracks in current Play Order · saved ${
          persisted.cloudSaved
            ? "to Supabase"
            : "locally"
        }.`,
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      setStatus(
        message,
      );

      window.alert(
        message,
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function handlePull() {
    if (
      !spotifyPlaylistId
    ) {
      return;
    }

    if (
      !(await ensureConnected())
    ) {
      return;
    }

    setBusy(
      "pull",
    );

    setComparison(
      null,
    );

    setPartyPreview(
      null,
    );

    try {
      setStatus(
        "Reading Spotify + Flamingo catalog...",
      );

      const [
        spotifyTracks,
        hydratedPlaylist,
        hydratedCatalog,
      ] =
        await Promise.all([
          readSpotifyPlaylistTracks(
            spotifyPlaylistId,
          ),

          hydrateTracksWithSpotifyUrls(
            playlistTracks,
          ),

          hydrateTracksWithSpotifyUrls(
            allTracks,
          ),
        ]);

      const result =
        compareSpotifyAndFlamingoPlaylist(
          spotifyTracks,
          hydratedPlaylist.tracks,
          hydratedCatalog.tracks,
        );

      setComparison(
        result,
      );

      setStatus(
        `Pull preview · ${result.matchedCount}/${result.spotifyCount} matched.`,
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      setStatus(
        message,
      );

      window.alert(
        message,
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function applyPull() {
    if (
      !comparison ||
      !spotifyPlaylistId
    ) {
      return;
    }

    if (
      comparison.matchedCount ===
      0
    ) {
      window.alert(
        "Safety stop: no Spotify tracks matched Flamingo.",
      );

      return;
    }

    if (
      !window.confirm(
        `Apply Spotify → Flamingo?\n\n` +
          `Spotify: ${comparison.spotifyCount}\n` +
          `Flamingo before: ${comparison.flamingoCount}\n` +
          `Flamingo after: ${comparison.matchedCount}\n` +
          `Unresolved: ${comparison.onlySpotifyCount}\n` +
          `Remove: ${comparison.onlyFlamingoCount}\n\n` +
          `Spotify order becomes Flamingo Play Order.`,
      )
    ) {
      return;
    }

    onApplyOrderedTracks(
      comparison.orderedTracks,
    );

    const trackIds =
      comparison.orderedTracks.map(
        (track) =>
          track.id,
      );

    const persisted =
      await persistCurrentOrder(
        trackIds,
        "spotify_to_flamingo",
      );

    setComparison(
      null,
    );

    setStatus(
      `Pull applied · ${trackIds.length} tracks · saved ${
        persisted.cloudSaved
          ? "to Supabase"
          : "locally"
      }.`,
    );
  }

  function updatePartySetting<K extends keyof PartySortSettings>(
    key: K,
    value:
      PartySortSettings[K],
  ) {
    setPartySettings(
      (current) => ({
        ...current,
        [key]:
          value,
      }),
    );

    setPartyPreview(
      null,
    );
  }

  function handlePartyPreview() {
    setBusy(
      "party",
    );

    try {
      const result =
        sortTracksForParty(
          playlistTracks,
          partySettings,
        );

      setPartyPreview(
        result,
      );

      setStatus(
        `Party preview ready · transition quality ${result.averageScore}% · ${result.halfDoubleTransitions} half/double matches · ${result.majorBpmResets} major BPM resets.`,
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      setStatus(
        message,
      );

      window.alert(
        message,
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function applyPartySort() {
    if (
      !partyPreview
    ) {
      return;
    }

    if (
      !window.confirm(
        `Apply Party Sort?\n\n` +
          `${partyPreview.tracks.length} tracks\n` +
          `Transition quality: ${partyPreview.averageScore}%\n` +
          `Half/Double BPM matches: ${partyPreview.halfDoubleTransitions}\n` +
          `Major BPM resets: ${partyPreview.majorBpmResets}\n\n` +
          `This becomes the new Flamingo Play Order. Push to Spotify afterwards to copy this exact order there.`,
      )
    ) {
      return;
    }

    onApplyOrderedTracks(
      partyPreview.tracks,
    );

    const persisted =
      await persistCurrentOrder(
        partyPreview.tracks.map(
          (track) =>
            track.id,
        ),
        "party_sort",
      );

    setPartyPreview(
      null,
    );

    setPartyOpen(
      false,
    );

    setStatus(
      `Party Sort applied · new Play Order saved ${
        persisted.cloudSaved
          ? "to Supabase"
          : "locally"
      }. Push to Spotify when ready.`,
    );
  }

  return (
    <section className="spotify-playlist-sync">
      <div className="spotify-playlist-sync__header">
        <div>
          <span>
            SPOTIFY / PARTY FLOW
          </span>

          <strong>
            {playlistName}
          </strong>

          <small>
            {spotifyPlaylistId
              ? (
                  effectiveSpotifyName ??
                  spotifyPlaylistId
                )
              : "No Spotify playlist linked"}
            {" · "}
            {currentOrderSummary}
          </small>
        </div>

        <b>
          {isSpotifyConnected()
            ? "● Connected"
            : "○ Not connected"}
        </b>
      </div>

      <div className="spotify-playlist-sync__actions">
        <button
          type="button"
          disabled={
            busy !== null
          }
          onClick={() => {
            setPartyOpen(
              (value) =>
                !value,
            );

            setComparison(
              null,
            );
          }}
        >
          ✨ Party Sort
        </button>

        {spotifyPlaylistId && (
          <button
            type="button"
            disabled={
              busy !== null
            }
            onClick={
              handlePull
            }
          >
            {busy ===
            "pull"
              ? "Checking..."
              : "↓ Pull from Spotify"}
          </button>
        )}

        <button
          type="button"
          disabled={
            busy !== null
          }
          onClick={
            handlePush
          }
        >
          {busy ===
          "push"
            ? (
                spotifyPlaylistId
                  ? "Updating..."
                  : "Creating..."
              )
            : "↑ Push to Spotify"}
        </button>
      </div>

      {partyOpen && (
        <div className="spotify-party-sort">
          <div className="spotify-party-sort__grid">
            <label>
              <span>
                Style
              </span>

              <select
                value={
                  partySettings.style
                }
                onChange={
                  (event) =>
                    updatePartySetting(
                      "style",
                      event.target.value as
                        PartySortStyle,
                    )
                }
              >
                <option value="smooth">
                  Smooth Party
                </option>

                <option value="dynamic">
                  Dynamic Party
                </option>

                <option value="peak">
                  Peak Party
                </option>
              </select>
            </label>

            <label>
              <span>
                Start BPM
              </span>

              <input
                type="number"
                min="40"
                max="220"
                placeholder="Auto"
                value={
                  partySettings.startBpm ??
                  ""
                }
                onChange={
                  (event) =>
                    updatePartySetting(
                      "startBpm",
                      event.target.value
                        ? Number(
                            event.target.value,
                          )
                        : null,
                    )
                }
              />
            </label>

            <label>
              <span>
                Harmonic
              </span>

              <select
                value={
                  partySettings.harmonicPriority
                }
                onChange={
                  (event) =>
                    updatePartySetting(
                      "harmonicPriority",
                      event.target.value as
                        PartySortSettings["harmonicPriority"],
                    )
                }
              >
                <option value="high">
                  High
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="low">
                  Low
                </option>
              </select>
            </label>

            <label>
              <span>
                Artist spacing
              </span>

              <input
                type="number"
                min="0"
                max="12"
                value={
                  partySettings.artistSpacing
                }
                onChange={
                  (event) =>
                    updatePartySetting(
                      "artistSpacing",
                      Math.max(
                        0,
                        Number(
                          event.target.value,
                        ) ||
                          0,
                      ),
                    )
                }
              />
            </label>

            <label>
              <span>
                BPM block size
              </span>

              <input
                type="number"
                min="4"
                max="20"
                value={
                  partySettings.blockSize
                }
                onChange={
                  (event) =>
                    updatePartySetting(
                      "blockSize",
                      Math.max(
                        4,
                        Number(
                          event.target.value,
                        ) ||
                          8,
                      ),
                    )
                }
              />
            </label>

            <label className="spotify-party-sort__check">
              <input
                type="checkbox"
                checked={
                  partySettings.allowHalfDouble
                }
                onChange={
                  (event) =>
                    updatePartySetting(
                      "allowHalfDouble",
                      event.target.checked,
                    )
                }
              />

              <span>
                Half / Double BPM
              </span>
            </label>
          </div>

          <div className="spotify-party-sort__buttons">
            <button
              type="button"
              disabled={
                busy !== null ||
                playlistTracks.length <
                  2
              }
              onClick={
                handlePartyPreview
              }
            >
              {busy ===
              "party"
                ? "Analyzing..."
                : "Analyze & Preview"}
            </button>

            {partyPreview && (
              <button
                type="button"
                onClick={
                  applyPartySort
                }
              >
                Apply Party Sort
              </button>
            )}
          </div>

          {partyPreview && (
            <div className="spotify-party-sort__preview">
              <span>
                <b>
                  {partyPreview.averageScore}%
                </b>
                Transition quality
              </span>

              <span>
                <b>
                  {partyPreview.halfDoubleTransitions}
                </b>
                Half/Double
              </span>

              <span>
                <b>
                  {partyPreview.majorBpmResets}
                </b>
                BPM resets
              </span>

              <span>
                <b>
                  {partyPreview.tracks.length}
                </b>
                Tracks
              </span>
            </div>
          )}
        </div>
      )}

      {status && (
        <p>
          {status}
        </p>
      )}

      {comparison && (
        <div className="spotify-playlist-sync__preview">
          <div className="spotify-playlist-sync__stats">
            <span>
              <b>
                {comparison.spotifyCount}
              </b>
              Spotify
            </span>

            <span>
              <b>
                {comparison.matchedCount}
              </b>
              Matched
            </span>

            <span>
              <b>
                {comparison.onlySpotifyCount}
              </b>
              Unresolved
            </span>

            <span>
              <b>
                {comparison.onlyFlamingoCount}
              </b>
              Remove
            </span>
          </div>

          <div className="spotify-playlist-sync__preview-actions">
            <button
              type="button"
              onClick={
                applyPull
              }
            >
              Apply Pull
            </button>

            <button
              type="button"
              onClick={() =>
                setComparison(
                  null,
                )
              }
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
