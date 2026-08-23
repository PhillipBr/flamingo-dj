import {
  ArrowLeftRight,
  Gauge,
  History,
  ListPlus,
  Music2,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import type { Track } from "../../types/track";

import {
  getTrackCamelot,
  getTrackGenres,
  matchCrossStyle,
  matchSameStyle,
  normalizeGenre,
  type MatchMode,
  type SongMatch,
} from "../../utils/matchSongs";

import {
  applyHistoricalCrowdScore,
  buildTrackPerformanceMap,
} from "../../utils/historicalCrowdMatch";

import {
  loadLivePerformanceHistory,
} from "../../utils/livePerformanceStorage";

import {
  loadEventProfileState,
} from "../../utils/eventProfileStorage";

import {
  filterPerformanceHistoryByProfile,
} from "../../utils/eventProfilePerformance";

import {
  buildTrackPerformance,
} from "../../utils/trackPerformanceEngine";

import "./MatchSongsPanel.css";

type MatchSongsPanelProps = {
  track: Track | null;
  tracks: Track[];
  onClose: () => void;
  onOpenTrackDetails?: (
    trackId: string,
  ) => void;
  onAddToSet: (
    trackId: string,
  ) => void;
  currentSetTrackIds: string[];
};

type MatchTab =
  | "same-style"
  | "cross-style";

type HistoricalSongMatch =
  SongMatch<Track> & {
    basePercentage: number;
    historicalCrowdScore:
      number | null;
    historicalCrowdResponses:
      number;
    historicalConfidence:
      number;
    historicalEffectiveWeight:
      number;
  };

type CrossStyleSection = {
  style: string;
  results: HistoricalSongMatch[];
  bestScore: number;
};

function formatScore(
  value: number,
): string {
  return `${Math.round(value * 100)}%`;
}

function formatTempo(
  value: number | null,
): string {
  return value === null
    ? "—"
    : `${Math.round(value)} BPM`;
}

function formatEnergy(
  value: number | null,
): string {
  return value === null
    ? "—"
    : String(value);
}

function getArtworkUrl(
  track: Track,
): string | null {
  return track.artworkUrl ?? null;
}

function getMatchModeLabel(
  mode: MatchMode,
): string {
  return mode === "same-style"
    ? "Same Style"
    : "Cross Style";
}

function formatStyleLabel(
  value: string,
): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0)
          .toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function getCrossStyleName(
  result: HistoricalSongMatch,
): string {
  const matchedPair =
    result.explanation
      .matchedGenrePair;

  if (matchedPair?.[1]) {
    return normalizeGenre(
      matchedPair[1],
    );
  }

  const candidateGenres =
    getTrackGenres(
      result.track,
    );

  if (candidateGenres[0]) {
    return normalizeGenre(
      candidateGenres[0],
    );
  }

  return "other";
}

function buildCrossStyleSections(
  results: HistoricalSongMatch[],
): CrossStyleSection[] {
  const grouped =
    new Map<
      string,
      HistoricalSongMatch[]
    >();

  results.forEach(
    (result) => {
      const style =
        getCrossStyleName(
          result,
        );

      const current =
        grouped.get(style) ?? [];

      current.push(result);
      grouped.set(
        style,
        current,
      );
    },
  );

  return [
    ...grouped.entries(),
  ]
    .map(
      ([
        style,
        styleResults,
      ]) => {
        const sorted =
          [...styleResults]
            .sort(
              (
                left,
                right,
              ) =>
                right.score -
                left.score,
            )
            .slice(0, 5);

        return {
          style,
          results: sorted,
          bestScore:
            sorted[0]?.score ??
            0,
        };
      },
    )
    .filter(
      (section) =>
        section.results.length >
        0,
    )
    .sort(
      (
        left,
        right,
      ) => {
        if (
          right.results.length !==
          left.results.length
        ) {
          return (
            right.results.length -
            left.results.length
          );
        }

        return (
          right.bestScore -
          left.bestScore
        );
      },
    )
    .slice(0, 3);
}

type MatchCardProps = {
  result: HistoricalSongMatch;
  rank: number;
  currentSetTrackIds: string[];
  onAddToSet: (
    trackId: string,
  ) => void;
  onOpenTrackDetails?: (
    trackId: string,
  ) => void;
};

