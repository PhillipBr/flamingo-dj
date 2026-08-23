import {
  ArrowRightLeft,
  ExternalLink,
  ListPlus,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type BulkActionsBarProps = {
  selectedCount: number;

  onMatchSelected: () => void;
  onEditSelected: () => void;

  onMoveSelected: () => void;
  onAddSelected: () => void;

  onOpenSpotifySelected: () => void;

  onDeleteSelected: () => void;
  onClearSelection: () => void;
};

export default function BulkActionsBar({
  selectedCount,
  onMatchSelected,
  onEditSelected,
  onMoveSelected,
  onAddSelected,
  onOpenSpotifySelected,
  onDeleteSelected,
  onClearSelection,
}: BulkActionsBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  const hasSingleSelection =
    selectedCount === 1;

  return (
    <div className="bulk-actions bulk-actions--dj">
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

      <div className="bulk-actions__buttons bulk-actions__buttons--dj">
        <button
          className="bulk-actions__button bulk-actions__button--match"
          type="button"
          disabled={!hasSingleSelection}
          title={
            hasSingleSelection
              ? "Find compatible tracks"
              : "Select exactly one track to use Match"
          }
          onClick={
            onMatchSelected
          }
        >
          <Sparkles size={15} />
          MATCH
        </button>

        <button
          className="bulk-actions__button"
          type="button"
          disabled={!hasSingleSelection}
          title={
            hasSingleSelection
              ? "Edit selected track"
              : "Edit is available for one track at a time"
          }
          onClick={
            onEditSelected
          }
        >
          <Pencil size={15} />
          Edit
        </button>

        <button
          className="bulk-actions__button"
          type="button"
          onClick={
            onMoveSelected
          }
        >
          <ArrowRightLeft size={15} />
          Move to
        </button>

        <button
          className="bulk-actions__button"
          type="button"
          onClick={
            onAddSelected
          }
        >
          <ListPlus size={15} />
          Add to
        </button>

        <button
          className="bulk-actions__button"
          type="button"
          disabled={!hasSingleSelection}
          title={
            hasSingleSelection
              ? "Open selected track in Spotify"
              : "Spotify is available for one track at a time"
          }
          onClick={
            onOpenSpotifySelected
          }
        >
          <ExternalLink size={15} />
          Spotify
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
    </div>
  );
}
