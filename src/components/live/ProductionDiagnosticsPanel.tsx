import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";

import {
  useProductionDiagnostics,
} from "../../hooks/useProductionDiagnostics";

import "./ProductionDiagnosticsPanel.css";

export default function ProductionDiagnosticsPanel() {
  const {
    report,
    migration,
    recovery,
    refresh,
    restoreRecovery,
    clearRecovery,
  } =
    useProductionDiagnostics();

  if (!report) {
    return null;
  }

  return (
    <section className="production-diagnostics">
      <header>
        <div>
          <ShieldCheck size={16} />

          <div>
            <span>
              Production readiness
            </span>

            <strong>
              System Diagnostics
            </strong>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </header>

      <div className="production-diagnostics__grid">
        {report.items.map((item) => (
          <article
            key={item.id}
            className={`production-diagnostics__item production-diagnostics__item--${item.level}`}
          >
            {item.level === "ok" ? (
              <CheckCircle2 size={13} />
            ) : item.level === "warning" ? (
              <AlertTriangle size={13} />
            ) : (
              <XCircle size={13} />
            )}

            <div>
              <strong>
                {item.label}
              </strong>

              <p>
                {item.detail}
              </p>
            </div>
          </article>
        ))}
      </div>

      {migration &&
        migration.migrated && (
        <p className="production-diagnostics__migration">
          Storage migrated from v{migration.fromVersion} to v{migration.toVersion}.
        </p>
      )}

      {recovery && (
        <div className="production-diagnostics__recovery">
          <div>
            <strong>
              Recovery checkpoint available
            </strong>

            <span>
              {new Date(
                recovery.createdAt,
              ).toLocaleString()}
              {" · "}
              {recovery.reason}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const confirmed =
                window.confirm(
                  "Restore the local state from the last recovery checkpoint?",
                );

              if (confirmed) {
                restoreRecovery();
              }
            }}
          >
            <Undo2 size={12} />
            Restore checkpoint
          </button>

          <button
            type="button"
            onClick={clearRecovery}
          >
            Clear
          </button>
        </div>
      )}

      <footer>
        Storage schema v{report.storageSchemaVersion}
        {" · "}
        {(
          report.localStorageBytes /
          1024 /
          1024
        ).toFixed(2)} MB
        {" · "}
        {report.localStorageEntries} entries
      </footer>
    </section>
  );
}
