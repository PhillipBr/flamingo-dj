import {
  ArrowRightLeft,
  Bolt,
  Copy,
  FolderInput,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import {
  useState,
  type FormEvent,
} from "react";

type BulkActionsBarProps = {
  selectedCount: number;

  onCopySelected: () => void;
  onMoveSelected: () => void;

  onSetFolder: (
    folder: string | null,
  ) => void;

  onAddKeyword: (
    keyword: string,
  ) => void;

  onRemoveKeyword: (
    keyword: string,
  ) => void;

  onSetRating: (
    rating: number | null,
  ) => void;

  onSetEnergy: (
    energy: number | null,
  ) => void;

  onDeleteSelected: () => void;
  onClearSelection: () => void;
};

type ActiveEditor =
  | "folder"
  | "keyword"
  | "rating"
  | "energy"
  | null;

function normalizeKeyword(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

export default function BulkActionsBar({
  selectedCount,
  onCopySelected,
  onMoveSelected,
  onSetFolder,
  onAddKeyword,
  onRemoveKeyword,
  onSetRating,
  onSetEnergy,
  onDeleteSelected,
  onClearSelection,
}: BulkActionsBarProps) {
  const [
    activeEditor,
    setActiveEditor,
  ] = useState<ActiveEditor>(null);

  const [
    folderValue,
    setFolderValue,
  ] = useState("");

  const [
    keywordValue,
    setKeywordValue,
  ] = useState("");

  const [
    ratingValue,
    setRatingValue,
  ] = useState("");

  const [
    energyValue,
    setEnergyValue,
  ] = useState("");

  if (selectedCount === 0) {
    return null;
  }

  function toggleEditor(
    editor: Exclude<
      ActiveEditor,
      null
    >,
  ) {
    setActiveEditor(
      (currentEditor) =>
        currentEditor === editor
          ? null
          : editor,
    );
  }

  function handleFolderSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedFolder =
      folderValue.trim();

    onSetFolder(
      normalizedFolder || null,
    );

    setFolderValue("");
    setActiveEditor(null);
  }

  function handleAddKeyword() {
    const normalizedKeyword =
      normalizeKeyword(
        keywordValue,
      );

    if (!normalizedKeyword) {
      return;
    }

    onAddKeyword(
      normalizedKeyword,
    );

    setKeywordValue("");
    setActiveEditor(null);
  }

  function handleRemoveKeyword() {
    const normalizedKeyword =
      normalizeKeyword(
        keywordValue,
      );

    if (!normalizedKeyword) {
      return;
    }

    onRemoveKeyword(
      normalizedKeyword,
    );

    setKeywordValue("");
    setActiveEditor(null);
  }

  function handleRatingSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!ratingValue.trim()) {
      onSetRating(null);
      setActiveEditor(null);
      return;
    }

    const parsedRating =
      Number(ratingValue);

    if (
      !Number.isFinite(
        parsedRating,
      ) ||
      parsedRating < 0 ||
      parsedRating > 5
    ) {
      window.alert(
        "Rating must be between 0 and 5.",
      );

      return;
    }

    onSetRating(parsedRating);
    setRatingValue("");
    setActiveEditor(null);
  }

  function handleEnergySubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!energyValue.trim()) {
      onSetEnergy(null);
      setActiveEditor(null);
      return;
    }

    const parsedEnergy =
      Number(energyValue);

    if (
      !Number.isFinite(
        parsedEnergy,
      ) ||
      parsedEnergy < 0 ||
      parsedEnergy > 10
    ) {
      window.alert(
        "Energy must be between 0 and 10.",
      );

      return;
    }

    onSetEnergy(parsedEnergy);
    setEnergyValue("");
    setActiveEditor(null);
  }

  return (
    <div className="bulk-actions">
      <div className="bulk-actions__summary">
        <strong>
          {selectedCount}
        </strong>

        <span>
          {selectedCount === 1
            ? "track selected"
            : "tracks selected"}
        </span>
      </div>

      <div className="bulk-actions__buttons">
        <button
          className="bulk-actions__button"
          type="button"
          onClick={
            onCopySelected
          }
        >
          <Copy size={15} />
          Copy to
        </button>

        <button
          className="bulk-actions__button"
          type="button"
          onClick={
            onMoveSelected
          }
        >
          <ArrowRightLeft
            size={15}
          />
          Move to
        </button>

        <button
          className={
            activeEditor ===
            "folder"
              ? "bulk-actions__button bulk-actions__button--active"
              : "bulk-actions__button"
          }
          type="button"
          onClick={() =>
            toggleEditor(
              "folder",
            )
          }
        >
          <FolderInput
            size={15}
          />
          Folder
        </button>

        <button
          className={
            activeEditor ===
            "keyword"
              ? "bulk-actions__button bulk-actions__button--active"
              : "bulk-actions__button"
          }
          type="button"
          onClick={() =>
            toggleEditor(
              "keyword",
            )
          }
        >
          <Tag size={15} />
          Keywords
        </button>

        <button
          className={
            activeEditor ===
            "rating"
              ? "bulk-actions__button bulk-actions__button--active"
              : "bulk-actions__button"
          }
          type="button"
          onClick={() =>
            toggleEditor(
              "rating",
            )
          }
        >
          <Star size={15} />
          Rating
        </button>

        <button
          className={
            activeEditor ===
            "energy"
              ? "bulk-actions__button bulk-actions__button--active"
              : "bulk-actions__button"
          }
          type="button"
          onClick={() =>
            toggleEditor(
              "energy",
            )
          }
        >
          <Bolt size={15} />
          Energy
        </button>

        <button
          className="bulk-actions__button bulk-actions__button--danger"
          type="button"
          onClick={
            onDeleteSelected
          }
        >
          <Trash2 size={15} />
          Delete
        </button>

        <button
          className="bulk-actions__button"
          type="button"
          onClick={
            onClearSelection
          }
        >
          <X size={15} />
          Clear
        </button>
      </div>

      {activeEditor ===
        "folder" && (
        <form
          className="bulk-actions__editor"
          onSubmit={
            handleFolderSubmit
          }
        >
          <label>
            <span>
              Set folder for{" "}
              {selectedCount}{" "}
              {selectedCount === 1
                ? "track"
                : "tracks"}
            </span>

            <input
              type="text"
              value={folderValue}
              placeholder="Deep House, Warm Up..."
              autoFocus
              onChange={(event) =>
                setFolderValue(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <button
            className="bulk-actions__apply"
            type="submit"
          >
            Apply folder
          </button>

          <button
            className="bulk-actions__secondary"
            type="button"
            onClick={() => {
              onSetFolder(null);
              setFolderValue("");
              setActiveEditor(
                null,
              );
            }}
          >
            Clear folder
          </button>
        </form>
      )}

      {activeEditor ===
        "keyword" && (
        <div className="bulk-actions__editor">
          <label>
            <span>
              Edit keyword for{" "}
              {selectedCount}{" "}
              {selectedCount === 1
                ? "track"
                : "tracks"}
            </span>

            <input
              type="text"
              value={keywordValue}
              placeholder="vocal, warm up, peak time..."
              autoFocus
              onChange={(event) =>
                setKeywordValue(
                  event.target
                    .value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  event.preventDefault();
                  handleAddKeyword();
                }
              }}
            />
          </label>

          <button
            className="bulk-actions__apply"
            type="button"
            onClick={
              handleAddKeyword
            }
          >
            Add keyword
          </button>

          <button
            className="bulk-actions__secondary"
            type="button"
            onClick={
              handleRemoveKeyword
            }
          >
            Remove keyword
          </button>
        </div>
      )}

      {activeEditor ===
        "rating" && (
        <form
          className="bulk-actions__editor"
          onSubmit={
            handleRatingSubmit
          }
        >
          <label>
            <span>
              Set rating from 0 to
              5
            </span>

            <input
              type="number"
              min="0"
              max="5"
              step="1"
              value={ratingValue}
              placeholder="4"
              autoFocus
              onChange={(event) =>
                setRatingValue(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <button
            className="bulk-actions__apply"
            type="submit"
          >
            Apply rating
          </button>

          <button
            className="bulk-actions__secondary"
            type="button"
            onClick={() => {
              onSetRating(null);
              setRatingValue("");
              setActiveEditor(
                null,
              );
            }}
          >
            Clear rating
          </button>
        </form>
      )}

      {activeEditor ===
        "energy" && (
        <form
          className="bulk-actions__editor"
          onSubmit={
            handleEnergySubmit
          }
        >
          <label>
            <span>
              Set energy from 0 to
              10
            </span>

            <input
              type="number"
              min="0"
              max="10"
              step="1"
              value={energyValue}
              placeholder="7"
              autoFocus
              onChange={(event) =>
                setEnergyValue(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <button
            className="bulk-actions__apply"
            type="submit"
          >
            Apply energy
          </button>

          <button
            className="bulk-actions__secondary"
            type="button"
            onClick={() => {
              onSetEnergy(null);
              setEnergyValue("");
              setActiveEditor(
                null,
              );
            }}
          >
            Clear energy
          </button>
        </form>
      )}
    </div>
  );
}