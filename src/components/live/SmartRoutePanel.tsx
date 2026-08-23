import {
  ArrowRight,
  Gauge,
  ListPlus,
  Music2,
  Replace,
  Route,
  Sparkles,
  Zap,
} from "lucide-react";

import type {
  SmartRoute,
  SmartRoutePlan,
} from "../../types/smartRoute";

import {
  getTrackCamelot,
} from "../../utils/matchSongs";

import "./SmartRoutePanel.css";

type SmartRoutePanelProps = {
  plan: SmartRoutePlan;

  onUseRoute: (
    route: SmartRoute,
  ) => void;

  onAddRoute: (
    route: SmartRoute,
  ) => void;

  onReplaceUpcoming: (
    route: SmartRoute,
  ) => void;
};

function formatBpm(
  value: number | null,
): string {
  return value === null
    ? "—"
    : `${Math.round(
        value,
      )} BPM`;
}

function formatEnergy(
  value: number | null,
): string {
  return value === null
    ? "—"
    : value.toFixed(1);
}

export default function SmartRoutePanel({
  plan,
  onUseRoute,
  onAddRoute,
  onReplaceUpcoming,
}: SmartRoutePanelProps) {
  return (
    <section className="smart-route-panel">
      <header>
        <div>
          <Route size={18} />

          <div>
            <span>
              Transition Engine
            </span>

            <h2>
              Smart Routes
            </h2>
          </div>
        </div>

        <small>
          Looking{" "}
          {plan.routeLength}{" "}
          tracks ahead
        </small>
      </header>

      {plan.routes.length ===
      0 ? (
        <div className="smart-route-panel__empty">
          <Music2 size={28} />

          <strong>
            No route available
          </strong>

          <p>
            Start the live set and
            Flamingo will build
            multi-track transition
            routes.
          </p>
        </div>
      ) : (
        <div className="smart-route-panel__routes">
          {plan.routes.map(
            (
              route,
              routeIndex,
            ) => (
              <article
                className="smart-route-card"
                key={route.id}
              >
                <header>
                  <div>
                    <span>
                      Route{" "}
                      {String.fromCharCode(
                        65 +
                          routeIndex,
                      )}
                    </span>

                    <strong>
                      {
                        route.title
                      }
                    </strong>
                  </div>

                  <b>
                    {
                      route.percentage
                    }
                    %
                  </b>
                </header>

                <p>
                  {
                    route.description
                  }
                </p>

                <div className="smart-route-card__summary">
                  <span>
                    <Gauge
                      size={11}
                    />
                    {formatBpm(
                      route.startBpm,
                    )}
                    <ArrowRight
                      size={10}
                    />
                    {formatBpm(
                      route.endBpm,
                    )}
                  </span>

                  <span>
                    <Zap
                      size={11}
                    />
                    Energy{" "}
                    {formatEnergy(
                      route.startEnergy,
                    )}
                    <ArrowRight
                      size={10}
                    />
                    {formatEnergy(
                      route.endEnergy,
                    )}
                  </span>

                  {route.targetGenre && (
                    <span>
                      <Sparkles
                        size={11}
                      />
                      {
                        route.targetGenre
                      }
                    </span>
                  )}
                </div>

                <div className="smart-route-card__steps">
                  {route.steps.map(
                    (
                      step,
                    ) => (
                      <div
                        className="smart-route-step"
                        key={
                          step.track.id
                        }
                      >
                        <span className="smart-route-step__position">
                          {
                            step.position
                          }
                        </span>

                        <div className="smart-route-step__track">
                          <strong>
                            {
                              step.track.title
                            }
                          </strong>

                          <small>
                            {
                              step.track.artist
                            }
                          </small>

                          <small>
                            {step.track
                              .tempo !==
                            null
                              ? `${Math.round(
                                  step.track
                                    .tempo,
                                )} BPM`
                              : "— BPM"}{" "}
                            · Key{" "}
                            {step.track
                              .musicalKey ??
                              "—"}{" "}
                            ·{" "}
                            {getTrackCamelot(
                              step.track,
                            ) ??
                              "—"}{" "}
                            · Energy{" "}
                            {step.track
                              .energy ??
                              "—"}
                          </small>
                        </div>

                        <b>
                          {
                            step.transitionPercentage
                          }
                          %
                        </b>
                      </div>
                    ),
                  )}
                </div>

                <div className="smart-route-card__actions">
                  <button
                    type="button"
                    onClick={() =>
                      onUseRoute(
                        route,
                      )
                    }
                  >
                    <Route
                      size={12}
                    />
                    Use route
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onReplaceUpcoming(
                        route,
                      )
                    }
                  >
                    <Replace
                      size={12}
                    />
                    Replace upcoming
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAddRoute(
                        route,
                      )
                    }
                  >
                    <ListPlus
                      size={12}
                    />
                    Add to set
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}
