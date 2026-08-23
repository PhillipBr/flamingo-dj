import {
  AlertTriangle,
  Flame,
  LifeBuoy,
  Music2,
  Star,
} from "lucide-react";

import type {
  TrackPerformanceRecord,
} from "../../types/trackPerformance";

import "./TrackPerformancePanel.css";

type TrackPerformancePanelProps = {
  tracks:
    readonly TrackPerformanceRecord[];
};

function roleLabel(
  role:
    TrackPerformanceRecord["role"],
): string {
  if (
    role ===
    "reliable-hit"
  ) {
    return "Reliable";
  }

  if (
    role ===
    "crowd-rescue"
  ) {
    return "Crowd Rescue";
  }

  if (
    role ===
    "needs-review"
  ) {
    return "Review";
  }

  if (
    role ===
    "steady"
  ) {
    return "Steady";
  }

  return "More data";
}

function RoleIcon({
  role,
}: {
  role:
    TrackPerformanceRecord["role"];
}) {
  if (
    role ===
    "reliable-hit"
  ) {
    return (
      <Star
        size={12}
      />
    );
  }

  if (
    role ===
    "crowd-rescue"
  ) {
    return (
      <LifeBuoy
        size={12}
      />
    );
  }

  if (
    role ===
    "needs-review"
  ) {
    return (
      <AlertTriangle
        size={12}
      />
    );
  }

  return (
    <Flame
      size={12}
    />
  );
}

export default function TrackPerformancePanel({
  tracks,
}: TrackPerformancePanelProps) {
  const usefulTracks =
    tracks.filter(
      (track) =>
        track.crowdResponses >
          0 ||
        track.plays >=
          2,
    );

  return (
    <section className="track-performance-panel">
      <header>
        <div>
          <Music2
            size={14}
          />

          <div>
            <span>
              Cross-session analytics
            </span>

            <strong>
              Track Performance
            </strong>
          </div>
        </div>

        <small>
          {
            usefulTracks.length
          }{" "}
          tracks with history
        </small>
      </header>

      {usefulTracks.length ===
      0 ? (
        <div className="track-performance-panel__empty">
          Record Audience Response during multiple Live sessions to build track-level performance history.
        </div>
      ) : (
        <div className="track-performance-panel__table">
          <div className="track-performance-panel__row track-performance-panel__row--header">
            <span>
              Track
            </span>
            <span>
              Plays
            </span>
            <span>
              Crowd
            </span>
            <span>
              G / Good / N / Lose
            </span>
            <span>
              Role
            </span>
          </div>

          {usefulTracks
            .slice(
              0,
              25,
            )
            .map(
              (track) => (
                <div
                  className="track-performance-panel__row"
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

                  <span>
                    {
                      track.plays
                    }
                  </span>

                  <b>
                    {
                      track.crowdScore
                    }
                  </b>

                  <span>
                    {
                      track.great
                    }
                    {" / "}
                    {
                      track.good
                    }
                    {" / "}
                    {
                      track.neutral
                    }
                    {" / "}
                    {
                      track.losingCrowd
                    }
                  </span>

                  <span className={`track-performance-role track-performance-role--${track.role}`}>
                    <RoleIcon
                      role={
                        track.role
                      }
                    />
                    {roleLabel(
                      track.role,
                    )}
                  </span>
                </div>
              ),
            )}
        </div>
      )}
    </section>
  );
}
