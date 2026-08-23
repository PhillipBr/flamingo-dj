import {
  Check,
  Columns3,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import { TRACK_COLUMNS } from "../../config/trackColumns";
import type { TrackColumnId } from "../../types/trackColumn";

type ColumnManagerProps = {
  visibleColumns: TrackColumnId[];
  onToggleColumn: (columnId: TrackColumnId) => void;
  onReset: () => void;
};

export default function ColumnManager({
  visibleColumns,
  onToggleColumn,
  onReset,
}: ColumnManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const managerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        managerRef.current &&
        !managerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );

      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, []);

  return (
    <div
      className="column-manager"
      ref={managerRef}
    >
      <button
        className={`secondary-button ${
          isOpen
            ? "secondary-button--active"
            : ""
        }`}
        type="button"
        onClick={() =>
          setIsOpen((currentValue) => !currentValue)
        }
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Columns3 size={16} />
        Columns
      </button>

      {isOpen && (
        <div
          className="column-manager__menu"
          role="menu"
        >
          <div className="column-manager__header">
            <div>
              <strong>Visible columns</strong>

              <span>
                Choose which track information appears
                in the table.
              </span>
            </div>

            <button
              className="column-manager__close"
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close column manager"
            >
              <X size={16} />
            </button>
          </div>

          <div className="column-manager__list">
            {TRACK_COLUMNS.map((column) => {
              const isVisible =
                visibleColumns.includes(column.id);

              return (
                <button
                  className={`column-manager__item ${
                    isVisible
                      ? "column-manager__item--active"
                      : ""
                  }`}
                  type="button"
                  key={column.id}
                  disabled={column.locked}
                  onClick={() =>
                    onToggleColumn(column.id)
                  }
                  role="menuitemcheckbox"
                  aria-checked={isVisible}
                >
                  <span className="column-manager__checkbox">
                    {isVisible && <Check size={14} />}
                  </span>

                  <span className="column-manager__label">
                    {column.label}
                  </span>

                  {column.locked && (
                    <span className="column-manager__locked">
                      <LockKeyhole size={13} />
                      Required
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="column-manager__footer">
            <span>
              {visibleColumns.length} columns visible
            </span>

            <button
              type="button"
              onClick={onReset}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}