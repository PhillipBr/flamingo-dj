import {
  BrainCircuit,
  Gauge,
  History,
  LifeBuoy,
  Music2,
  Sparkles,
  Star,
  WandSparkles,
} from "lucide-react";

import type {
  PreEventIntelligence,
  PreEventJourneyRecommendation,
} from "../../types/preEventIntelligence";

import "./PreEventBriefPanel.css";

type PreEventBriefPanelProps = {
  intelligence:
    PreEventIntelligence;

  onUseInGenerator:
    () => void;
};

function journeyLabel(
  value:
    PreEventJourneyRecommendation,
): string {
  if (
    value ===
    "progressive-build"
  ) {
    return "Progressive Build";
  }

  if (
    value ===
    "long-warmup"
  ) {
    return "Long Warm Up";
  }

  if (
    value ===
    "peak-heavy"
  ) {
    return "Peak Heavy";
  }

  if (
    value ===
    "smooth-wave"
  ) {
    return "Smooth Wave";
  }

  return "Warm Up → Peak → Release";
}

export default function PreEventBriefPanel({
  intelligence,
  onUseInGenerator,
}: PreEventBriefPanelProps) {
  return (
    <section className="pre-event-brief">
      <header>
        <div>
          <BrainCircuit size={16} />

          <div>
            <span>
              Before the first track
            </span>
            <strong>
              Pre-Event Intelligence
            </strong>
          </div>
        </div>

        <b>
          {
            intelligence.readinessScore
          }
          % ready
        </b>
      </header>

      <div className="pre-event-brief__facts">
        <article>
          <History size={13} />
          <span>Sessions</span>
          <strong>
            {
              intelligence.sessionsAnalyzed
            }
          </strong>
        </article>

        <article>
          <Music2 size={13} />
          <span>Tracks analyzed</span>
          <strong>
            {
              intelligence.totalTracksPlayed
            }
          </strong>
        </article>

        <article>
          <Gauge size={13} />
          <span>Starting BPM</span>
          <strong>
            {intelligence.recommendedStartingBpm
              ? `${intelligence.recommendedStartingBpm.minimum}–${intelligence.recommendedStartingBpm.maximum}`
              : "More data"}
          </strong>
        </article>

        <article>
          <Sparkles size={13} />
          <span>Journey</span>
          <strong>
            {journeyLabel(
              intelligence.recommendedJourney,
            )}
          </strong>
        </article>
      </div>

      {intelligence.strongestGenres.length >
        0 && (
        <section className="pre-event-brief__genres">
          <header>
            Strong historical styles
          </header>

          <div>
            {intelligence.strongestGenres.map(
              (genre) => (
                <article key={genre.genre}>
                  <strong>
                    {genre.genre}
                  </strong>
                  <span>
                    {genre.score}/100
                  </span>
                  <small>
                    {
                      genre.positiveResponses
                    }{" "}
                    positive ·{" "}
                    {
                      genre.losingCrowdResponses
                    }{" "}
                    losing
                  </small>
                </article>
              ),
            )}
          </div>
        </section>
      )}

      <div className="pre-event-brief__track-groups">
        <section>
          <header>
            <Star size={12} />
            Reliable tracks
          </header>

          {intelligence.reliableTracks.length ===
          0 ? (
            <p>
              No reliable tracks identified yet.
            </p>
          ) : (
            intelligence.reliableTracks
              .slice(0, 5)
              .map((track) => (
                <article
                  key={track.trackId}
                >
                  <div>
                    <strong>
                      {track.title}
                    </strong>
                    <small>
                      {track.artist}
                    </small>
                  </div>
                  <b>
                    {track.crowdScore}
                  </b>
                </article>
              ))
          )}
        </section>

        <section>
          <header>
            <LifeBuoy size={12} />
            Crowd rescue
          </header>

          {intelligence.crowdRescueTracks.length ===
          0 ? (
            <p>
              No crowd-rescue pattern identified yet.
            </p>
          ) : (
            intelligence.crowdRescueTracks
              .slice(0, 5)
              .map((track) => (
                <article
                  key={track.trackId}
                >
                  <div>
                    <strong>
                      {track.title}
                    </strong>
                    <small>
                      {track.artist}
                    </small>
                  </div>
                  <b>
                    {track.rescueCount} rescue
                  </b>
                </article>
              ))
          )}
        </section>
      </div>

      <button
        className="pre-event-brief__generator-button"
        type="button"
        onClick={
          onUseInGenerator
        }
      >
        <WandSparkles
          size={13}
        />
        Use Pre-Event Plan in Generate Set
      </button>

      {intelligence.notes.length > 0 && (
        <footer>
          {intelligence.notes.map(
            (note, index) => (
              <p
                key={`${index}-${note}`}
              >
                {note}
              </p>
            ),
          )}
        </footer>
      )}
    </section>
  );
}
