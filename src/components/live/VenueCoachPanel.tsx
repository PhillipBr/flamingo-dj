import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Gauge,
  Info,
  LifeBuoy,
  Music2,
  Star,
} from "lucide-react";

import type {
  VenueSpecificCoachSummary,
} from "../../types/venueCoach";

import "./VenueCoachPanel.css";

type VenueCoachPanelProps = {
  summary:
    VenueSpecificCoachSummary;
};

function scoreLabel(
  value: number | null,
): string {
  return value ===
    null
    ? "—"
    : `${Math.round(
        value,
      )}/100`;
}

export default function VenueCoachPanel({
  summary,
}: VenueCoachPanelProps) {
  const profileName =
    summary.profile?.name ??
    "Global / No Venue";

  return (
    <section className="venue-coach-panel">
      <header>
        <div>
          <Building2
            size={16}
          />

          <div>
            <span>
              Venue-specific learning
            </span>

            <strong>
              Venue Coach
            </strong>
          </div>
        </div>

        <b>
          {profileName}
        </b>
      </header>

      <div className="venue-coach-panel__facts">
        <article>
          <BarChart3
            size={13}
          />
          <span>
            Venue performance
          </span>
          <strong>
            {scoreLabel(
              summary.venueAveragePerformance,
            )}
          </strong>
        </article>

        <article>
          <BarChart3
            size={13}
          />
          <span>
            Global performance
          </span>
          <strong>
            {scoreLabel(
              summary.globalAveragePerformance,
            )}
          </strong>
        </article>

        <article>
          <Gauge
            size={13}
          />
          <span>
            Best BPM here
          </span>
          <strong>
            {summary.bpmComparison.venueRange ??
              "More data"}
          </strong>
        </article>

        <article>
          <Gauge
            size={13}
          />
          <span>
            Global BPM
          </span>
          <strong>
            {summary.bpmComparison.globalRange ??
              "More data"}
          </strong>
        </article>
      </div>

      <div className="venue-coach-panel__insights">
        {summary.insights.map(
          (insight) => (
            <article
              className={`venue-coach-insight venue-coach-insight--${insight.type}`}
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

      {summary.genreComparisons.length >
        0 && (
        <section className="venue-coach-panel__genres">
          <header>
            <span>
              Venue vs Global styles
            </span>
          </header>

          <div>
            {summary.genreComparisons.map(
              (genre) => (
                <article
                  key={
                    genre.genre
                  }
                >
                  <strong>
                    {
                      genre.genre
                    }
                  </strong>

                  <span>
                    Venue{" "}
                    {genre.venueScore ??
                      "—"}
                    {" · "}
                    Global{" "}
                    {genre.globalScore ??
                      "—"}
                  </span>

                  <small>
                    {genre.difference ===
                    null
                      ? "No direct comparison"
                      : `${genre.difference >=
                        0
                          ? "+"
                          : ""}${genre.difference} points`}
                  </small>
                </article>
              ),
            )}
          </div>
        </section>
      )}

      <div className="venue-coach-panel__track-groups">
        <section>
          <header>
            <Star
              size={12}
            />
            Venue-specific reliable
          </header>

          {summary.venueSpecificReliableTracks.length ===
          0 ? (
            <p>
              No venue-specific reliable track identified yet.
            </p>
          ) : (
            summary.venueSpecificReliableTracks
              .slice(
                0,
                5,
              )
              .map(
                (track) => (
                  <article
                    key={
                      track.trackId
                    }
                  >
                    <div>
                      <strong>
                        {
                          track.title
                        }
                      </strong>

                      <small>
                        {
                          track.artist
                        }
                      </small>
                    </div>

                    <b>
                      {
                        track.crowdScore
                      }
                    </b>
                  </article>
                ),
              )
          )}
        </section>

        <section>
          <header>
            <LifeBuoy
              size={12}
            />
            Crowd rescue here
          </header>

          {summary.venueCrowdRescueTracks.length ===
          0 ? (
            <p>
              No crowd-rescue pattern recorded for this venue.
            </p>
          ) : (
            summary.venueCrowdRescueTracks
              .slice(
                0,
                5,
              )
              .map(
                (track) => (
                  <article
                    key={
                      track.trackId
                    }
                  >
                    <div>
                      <strong>
                        {
                          track.title
                        }
                      </strong>

                      <small>
                        {
                          track.artist
                        }
                      </small>
                    </div>

                    <b>
                      {
                        track.rescueCount
                      }
                    </b>
                  </article>
                ),
              )
          )}
        </section>
      </div>

      <footer>
        <Music2
          size={12}
        />

        <span>
          {
            summary.venueSessions
          }{" "}
          venue sessions vs{" "}
          {
            summary.globalSessions
          }{" "}
          global sessions
        </span>
      </footer>
    </section>
  );
}
