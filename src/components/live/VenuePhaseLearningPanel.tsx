import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flame,
  Info,
  LifeBuoy,
  Music2,
  Star,
} from "lucide-react";

import type {
  VenuePhaseLearningSummary,
} from "../../types/venuePhaseLearning";

import "./VenuePhaseLearningPanel.css";

type VenuePhaseLearningPanelProps = {
  summary:
    VenuePhaseLearningSummary;
};

function metric(
  value: number | null,
  suffix = "",
): string {
  return value ===
    null
    ? "—"
    : `${Math.round(
        value,
      )}${suffix}`;
}

export default function VenuePhaseLearningPanel({
  summary,
}: VenuePhaseLearningPanelProps) {
  const profileName =
    summary.profile?.name ??
    "Global / No Venue";

  return (
    <section className="venue-phase-learning">
      <header>
        <div>
          <Clock3
            size={16}
          />

          <div>
            <span>
              Sequence-phase learning
            </span>

            <strong>
              Time-of-Night Learning
            </strong>
          </div>
        </div>

        <b>
          {profileName}
        </b>
      </header>

      <div className="venue-phase-learning__insights">
        {summary.insights.map(
          (insight) => (
            <article
              className={`venue-phase-insight venue-phase-insight--${insight.type}`}
              key={
                insight.id
              }
            >
              {insight.type ===
              "positive" ? (
                <CheckCircle2
                  size={14}
                />
              ) : insight.type ===
                "warning" ? (
                <AlertTriangle
                  size={14}
                />
              ) : (
                <Info
                  size={14}
                />
              )}

              <div>
                <strong>
                  {
                    insight.title
                  }
                </strong>

                <p>
                  {
                    insight.detail
                  }
                </p>
              </div>
            </article>
          ),
        )}
      </div>

      <div className="venue-phase-learning__grid">
        {summary.phases.map(
          (phase) => (
            <article
              className="venue-phase-card"
              key={
                phase.phase.id
              }
            >
              <header>
                <span>
                  {
                    phase.phase.label
                  }
                </span>

                <strong>
                  {phase.crowdScore ===
                  null
                    ? "—"
                    : `${phase.crowdScore}/100`}
                </strong>
              </header>

              <div className="venue-phase-card__facts">
                <span>
                  <Activity
                    size={11}
                  />
                  {phase.strongestBpmRange ??
                    `${metric(
                      phase.averageBpm,
                    )} BPM`}
                </span>

                <span>
                  <Flame
                    size={11}
                  />
                  Energy{" "}
                  {metric(
                    phase.averageEnergy,
                  )}
                </span>

                <span>
                  <Music2
                    size={11}
                  />
                  {
                    phase.trackCount
                  }{" "}
                  tracks
                </span>
              </div>

              {phase.strongestGenres.length >
                0 && (
                <div className="venue-phase-card__genres">
                  {phase.strongestGenres
                    .slice(
                      0,
                      3,
                    )
                    .map(
                      (genre) => (
                        <span
                          key={
                            genre.genre
                          }
                        >
                          {
                            genre.genre
                          }{" "}
                          {
                            genre.score
                          }
                        </span>
                      ),
                    )}
                </div>
              )}

              <div className="venue-phase-card__track-signals">
                <span>
                  <Star
                    size={10}
                  />
                  {
                    phase.reliableTracks.length
                  }{" "}
                  reliable
                </span>

                <span>
                  <LifeBuoy
                    size={10}
                  />
                  {
                    phase.crowdRescueTracks.length
                  }{" "}
                  rescue
                </span>

                <span>
                  <AlertTriangle
                    size={10}
                  />
                  {
                    phase.tracksToReview.length
                  }{" "}
                  review
                </span>
              </div>

              {phase.reliableTracks[0] && (
                <footer>
                  <small>
                    Best reliable:
                  </small>

                  <strong>
                    {
                      phase.reliableTracks[0]
                        .title
                    }
                  </strong>

                  <span>
                    {
                      phase.reliableTracks[0]
                        .artist
                    }
                  </span>
                </footer>
              )}
            </article>
          ),
        )}
      </div>

      <footer className="venue-phase-learning__footer">
        <Info
          size={11}
        />

        <span>
          V1 approximates time-of-night from track position in the set:
          Opening 0–20%, Warm Up 20–40%, Build 40–60%, Peak 60–85%,
          Release/Late 85–100%.
        </span>
      </footer>
    </section>
  );
}