function MatchCard({
  result,
  rank,
  currentSetTrackIds,
  onAddToSet,
  onOpenTrackDetails,
}: MatchCardProps) {
  const candidate =
    result.track;

  const artwork =
    getArtworkUrl(candidate);

  const isInSet =
    currentSetTrackIds.includes(
      candidate.id,
    );

  return (
    <article className="match-card">
      <div className="match-card__rank">
        {rank}
      </div>

      <div className="match-card__artwork">
        {artwork ? (
          <img
            src={artwork}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <Music2 size={18} />
        )}
      </div>

      <div className="match-card__main">
        <div className="match-card__title-row">
          <div>
            <strong title={candidate.title}>
              {candidate.title}
            </strong>

            <p title={candidate.artist}>
              {candidate.artist}
            </p>
          </div>

          <span className="match-card__score">
            {result.percentage}%
          </span>
        </div>

        <div className="match-card__facts">
          <span>
            <Gauge size={13} />
            {formatTempo(
              candidate.tempo,
            )}
          </span>

          <span>
            <Zap size={13} />
            {formatEnergy(
              candidate.energy,
            )}
          </span>

          <span
            className={
              result.historicalCrowdScore ===
              null
                ? "match-card__history match-card__history--empty"
                : "match-card__history"
            }
            title={
              result.historicalCrowdScore ===
              null
                ? "No recorded crowd history for this track."
                : `Historical crowd score ${result.historicalCrowdScore}/100 from ${result.historicalCrowdResponses} response${
                    result.historicalCrowdResponses ===
                    1
                      ? ""
                      : "s"
                  }. Effective Match weight: ${Math.round(
                    result.historicalEffectiveWeight *
                      100,
                  )}%.`
            }
          >
            <History
              size={13}
            />

            {result.historicalCrowdScore ===
            null
              ? "Crowd —"
              : `Crowd ${result.historicalCrowdScore}`}
          </span>

          <span>
            <Music2 size={13} />
            Key{" "}
            {candidate.musicalKey ??
              "—"}
          </span>

          <span>
            Camelot{" "}
            {getTrackCamelot(
              candidate,
            ) ?? "—"}
          </span>
        </div>

        <div className="match-card__genre">
          {candidate.genre ??
            "Unknown genre"}
        </div>

        <div className="match-card__breakdown">
          <span>
            Genre{" "}
            {formatScore(
              result.breakdown
                .genre,
            )}
          </span>

          <span>
            BPM{" "}
            {formatScore(
              result.breakdown
                .bpm,
            )}
          </span>

          <span>
            Energy{" "}
            {formatScore(
              result.breakdown
                .energy,
            )}
          </span>

          <span>
            Camelot{" "}
            {formatScore(
              result.breakdown
                .camelot,
            )}
          </span>
        </div>

        {result.historicalCrowdScore !==
          null && (
          <div className="match-card__historical-note">
            <History size={11} />

            <span>
              Musical match{" "}
              {result.basePercentage}%{" "}
              → historical-adjusted{" "}
              {result.percentage}%{" "}
              · confidence{" "}
              {Math.round(
                result.historicalConfidence *
                  100,
              )}
              %
            </span>
          </div>
        )}

        <button
          className="match-card__add-to-set"
          type="button"
          disabled={isInSet}
          onClick={() =>
            onAddToSet(
              candidate.id,
            )
          }
        >
          <ListPlus size={13} />
          {isInSet
            ? "In set"
            : "Add to set"}
        </button>

        {onOpenTrackDetails && (
          <button
            className="match-card__details"
            type="button"
            onClick={() =>
              onOpenTrackDetails(
                candidate.id,
              )
            }
          >
            Open track
          </button>
        )}
      </div>
    </article>
  );
}

