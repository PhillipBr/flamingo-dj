export type DiagnosticLevel =
  | "ok"
  | "warning"
  | "error";

export type ProductionDiagnosticItem = {
  id: string;
  level: DiagnosticLevel;
  label: string;
  detail: string;
};

export type ProductionDiagnosticsReport = {
  generatedAt: string;
  appVersion: string;
  storageSchemaVersion: number;
  items: ProductionDiagnosticItem[];
  localStorageBytes: number;
  localStorageEntries: number;
};

export type StorageMigrationResult = {
  fromVersion: number;
  toVersion: number;
  migrated: boolean;
  messages: string[];
};
