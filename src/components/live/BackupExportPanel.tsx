import {
  Archive,
  Download,
  FileJson,
  FileSpreadsheet,
  RotateCcw,
  Upload,
} from "lucide-react";

import {
  useRef,
  useState,
} from "react";

import {
  useBackupRestore,
} from "../../hooks/useBackupRestore";

import {
  exportCurrentSet,
  exportEventPlan,
  exportPerformanceHistory,
} from "../../utils/flamingoExportService";

import "./BackupExportPanel.css";

type ExportMessage = {
  type: "success" | "error";
  text: string;
};

export default function BackupExportPanel() {
  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const {
    busy,
    validation,
    selectedFileName,
    exportBackup,
    inspectBackup,
    restore,
    clearSelection,
  } = useBackupRestore();

  const [
    message,
    setMessage,
  ] = useState<ExportMessage | null>(
    null,
  );

  function runExport(
    label: string,
    operation: () => {
      filename: string;
      rowCount: number;
    },
  ) {
    try {
      const result = operation();

      setMessage({
        type: "success",
        text:
          `${label}: ${result.rowCount} row${
            result.rowCount === 1
              ? ""
              : "s"
          } exported.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Export failed.",
      });
    }
  }

  async function handleFile(
    file: File | undefined,
  ) {
    if (!file) {
      return;
    }

    setMessage(null);
    await inspectBackup(file);
  }

  function handleRestore() {
    if (
      !validation?.valid ||
      !validation.backup
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Restore this Flamingo backup? Supported local data will be overwritten.",
    );

    if (!confirmed) {
      return;
    }

    const result = restore();

    if (!result) {
      return;
    }

    window.alert(
      `Backup restored. ${result.restored} sections restored and ${result.removed} empty sections removed. Flamingo will now reload.`,
    );

    window.location.reload();
  }

  return (
    <section className="backup-export-panel">
      <header>
        <div>
          <Archive size={16} />

          <div>
            <span>
              Portability & recovery
            </span>
            <strong>
              Backup / Restore / Export
            </strong>
          </div>
        </div>

        <small>
          Local + Cloud safety layer
        </small>
      </header>

      <div className="backup-export-panel__backup">
        <article>
          <FileJson size={14} />

          <div>
            <strong>
              Full Flamingo Backup
            </strong>
            <p>
              Download Event Profiles, Performance History,
              Current Set, Event Plan, Live state and UI preferences
              as one versioned JSON file.
            </p>
          </div>

          <button
            type="button"
            onClick={exportBackup}
          >
            <Download size={12} />
            Download Backup
          </button>
        </article>

        <article>
          <Upload size={14} />

          <div>
            <strong>
              Restore Backup
            </strong>
            <p>
              Flamingo validates the file before replacing
              supported localStorage sections.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            <Upload size={12} />
            Select Backup
          </button>

          <input
            ref={fileInputRef}
            className="backup-export-panel__file-input"
            type="file"
            accept=".json,application/json"
            onChange={(event) =>
              void handleFile(
                event.target.files?.[0],
              )
            }
          />
        </article>
      </div>

      {selectedFileName &&
        validation && (
        <div
          className={
            validation.valid
              ? "backup-export-panel__validation"
              : "backup-export-panel__validation backup-export-panel__validation--error"
          }
        >
          <div>
            <strong>
              {selectedFileName}
            </strong>
            <span>
              {validation.valid
                ? "Backup validated"
                : "Backup rejected"}
            </span>
          </div>

          {validation.errors.map(
            (error, index) => (
              <p key={`error-${index}`}>
                {error}
              </p>
            ),
          )}

          {validation.warnings.map(
            (warning, index) => (
              <p key={`warning-${index}`}>
                {warning}
              </p>
            ),
          )}

          <div className="backup-export-panel__validation-actions">
            <button
              type="button"
              disabled={!validation.valid}
              onClick={handleRestore}
            >
              <RotateCcw size={12} />
              Restore
            </button>

            <button
              type="button"
              onClick={clearSelection}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <section className="backup-export-panel__exports">
        <header>
          <span>Data Exports</span>
          <strong>
            Reports & Set Data
          </strong>
        </header>

        <div>
          <article>
            <FileSpreadsheet size={13} />
            <strong>
              Performance History
            </strong>
            <span>
              Session-level analytics
            </span>

            <div>
              <button
                type="button"
                onClick={() =>
                  runExport(
                    "Performance JSON",
                    () =>
                      exportPerformanceHistory(
                        "json",
                      ),
                  )
                }
              >
                JSON
              </button>

              <button
                type="button"
                onClick={() =>
                  runExport(
                    "Performance CSV",
                    () =>
                      exportPerformanceHistory(
                        "csv",
                      ),
                  )
                }
              >
                CSV
              </button>
            </div>
          </article>

          <article>
            <FileSpreadsheet size={13} />
            <strong>
              Current Set
            </strong>
            <span>
              Current running setlist
            </span>

            <div>
              <button
                type="button"
                onClick={() =>
                  runExport(
                    "Current Set JSON",
                    () =>
                      exportCurrentSet(
                        "json",
                      ),
                  )
                }
              >
                JSON
              </button>

              <button
                type="button"
                onClick={() =>
                  runExport(
                    "Current Set CSV",
                    () =>
                      exportCurrentSet(
                        "csv",
                      ),
                  )
                }
              >
                CSV
              </button>
            </div>
          </article>

          <article>
            <FileSpreadsheet size={13} />
            <strong>
              Event Plan
            </strong>
            <span>
              Event / journey blocks
            </span>

            <div>
              <button
                type="button"
                onClick={() =>
                  runExport(
                    "Event Plan JSON",
                    () =>
                      exportEventPlan(
                        "json",
                      ),
                  )
                }
              >
                JSON
              </button>

              <button
                type="button"
                onClick={() =>
                  runExport(
                    "Event Plan CSV",
                    () =>
                      exportEventPlan(
                        "csv",
                      ),
                  )
                }
              >
                CSV
              </button>
            </div>
          </article>
        </div>
      </section>

      {message && (
        <footer
          className={
            message.type === "error"
              ? "backup-export-panel__message backup-export-panel__message--error"
              : "backup-export-panel__message"
          }
        >
          {message.text}
        </footer>
      )}
    </section>
  );
}
