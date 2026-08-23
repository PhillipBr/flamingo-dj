import type {
  FlamingoBackupScope,
} from "../types/flamingoBackup";

export type FlamingoBackupStorageDefinition = {
  scope: FlamingoBackupScope;
  localStorageKey: string;
};

export const FLAMINGO_BACKUP_STORAGE:
  readonly FlamingoBackupStorageDefinition[] = [
    { scope: "event-profiles", localStorageKey: "flamingo-dj-event-profiles" },
    { scope: "performance-history", localStorageKey: "flamingo-dj-live-performance-history" },
    { scope: "audience-responses", localStorageKey: "flamingo-dj-audience-response" },
    { scope: "current-set", localStorageKey: "flamingo-dj-current-set" },
    { scope: "event-plan", localStorageKey: "flamingo-dj-event-plan" },
    { scope: "live-session", localStorageKey: "flamingo-dj-live-session" },
    { scope: "pre-event-generator-preset", localStorageKey: "flamingo-dj-pre-event-generator-preset" },
    { scope: "track-column-order", localStorageKey: "flamingo-dj-track-column-order" },
    { scope: "track-column-widths", localStorageKey: "flamingo-dj-track-column-widths" },
  ];
