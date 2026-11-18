import {
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";

import type { Playlist } from "../../types/playlist";
import type { Track } from "../../types/track";
import type {
  MatchEnergyDirection,
  MatchFeedbackRecord,
  MatchHarmonicPriority,
  MatchHumanRating,
} from "../../types/matchV2";

import {
  buildMatchCandidates,
} from "../../utils/matchV2";

import {
  loadMatchFeedback,
  loadMatchFeedbackLocal,
  saveMatchRating,
} from "../../utils/matchFeedbackStorage";

import "./MatchSongsPanel.css";

type Props = {
  track: Track | null;
  tracks: Track[];
  allTracks?: Track[];
  playlists?: Playlist[];
  currentPlaylistId?: string | null;
  onClose: () => void;
  onChooseTrack: (trackId: string) => void;
  selectedTrackIds?: string[];
  playedTrackIds?: string[];
  onOpenTrackDetails: (trackId: string) => void;
  onAddToSet: (trackId: string) => void;
  currentSetTrackIds: string[];
};

type SearchMode = "current" | "other" | "all";

function popularityTier(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "neutral";
  if (value >= 90) return "very-high";
  if (value >= 79) return "high";
  if (value >= 60) return "medium";
  return "neutral";
}

function displayNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "—";
}

export default function MatchSongsPanel({
  track,
  tracks,
  allTracks,
  playlists,
  currentPlaylistId,
  onClose,
  onChooseTrack,
  selectedTrackIds = [],
  playedTrackIds = [],
  onOpenTrackDetails,
  onAddToSet,
  currentSetTrackIds,
}: Props) {
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [resultLimit, setResultLimit] = useState(10);
  const panelRef = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [searchMode, setSearchMode] =
    useState<SearchMode>("current");

  const [targetPlaylistId, setTargetPlaylistId] =
    useState("");

  const [energyDirection, setEnergyDirection] =
    useState<MatchEnergyDirection>("maintain");

  const [harmonicPriority, setHarmonicPriority] =
    useState<MatchHarmonicPriority>("high");

  const [allowHalfDouble, setAllowHalfDouble] =
    useState(true);

  const [feedback, setFeedback] =
    useState<MatchFeedbackRecord[]>(loadMatchFeedbackLocal);

  const [savingKey, setSavingKey] =
    useState<string | null>(null);

  const libraryTracks = allTracks ?? tracks;
  const libraryPlaylists = playlists ?? [];

  const currentPlaylist =
    libraryPlaylists.find(
      (playlist) => playlist.id === currentPlaylistId,
    ) ?? null;

  const otherPlaylists = useMemo(
    () =>
      libraryPlaylists
        .filter((playlist) => playlist.id !== currentPlaylistId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [libraryPlaylists, currentPlaylistId],
  );

  useEffect(() => {
    if (
      searchMode === "other" &&
      !targetPlaylistId &&
      otherPlaylists.length > 0
    ) {
      setTargetPlaylistId(otherPlaylists[0].id);
    }
  }, [searchMode, targetPlaylistId, otherPlaylists]);

  useEffect(() => {
    let cancelled = false;

    void loadMatchFeedback().then((records) => {
      if (!cancelled) setFeedback(records);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const trackById = useMemo(
    () => new Map(libraryTracks.map((item) => [item.id, item])),
    [libraryTracks],
  );

  const targetPlaylist =
    libraryPlaylists.find(
      (playlist) => playlist.id === targetPlaylistId,
    ) ?? null;

  const candidateTracks = useMemo(() => {
    if (searchMode === "current") return tracks;
    if (searchMode === "all") return libraryTracks;
    if (!targetPlaylist) return [];

    return targetPlaylist.trackIds
      .map((id) => trackById.get(id) ?? null)
      .filter((item): item is Track => item !== null);
  }, [
    searchMode,
    tracks,
    libraryTracks,
    targetPlaylist,
    trackById,
  ]);

  // P-marked tracks are excluded before scoring, regardless of recording state.
  const playedSet = useMemo(() => new Set(playedTrackIds), [playedTrackIds]);
  const unplayedCandidates = useMemo(
    () => candidateTracks.filter((candidate) => !playedSet.has(candidate.id) && candidate.id !== track?.id),
    [candidateTracks, playedSet, track?.id],
  );

  const matches = useMemo(
    () =>
      track
        ? buildMatchCandidates({
            sourceTrack: track,
            candidates: unplayedCandidates,
            feedback,
            energyDirection,
            harmonicPriority,
            allowHalfDouble,
            limit: resultLimit,
          })
        : [],
    [
      track,
      unplayedCandidates,
      resultLimit,
      feedback,
      energyDirection,
      harmonicPriority,
      allowHalfDouble,
    ],
  );

  useEffect(() => { setActiveMatchIndex(0); setResultLimit(10); }, [track?.id, searchMode, targetPlaylistId, energyDirection, harmonicPriority, allowHalfDouble]);
  // The PANEL scrolls; results is only a grid (not a scroll container).
  // Move only the panel's scrollTop, never the underlying playlist or page.
  useEffect(() => {
    if (!track) return;
    const panel = panelRef.current;
    const card = resultsRef.current?.querySelector<HTMLElement>(`[data-match-index="${activeMatchIndex}"]`);
    if (!panel || !card) return;
    const viewport = panel.getBoundingClientRect();
    const item = card.getBoundingClientRect();
    const padding = 12;
    if (item.bottom > viewport.bottom - padding) {
      panel.scrollTop += item.bottom - viewport.bottom + padding;
    } else if (item.top < viewport.top + padding) {
      panel.scrollTop += item.top - viewport.top - padding;
    }
  }, [activeMatchIndex, matches, track]);
  useEffect(() => {
    if (!track) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); event.stopImmediatePropagation();
        setActiveMatchIndex((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
      }
      if (event.key === "Enter" && matches[activeMatchIndex]) {
        event.preventDefault(); event.stopImmediatePropagation();
        onChooseTrack(matches[activeMatchIndex].track.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [track, matches, activeMatchIndex, onClose, onChooseTrack]);

  if (!track) return null;

  const sourcePlaylistId = currentPlaylistId ?? null;

  const resolvedTargetPlaylistId =
    searchMode === "current"
      ? sourcePlaylistId
      : searchMode === "other"
        ? targetPlaylistId || null
        : null;

  async function rate(
    targetTrackId: string,
    rating: MatchHumanRating,
    technicalScore: number,
    bpmScore: number,
    keyScore: number,
    energyScore: number,
  ) {
    if (!track) {
      return;
    }

    const sourceTrackId = track.id;
    const key = `${sourceTrackId}::${targetTrackId}`;
    setSavingKey(key);

    try {
      const next = await saveMatchRating({
        sourceTrackId,
        targetTrackId,
        sourcePlaylistId,
        targetPlaylistId: resolvedTargetPlaylistId,
        rating,
        technicalScore,
        bpmScore,
        keyScore,
        energyScore,
      });

      setFeedback(next);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div
      className="match-v2-backdrop"
      onMouseDown={onClose}
    >
      <section
        className="match-v2-panel"
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="match-v2-header">
          <div>
            <div className="match-v2-eyebrow">MATCH V2</div>
            <h2>{track.title}</h2>
            <p>
              {track.artist}
              {" · "}
              {displayNumber(track.tempo)} BPM
              {" · "}
              {track.musicalKey ?? "—"}
              {" · E"}
              {displayNumber(track.energy)}
            </p>
          </div>

          <button
            type="button"
            className="match-v2-close"
            onClick={onClose}
            aria-label="Close Match"
          >
            ×
          </button>
        </header>

        <div className="match-v2-controls">
          <label>
            Search in
            <select
              value={searchMode}
              onChange={(event) =>
                setSearchMode(event.target.value as SearchMode)
              }
            >
              <option value="current">Current playlist</option>
              <option value="other">Other playlist</option>
              <option value="all">All DJ Library</option>
            </select>
          </label>

          {searchMode === "other" && (
            <label>
              Target playlist
              <select
                value={targetPlaylistId}
                onChange={(event) =>
                  setTargetPlaylistId(event.target.value)
                }
              >
                {otherPlaylists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Energy
            <select
              value={energyDirection}
              onChange={(event) =>
                setEnergyDirection(
                  event.target.value as MatchEnergyDirection,
                )
              }
            >
              <option value="maintain">Maintain</option>
              <option value="build">Build</option>
              <option value="drop">Drop / Reset</option>
              <option value="any">Any</option>
            </select>
          </label>

          <label>
            Harmonic
            <select
              value={harmonicPriority}
              onChange={(event) =>
                setHarmonicPriority(
                  event.target.value as MatchHarmonicPriority,
                )
              }
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="match-v2-check">
            <input
              type="checkbox"
              checked={allowHalfDouble}
              onChange={(event) =>
                setAllowHalfDouble(event.target.checked)
              }
            />
            Half / Double BPM
          </label>
        </div>

        <div className="match-v2-context">
          <strong>Source:</strong>{" "}
          {currentPlaylist?.name ?? "Current playlist"}
          {" → "}
          <strong>Target:</strong>{" "}
          {searchMode === "current"
            ? currentPlaylist?.name ?? "Current playlist"
            : searchMode === "other"
              ? targetPlaylist?.name ?? "Select playlist"
              : "All DJ Library"}
          {" · "}
          {unplayedCandidates.length} unplayed candidates ({candidateTracks.length - unplayedCandidates.length} excluded)
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,margin:"8px 0"}}>
          <span>{matches.length} recommendations · Played excluded</span>
          {matches.length >= resultLimit && unplayedCandidates.length > resultLimit && (
            <button type="button" onClick={() => setResultLimit((limit) => limit + 10)}>
              Show 10 more
            </button>
          )}
        </div>
        <div className="match-v2-results" ref={resultsRef}>
          {matches.length === 0 ? (
            <div className="match-v2-empty">
              No candidates available for this target.
            </div>
          ) : (
            matches.map((match, index) => {
              const inSet = currentSetTrackIds.includes(match.track.id);
              const saveKey = `${track.id}::${match.track.id}`;

              return (
                <article
                  key={match.track.id}
                  className={`match-v2-card ${index === activeMatchIndex ? "match-v2-card--active" : ""} ${selectedTrackIds.includes(match.track.id) ? "match-v2-card--selected" : ""} ${playedTrackIds.includes(match.track.id) ? "match-v2-card--played" : ""}`}
                  data-match-index={index}
                  onClick={() => setActiveMatchIndex(index)}
                  aria-selected={index === activeMatchIndex}
                >
                  <div className="match-v2-rank">{index + 1}</div>

                  <div className="match-v2-main">
                    <div className="match-v2-title-row">
                      <div>
                        <strong>{match.track.title}</strong>
                        {playedTrackIds.includes(match.track.id) && <span className="match-v2-played-label">✓ Played</span>}
                        {selectedTrackIds.includes(match.track.id) && <span className="match-v2-selected-label">✓ Selected</span>}
                        <span>{match.track.artist}</span>
                      </div>

                      <div className="match-v2-score">
                        {match.finalScore}%
                      </div>
                    </div>

                    <div className="match-v2-meta">
                      <span>{displayNumber(match.track.tempo)} BPM</span>
                      <span>KEY {match.track.musicalKey || "—"}</span>
                      <span>ENERGY {match.track.energy == null ? "—" : displayNumber(match.track.energy)}</span>
                      <span className={`match-v2-popularity match-v2-popularity--${popularityTier(match.track.spotifyPopularity)}`} title="Spotify popularity (0–100)">POP {match.track.spotifyPopularity ?? "—"}</span>

                      {match.bpmMode === "half-double" && (
                        <span className="match-v2-double">
                          HALF/DOUBLE
                        </span>
                      )}
                    </div>

                    {match.humanBoost !== 0 && (
                      <div className="match-v2-human">DJ feedback: {match.humanBoost > 0 ? "+" : ""}{match.humanBoost}</div>
                    )}

                    <div className="match-v2-actions">
                      <button type="button" onClick={() => onChooseTrack(match.track.id)}>Select · Enter</button>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenTrackDetails(match.track.id)
                        }
                      >
                        Details
                      </button>

                      <button
                        type="button"
                        disabled={inSet}
                        onClick={() =>
                          onAddToSet(match.track.id)
                        }
                      >
                        {inSet ? "In Set" : "Add to Set"}
                      </button>

                      <div className="match-v2-rating">
                        <span>Rate transition:</span>

                        {([0, 1, 2, 3] as const).map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            className={
                              match.humanRating === rating
                                ? "is-active"
                                : ""
                            }
                            disabled={savingKey === saveKey}
                            title={
                              rating === 0
                                ? "Not a match"
                                : rating === 1
                                  ? "Technical only"
                                  : rating === 2
                                    ? "Good transition"
                                    : "Strong real DJ transition"
                            }
                            onClick={() =>
                              void rate(
                                match.track.id,
                                rating,
                                match.technicalScore,
                                match.bpmScore,
                                match.keyScore,
                                match.energyScore,
                              )
                            }
                          >
                            {rating === 0 ? "✕" : rating}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
