import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  ListMusic,
  X,
} from "lucide-react";

import type {
  Playlist,
  PlaylistFormValues,
} from "../../types/playlist";

type PlaylistFormModalProps = {
  isOpen: boolean;
  playlist: Playlist | null;
  onClose: () => void;
  onSubmit: (
    values: PlaylistFormValues,
  ) => void;
};

const EMPTY_FORM: PlaylistFormValues = {
  name: "",
  description: "",
  category: "",
};

export default function PlaylistFormModal({
  isOpen,
  playlist,
  onClose,
  onSubmit,
}: PlaylistFormModalProps) {
  const [
    formValues,
    setFormValues,
  ] =
    useState<PlaylistFormValues>(
      EMPTY_FORM,
    );

  const [
    validationError,
    setValidationError,
  ] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (playlist) {
      setFormValues({
        name: playlist.name,
        description:
          playlist.description,
        category:
          playlist.category,
      });
    } else {
      setFormValues({
        ...EMPTY_FORM,
      });
    }

    setValidationError("");
  }, [isOpen, playlist]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function updateField<
    Field extends keyof PlaylistFormValues,
  >(
    field: Field,
    value: PlaylistFormValues[Field],
  ) {
    setFormValues(
      (currentValues) => ({
        ...currentValues,
        [field]: value,
      }),
    );

    if (validationError) {
      setValidationError("");
    }
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedName =
      formValues.name.trim();

    const normalizedCategory =
      formValues.category.trim();

    if (!normalizedName) {
      setValidationError(
        "Playlist name is required.",
      );

      return;
    }

    if (!normalizedCategory) {
      setValidationError(
        "Playlist category is required.",
      );

      return;
    }

    onSubmit({
      name: normalizedName,
      description:
        formValues.description
          .trim(),
      category:
        normalizedCategory,
    });
  }

  return (
    <div
      className="playlist-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="playlist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-modal-title"
      >
        <header className="playlist-modal__header">
          <div className="playlist-modal__title">
            <div className="playlist-modal__icon">
              <ListMusic size={20} />
            </div>

            <div>
              <p className="page-eyebrow">
                Playlist manager
              </p>

              <h2 id="playlist-modal-title">
                {playlist
                  ? "Edit playlist"
                  : "New playlist"}
              </h2>
            </div>
          </div>

          <button
            className="playlist-modal__close"
            type="button"
            aria-label="Close playlist form"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <form
          className="playlist-form"
          onSubmit={handleSubmit}
        >
          <label className="playlist-form__field">
            <span>
              Playlist name
            </span>

            <input
              type="text"
              value={formValues.name}
              placeholder="Deep House"
              maxLength={80}
              autoFocus
              onChange={(event) =>
                updateField(
                  "name",
                  event.target.value,
                )
              }
            />
          </label>

          <label className="playlist-form__field">
            <span>Category</span>

            <input
              type="text"
              value={
                formValues.category
              }
              placeholder="House, Latin, Mixed..."
              maxLength={50}
              onChange={(event) =>
                updateField(
                  "category",
                  event.target.value,
                )
              }
            />
          </label>

          <label className="playlist-form__field">
            <span>Description</span>

            <textarea
              value={
                formValues.description
              }
              placeholder="Describe the purpose or style of this playlist..."
              rows={4}
              maxLength={300}
              onChange={(event) =>
                updateField(
                  "description",
                  event.target.value,
                )
              }
            />
          </label>

          <div className="playlist-form__counter">
            {
              formValues.description
                .length
            }
            /300
          </div>

          {validationError && (
            <p className="playlist-form__error">
              {validationError}
            </p>
          )}

          <footer className="playlist-form__footer">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              className="primary-button"
              type="submit"
            >
              {playlist
                ? "Save changes"
                : "Create playlist"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}