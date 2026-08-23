import {
  Database,
  RefreshCw,
  X,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "../../api/supabaseClient";

import "./PendingEditsPanel.css";

type PendingEdit = {
  id: number;
  song_id: string;
  master_changes:
    Record<string, unknown>;
  dj_changes:
    Record<string, unknown>;
  status: string;
  updated_at: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function PendingEditsPanel({
  isOpen,
  onClose,
}: Props) {
  const [
    edits,
    setEdits,
  ] = useState<PendingEdit[]>([]);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function load() {
    setLoading(true);
    setMessage("");

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "pending_track_edits",
        )
        .select(
          "id,song_id,master_changes,dj_changes,status,updated_at",
        )
        .in(
          "status",
          [
            "pending",
            "error",
          ],
        )
        .order(
          "updated_at",
          {
            ascending:
              false,
          },
        )
        .limit(200);

    if (error) {
      setMessage(
        error.message,
      );
    } else {
      setEdits(
        (data ?? []) as PendingEdit[],
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [
    isOpen,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="pending-edits-backdrop"
      onMouseDown={onClose}
    >
      <section
        className="pending-edits-panel"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header>
          <div>
            <Database size={17} />

            <span>
              <strong>
                Pending DB edits
              </strong>

              <small>
                Changes waiting to be applied to MASTER_CLEAN.db / DJ.db.
              </small>
            </span>
          </div>

          <div>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void load()
              }
            >
              <RefreshCw size={14} />
            </button>

            <button
              type="button"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="pending-edits-list">
          {edits.map(
            (edit) => (
              <article
                key={edit.id}
              >
                <div>
                  <strong>
                    SongID {edit.song_id}
                  </strong>

                  <span>
                    {edit.status}
                  </span>
                </div>

                {Object.keys(
                  edit.master_changes ??
                    {},
                ).length > 0 && (
                  <pre>
                    MASTER {JSON.stringify(
                      edit.master_changes,
                      null,
                      2,
                    )}
                  </pre>
                )}

                {Object.keys(
                  edit.dj_changes ??
                    {},
                ).length > 0 && (
                  <pre>
                    DJ {JSON.stringify(
                      edit.dj_changes,
                      null,
                      2,
                    )}
                  </pre>
                )}
              </article>
            ),
          )}

          {!loading &&
            edits.length ===
              0 && (
            <p>
              No pending edits.
            </p>
          )}

          {message && (
            <p>
              {message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
