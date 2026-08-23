import {
  Building2,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";

import {
  useState,
} from "react";

import type {
  EventProfile,
  EventProfileType,
} from "../../types/eventProfile";

import "./EventProfileSelector.css";

type EventProfileSelectorProps = {
  profiles:
    readonly EventProfile[];

  activeProfile:
    EventProfile | null;

  onSelect: (
    profileId:
      string,
  ) => void;

  onCreate: (input: {
    name: string;
    type:
      EventProfileType;
    location?: string;
    notes?: string;
  }) => void;

  onDelete: (
    profileId:
      string,
  ) => void;
};

export default function EventProfileSelector({
  profiles,
  activeProfile,
  onSelect,
  onCreate,
  onDelete,
}: EventProfileSelectorProps) {
  const [
    isCreating,
    setIsCreating,
  ] =
    useState(false);

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    location,
    setLocation,
  ] =
    useState("");

  const [
    type,
    setType,
  ] =
    useState<EventProfileType>(
      "bar",
    );

  function handleCreate() {
    if (
      !name.trim()
    ) {
      return;
    }

    onCreate({
      name,
      type,
      location,
    });

    setName("");
    setLocation("");
    setType(
      "bar",
    );
    setIsCreating(
      false,
    );
  }

  return (
    <section className="event-profile-selector">
      <header>
        <div>
          <Building2
            size={15}
          />

          <div>
            <span>
              Event Context
            </span>

            <strong>
              Venue / Event Profile
            </strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setIsCreating(
              (value) =>
                !value,
            )
          }
        >
          <Plus
            size={12}
          />
          New profile
        </button>
      </header>

      <div className="event-profile-selector__active">
        <label>
          <span>
            Active profile
          </span>

          <select
            value={
              activeProfile?.id ??
              ""
            }
            onChange={(
              event,
            ) =>
              onSelect(
                event.target
                  .value,
              )
            }
          >
            {profiles.map(
              (profile) => (
                <option
                  key={
                    profile.id
                  }
                  value={
                    profile.id
                  }
                >
                  {
                    profile.name
                  }
                </option>
              ),
            )}
          </select>
        </label>

        <div>
          <strong>
            {activeProfile?.name ??
              "No profile"}
          </strong>

          <small>
            {activeProfile?.type ??
              "—"}
            {activeProfile?.location
              ? ` · ${activeProfile.location}`
              : ""}
          </small>
        </div>

        {activeProfile &&
          activeProfile.id !==
            "global" && (
          <button
            type="button"
            title="Delete active profile"
            onClick={() => {
              const confirmed =
                window.confirm(
                  `Delete "${activeProfile.name}"? Saved performance reports will keep the old profile name.`,
                );

              if (
                confirmed
              ) {
                onDelete(
                  activeProfile.id,
                );
              }
            }}
          >
            <Trash2
              size={12}
            />
          </button>
        )}
      </div>

      {isCreating && (
        <div className="event-profile-selector__create">
          <label>
            <span>
              Profile name
            </span>

            <input
              type="text"
              value={
                name
              }
              placeholder="Mamacitas"
              onChange={(
                event,
              ) =>
                setName(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <label>
            <span>
              Type
            </span>

            <select
              value={
                type
              }
              onChange={(
                event,
              ) =>
                setType(
                  event.target
                    .value as EventProfileType,
                )
              }
            >
              <option value="bar">
                Bar
              </option>
              <option value="club">
                Club
              </option>
              <option value="private-party">
                Private Party
              </option>
              <option value="beach-event">
                Beach Event
              </option>
              <option value="wedding">
                Wedding
              </option>
              <option value="festival">
                Festival
              </option>
              <option value="restaurant">
                Restaurant
              </option>
              <option value="other">
                Other
              </option>
            </select>
          </label>

          <label>
            <span>
              Location
            </span>

            <div>
              <MapPin
                size={12}
              />

              <input
                type="text"
                value={
                  location
                }
                placeholder="Kensington Market"
                onChange={(
                  event,
                ) =>
                  setLocation(
                    event.target
                      .value,
                  )
                }
              />
            </div>
          </label>

          <button
            type="button"
            onClick={
              handleCreate
            }
          >
            Create & use
          </button>
        </div>
      )}
    </section>
  );
}
