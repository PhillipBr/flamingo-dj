import {
  Copy,
  MoreHorizontal,
  Pencil,
  Tags,
  Trash2,
} from "lucide-react";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import "./PlaylistActionsMenu.css";

type PlaylistActionsMenuProps = {
  onEdit: () => void;
  onEditKeywords: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

type MenuPosition = {
  left: number;
  top: number;
};

const VIEWPORT_PADDING = 12;
const MENU_GAP = 8;

export default function PlaylistActionsMenu({
  onEdit,
  onEditKeywords,
  onDuplicate,
  onDelete,
}: PlaylistActionsMenuProps) {
  const triggerRef =
    useRef<HTMLButtonElement | null>(
      null,
    );

  const menuRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  const [
    position,
    setPosition,
  ] = useState<MenuPosition>({
    left: 0,
    top: 0,
  });

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const trigger =
      triggerRef.current;

    const menu =
      menuRef.current;

    if (!trigger || !menu) {
      return;
    }

    const triggerRect =
      trigger.getBoundingClientRect();

    const menuRect =
      menu.getBoundingClientRect();

    const spaceBelow =
      window.innerHeight -
      triggerRect.bottom -
      VIEWPORT_PADDING;

    const spaceAbove =
      triggerRect.top -
      VIEWPORT_PADDING;

    let top =
      triggerRect.bottom +
      MENU_GAP;

    if (
      menuRect.height >
        spaceBelow &&
      spaceAbove >
        spaceBelow
    ) {
      top =
        triggerRect.top -
        menuRect.height -
        MENU_GAP;
    }

    let left =
      triggerRect.right -
      menuRect.width;

    left =
      Math.max(
        VIEWPORT_PADDING,
        Math.min(
          left,
          window.innerWidth -
            menuRect.width -
            VIEWPORT_PADDING,
        ),
      );

    top =
      Math.max(
        VIEWPORT_PADDING,
        Math.min(
          top,
          window.innerHeight -
            menuRect.height -
            VIEWPORT_PADDING,
        ),
      );

    setPosition({
      left,
      top,
    });
  }, [
    isOpen,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleOutsideClick(
      event: MouseEvent,
    ) {
      const target =
        event.target as Node;

      if (
        triggerRef.current?.contains(
          target,
        ) ||
        menuRef.current?.contains(
          target,
        )
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setIsOpen(false);
      }
    }

    function closeMenu() {
      setIsOpen(false);
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    window.addEventListener(
      "resize",
      closeMenu,
    );

    window.addEventListener(
      "scroll",
      closeMenu,
      true,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      window.removeEventListener(
        "resize",
        closeMenu,
      );

      window.removeEventListener(
        "scroll",
        closeMenu,
        true,
      );
    };
  }, [
    isOpen,
  ]);

  function runAction(
    action: () => void,
  ) {
    setIsOpen(false);
    action();
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="playlist-actions-trigger"
        type="button"
        aria-label="Playlist actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          setIsOpen(
            (current) =>
              !current,
          );
        }}
      >
        <MoreHorizontal
          size={18}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="playlist-actions-menu"
            style={{
              left:
                position.left,
              top:
                position.top,
            }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(
                  onEdit,
                )
              }
            >
              <Pencil size={15} />
              <span>
                Edit playlist
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(
                  onEditKeywords,
                )
              }
            >
              <Tags size={15} />
              <span>
                Edit keywords
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(
                  onDuplicate,
                )
              }
            >
              <Copy size={15} />
              <span>
                Duplicate playlist
              </span>
            </button>

            <div className="playlist-actions-menu__separator" />

            <button
              type="button"
              role="menuitem"
              className="playlist-actions-menu__danger"
              onClick={() =>
                runAction(
                  onDelete,
                )
              }
            >
              <Trash2 size={15} />
              <span>
                Delete playlist
              </span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
