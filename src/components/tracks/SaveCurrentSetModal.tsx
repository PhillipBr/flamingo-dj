import {
  ListMusic,
  Save,
  X,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import "./SaveCurrentSetModal.css";

type SaveCurrentSetModalProps = {
  isOpen: boolean;
  trackCount: number;
  defaultName: string;

  onClose: () => void;

  onSave: (
    name: string,
    description: string,
    category: string,
  ) => void;
};

export default function SaveCurrentSetModal({
  isOpen,
  trackCount,
  defaultName,
  onClose,
  onSave,
}: SaveCurrentSetModalProps) {
  const [
    name,
    setName,
  ] = useState(
    defaultName,
  );

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("DJ Set");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName(
      defaultName,
    );

    setDescription("");
    setCategory("DJ Set");
  }, [
    defaultName,
    isOpen,
  ]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit() {
    const normalizedName =
      name.trim();

    if (!normalizedName) {
      window.alert(
        "Enter a playlist name.",
      );

      return;
    }

    onSave(
      normalizedName,
      description.trim(),
      category.trim() ||
        "DJ Set",
    );
  }

  return (
    <div
      className="save-current-set-backdrop"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="save-current-set-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Save Current Set as playlist"
      >
        <header className="save-current-set-modal__header">
          <div>
            <p>
              <ListMusic
                size={14}
              />
              Current Set
            </p>

            <h2>
              Save as playlist
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close save playlist"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="save-current-set-modal__body">
          <div className="save-current-set-modal__summary">
            <strong>
              {trackCount}
            </strong>

            <span>
              {trackCount === 1
                ? "track"
                : "tracks"}{" "}
              will be saved in
              their current order.
            </span>
          </div>

          <label>
            <span>
              Playlist name
            </span>

            <input
              autoFocus
              type="text"
              value={name}
              placeholder="Friday Night Set"
              onChange={(
                event,
              ) =>
                setName(
                  event.target
                    .value,
                )
              }
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  handleSubmit();
                }
              }}
            />
          </label>

          <label>
            <span>
              Category
            </span>

            <input
              type="text"
              value={category}
              placeholder="DJ Set"
              onChange={(
                event,
              ) =>
                setCategory(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <label>
            <span>
              Description
            </span>

            <textarea
              value={
                description
              }
              placeholder="Optional notes about the set..."
              rows={4}
              onChange={(
                event,
              ) =>
                setDescription(
                  event.target
                    .value,
                )
              }
            />
          </label>
        </div>

        <footer className="save-current-set-modal__footer">
          <button
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="save-current-set-modal__save"
            type="button"
            disabled={
              trackCount === 0
            }
            onClick={
              handleSubmit
            }
          >
            <Save size={15} />
            Save Playlist
          </button>
        </footer>
      </section>
    </div>
  );
}
