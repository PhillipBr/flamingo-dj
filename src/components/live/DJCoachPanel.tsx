import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Gauge,
  Info,
  Music2,
} from "lucide-react";

import type {
  DJCoachSummary,
} from "../../types/djCoach";

import "./DJCoachPanel.css";

type DJCoachPanelProps = {
  coach:
    DJCoachSummary;
};

function formatScore(
  value: number | null,
): string {
  return value ===
    null
    ? "—"
    : `${Math.round(
        value,
      )}/100`;
}

export default function DJCoachPanel({
  coach,
}: DJCoachPanelProps) {
  return (
    <section className="dj-coach-panel">
      <header>
        <div>
          <BrainCircuit
            size={16}
          />

          <div>
            <span>
              Historical learning
            </span>

            <strong>
              DJ Coach
            </strong>
          </div>
        </div>

        <small>
          {
            coach.sessionsAnalyzed
          }{" "}
          sessions analyzed
        </small>
      </header>

      <div className="dj-coach-panel__facts">
        <article>
          <Gauge
            size={13}
          />
          <span>
            Avg performance
          </span>
          <strong>
            {formatScore(
              coach.averagePerformanceScore,
            )}
          </strong>
        </article>

        <article>
          <Music2
            size={13}
          />
          <span>
            Tracks analyzed
          </span>
          <strong>
            {
              coach.totalPlayedTracks
            }
          </strong>
        </article>

        <article>
          <Gauge
            size={13}
          />
          <span>
            Strong BPM zone
          </span>
          <strong>
            {coach.strongestBpmRange ??
              "More data needed"}
          </strong>
        </article>
      </div>

      <div className="dj-coach-panel__insights">
        {coach.insights.map(
          (insight) => (
            <article
              className={`dj-coach-insight dj-coach-insight--${insight.type}`}
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

      {coach.strongestGenres.length >
        0 && (
        <div className="dj-coach-panel__genres">
          <header>
            <span>
              Strongest recorded styles
            </span>
          </header>

          <div>
            {coach.strongestGenres.map(
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
                    {
                      genre.score
                    }
                    /100
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
        </div>
      )}
    </section>
  );
}