function applyHistoricalWeightToResults(
  results:
    SongMatch<Track>[],
  performanceByTrackId:
    ReadonlyMap<
      string,
      ReturnType<
        typeof buildTrackPerformance
      >[number]
    >,
): HistoricalSongMatch[] {
  return results
    .map(
      (
        result,
      ): HistoricalSongMatch => {
        const weighted =
          applyHistoricalCrowdScore(
            result.score,
            performanceByTrackId.get(
              result.track.id,
            ) ??
              null,
          );

        return {
          ...result,

          score:
            weighted.adjustedScore,

          percentage:
            Math.round(
              weighted.adjustedScore *
                100,
            ),

          basePercentage:
            result.percentage,

          historicalCrowdScore:
            weighted.signal
              .crowdScore,

          historicalCrowdResponses:
            weighted.signal
              .crowdResponses,

          historicalConfidence:
            weighted.signal
              .confidence,

          historicalEffectiveWeight:
            weighted.signal
              .effectiveWeight,
        };
      },
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.score -
        left.score,
    );
}

export default function MatchSongsPanel({
  track,
  tracks,
  onClose,
  onOpenTrackDetails,
  onAddToSet,
  currentSetTrackIds,
}: MatchSongsPanelProps) {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<MatchTab>(
      "same-style",
    );

  const [
    minimumScore,
    setMinimumScore,
  ] = useState(35);

  const activeEventProfile =
    useMemo(() => {
      const profileState =
        loadEventProfileState();

      return (
        profileState.profiles.find(
          (profile) =>
            profile.id ===
            profileState.activeProfileId,
        ) ??
        null
      );
    }, [
      track,
    ]);

  const performanceByTrackId =
    useMemo(() => {
      const history =
        loadLivePerformanceHistory();

      const profileState =
        loadEventProfileState();

      const contextHistory =
        filterPerformanceHistoryByProfile(
          history,
          profileState.activeProfileId,
        );

      const performance =
        buildTrackPerformance(
          contextHistory,
        );

      return buildTrackPerformanceMap(
        performance,
      );
    }, [
      track,
    ]);

  const sameStyleResults =
    useMemo<
      HistoricalSongMatch[]
    >(() => {
      if (
        !track ||
        activeTab !==
          "same-style"
      ) {
        return [];
      }

      const results =
        matchSameStyle(
          track,
          tracks,
          {
            limit: 60,
            minimumScore:
              minimumScore / 100,
            requireGenreMatch:
              false,
          },
        );

      return applyHistoricalWeightToResults(
        results,
        performanceByTrackId,
      ).slice(
        0,
        30,
      );
    }, [
      activeTab,
      minimumScore,
      performanceByTrackId,
      track,
      tracks,
    ]);

  const crossStyleResults =
    useMemo<
      HistoricalSongMatch[]
    >(() => {
      if (
        !track ||
        activeTab !==
          "cross-style"
      ) {
        return [];
      }

      const results =
        matchCrossStyle(
          track,
          tracks,
          {
            limit: 180,
            minimumScore:
              minimumScore / 100,
            requireGenreMatch:
              false,
          },
        );

      return applyHistoricalWeightToResults(
        results,
        performanceByTrackId,
      ).slice(
        0,
        120,
      );
    }, [
      activeTab,
      minimumScore,
      performanceByTrackId,
      track,
      tracks,
    ]);

  const crossStyleSections =
    useMemo(
      () =>
        buildCrossStyleSections(
          crossStyleResults,
        ),
      [crossStyleResults],
    );

  if (!track) {
    return null;
  }

  const sourceArtwork =
    getArtworkUrl(track);

  const visibleMatchCount =
    activeTab === "same-style"
      ? sameStyleResults.length
      : crossStyleSections.reduce(
          (
            total,
            section,
          ) =>
            total +
            section.results.length,
          0,
        );

  return (
    <aside
      className="match-songs-panel"
      aria-label="Match songs panel"
    >
      <header className="match-songs-panel__header">
        <div>
          <p className="match-songs-panel__eyebrow">
            <Sparkles size={14} />
            Match Songs
          </p>

          <h2>
            Recommendations
          </h2>

          <small className="match-songs-panel__profile-context">
            Crowd context:{" "}
            {activeEventProfile?.name ??
              "Global / No Venue"}
          </small>
        </div>

        <button
          className="match-songs-panel__close"
          type="button"
          aria-label="Close match songs"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <section className="match-songs-panel__source">
        <div className="match-songs-panel__source-artwork">
          {sourceArtwork ? (
            <img
              src={sourceArtwork}
              alt=""
              draggable={false}
            />
          ) : (
            <Music2 size={24} />
          )}
        </div>

        <div className="match-songs-panel__source-copy">
          <span>
            Matching from
          </span>

          <strong title={track.title}>
            {track.title}
          </strong>

          <p title={track.artist}>
            {track.artist}
          </p>
        </div>
      </section>

      <div
        className="match-songs-panel__tabs"
        role="tablist"
        aria-label="Match mode"
      >
        <button
          className={
            activeTab ===
            "same-style"
              ? "match-songs-panel__tab match-songs-panel__tab--active"
              : "match-songs-panel__tab"
          }
          type="button"
          role="tab"
          aria-selected={
            activeTab ===
            "same-style"
          }
          onClick={() =>
            setActiveTab(
              "same-style",
            )
          }
        >
          <RefreshCw size={15} />
          Same Style
        </button>

        <button
          className={
            activeTab ===
            "cross-style"
              ? "match-songs-panel__tab match-songs-panel__tab--active"
              : "match-songs-panel__tab"
          }
          type="button"
          role="tab"
          aria-selected={
            activeTab ===
            "cross-style"
          }
          onClick={() =>
            setActiveTab(
              "cross-style",
            )
          }
        >
          <ArrowLeftRight size={15} />
          Cross Style
        </button>
      </div>

      <div className="match-songs-panel__controls">
        <label>
          <span>
            Minimum score
          </span>

          <strong>
            {minimumScore}%
          </strong>
        </label>

        <input
          type="range"
          min="20"
          max="80"
          step="5"
          value={minimumScore}
          onChange={(event) =>
            setMinimumScore(
              Number(
                event.target.value,
              ),
            )
          }
        />
      </div>

      <div className="match-songs-panel__result-summary">
        <span>
          {getMatchModeLabel(
            activeTab,
          )}
        </span>

        <strong>
          {visibleMatchCount}{" "}
          {visibleMatchCount === 1
            ? "match"
            : "matches"}
        </strong>
      </div>

      <div className="match-songs-panel__results">
        {activeTab ===
        "same-style" ? (
          sameStyleResults.length ===
          0 ? (
            <div className="match-songs-panel__empty">
              <Music2 size={28} />
              <strong>
                No matches found
              </strong>
              <p>
                Lower the minimum
                score or try Cross
                Style.
              </p>
            </div>
          ) : (
            sameStyleResults.map(
              (
                result,
                index,
              ) => (
                <MatchCard
                  key={
                    result.track.id
                  }
                  result={result}
                  rank={index + 1}
                  currentSetTrackIds={
                    currentSetTrackIds
                  }
                  onAddToSet={
                    onAddToSet
                  }
                  onOpenTrackDetails={
                    onOpenTrackDetails
                  }
                />
              ),
            )
          )
        ) : crossStyleSections.length ===
          0 ? (
          <div className="match-songs-panel__empty">
            <Music2 size={28} />
            <strong>
              No cross-style routes
            </strong>
            <p>
              Lower the minimum
              score to discover
              more transition
              styles.
            </p>
          </div>
        ) : (
          crossStyleSections.map(
            (section) => (
              <section
                className="cross-style-section"
                key={
                  section.style
                }
              >
                <header className="cross-style-section__header">
                  <div>
                    <span>
                      Switch to
                    </span>
                    <strong>
                      {formatStyleLabel(
                        section.style,
                      )}
                    </strong>
                  </div>

                  <span>
                    {
                      section.results
                        .length
                    } suggestions
                  </span>
                </header>

                {section.results.map(
                  (
                    result,
                    index,
                  ) => (
                    <MatchCard
                      key={
                        result.track.id
                      }
                      result={result}
                      rank={index + 1}
                      currentSetTrackIds={
                        currentSetTrackIds
                      }
                      onAddToSet={
                        onAddToSet
                      }
                      onOpenTrackDetails={
                        onOpenTrackDetails
                      }
                    />
                  ),
                )}
              </section>
            ),
          )
        )}
      </div>
    </aside>
  );
}
