export const FLAMINGO_BACKUP_VERSION = 1;

export type FlamingoBackupScope =
  | "event-profiles"
  | "performance-history"
  | "audience-responses"
  | "current-set"
  | "event-plan"
  | "live-session"
  | "pre-event-generator-preset"
  | "track-column-order"
  | "track-column-widths";

export type FlamingoBackupEntry = {
  scope: FlamingoBackupScope;
  localStorageKey: string;
  exists: boolean;
  value: unknown;
};

export type FlamingoBackupFile = {
  app: "flamingo-dj";
  version: number;
  exportedAt: string;
  entries: FlamingoBackupEntry[];
};

export type BackupValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  backup: FlamingoBackupFile | null;
};

export type ExportFormat = "json" | "csv";

export type ExportResult = {
  filename: string;
  rowCount: number;
};
