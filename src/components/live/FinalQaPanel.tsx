import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  RotateCcw,
  SkipForward,
  XCircle,
} from "lucide-react";

import type {
  QaCategory,
  QaStatus,
} from "../../types/finalQa";

import {
  useFinalQa,
} from "../../hooks/useFinalQa";

import "./FinalQaPanel.css";

const CATEGORY_LABELS: Record<QaCategory, string> = {
  "core-flow": "Core Flow",
  persistence: "Persistence",
  ui: "UI / UX",
  responsive: "Responsive",
  performance: "Performance",
  production: "Production",
  "real-world": "Real-World DJ Test",
};

const CATEGORY_ORDER: QaCategory[] = [
  "core-flow",
  "persistence",
  "ui",
  "responsive",
  "performance",
  "production",
  "real-world",
];

function StatusIcon({
  status,
}: {
  status: QaStatus;
}) {
  if (status === "passed") {
    return <CheckCircle2 size={13} />;
  }

  if (status === "failed") {
    return <XCircle size={13} />;
  }

  if (status === "skipped") {
    return <SkipForward size={13} />;
  }

  return <Circle size={13} />;
}

export default function FinalQaPanel() {
  const {
    items,
    progress,
    setStatus,
    setNotes,
    reset,
  } = useFinalQa();

  return (
    <section className="final-qa-panel">
      <header>
        <div>
          <ClipboardCheck size={16} />

          <div>
            <span>
              Final release pass
            </span>
            <strong>
              QA & Polish Checklist
            </strong>
          </div>
        </div>

        <div className="final-qa-panel__summary">
          <b>
            {progress.completionPercentage}% complete
          </b>
          <small>
            {progress.passed} passed · {progress.failed} failed · {progress.pending} pending
          </small>
        </div>
      </header>

      <div className="final-qa-panel__progress">
        <span
          style={{
            width: `${progress.completionPercentage}%`,
          }}
        />
      </div>

      {CATEGORY_ORDER.map((category) => {
        const categoryItems = items.filter(
          (item) =>
            item.category === category,
        );

        return (
          <section
            className="final-qa-category"
            key={category}
          >
            <header>
              {CATEGORY_LABELS[category]}
            </header>

            <div>
              {categoryItems.map((item) => (
                <article
                  className={`final-qa-item final-qa-item--${item.status}`}
                  key={item.id}
                >
                  <div className="final-qa-item__status-icon">
                    <StatusIcon status={item.status} />
                  </div>

                  <div className="final-qa-item__content">
                    <strong>
                      {item.title}
                    </strong>

                    <p>
                      {item.description}
                    </p>

                    <textarea
                      value={item.notes}
                      placeholder="Optional QA notes / bug details..."
                      onChange={(event) =>
                        setNotes(
                          item.id,
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="final-qa-item__actions">
                    <button
                      type="button"
                      className={item.status === "passed" ? "is-active" : ""}
                      onClick={() =>
                        setStatus(item.id, "passed")
                      }
                    >
                      Pass
                    </button>

                    <button
                      type="button"
                      className={item.status === "failed" ? "is-active is-failed" : ""}
                      onClick={() =>
                        setStatus(item.id, "failed")
                      }
                    >
                      Fail
                    </button>

                    <button
                      type="button"
                      className={item.status === "skipped" ? "is-active" : ""}
                      onClick={() =>
                        setStatus(item.id, "skipped")
                      }
                    >
                      Skip
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setStatus(item.id, "pending")
                      }
                    >
                      Reset
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <footer>
        <span>
          Run this checklist before each release. Any FAIL becomes a targeted bug fix.
        </span>

        <button
          type="button"
          onClick={() => {
            const confirmed = window.confirm(
              "Reset the entire Final QA checklist?",
            );

            if (confirmed) {
              reset();
            }
          }}
        >
          <RotateCcw size={12} />
          Reset QA
        </button>
      </footer>
    </section>
  );
}
