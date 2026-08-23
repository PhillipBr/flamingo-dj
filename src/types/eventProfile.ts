export type EventProfileType =
  | "bar"
  | "club"
  | "private-party"
  | "beach-event"
  | "wedding"
  | "festival"
  | "restaurant"
  | "other";

export type EventProfile = {
  id: string;

  name: string;

  type:
    EventProfileType;

  location: string | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

export type EventProfileState = {
  profiles:
    EventProfile[];

  activeProfileId:
    string | null;
};
