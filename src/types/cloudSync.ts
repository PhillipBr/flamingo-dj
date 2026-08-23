export type CloudSyncScope =
  | "event-profiles"
  | "performance-history"
  | "audience-responses"
  | "current-set"
  | "event-plan"
  | "live-session"
  | "pre-event-generator-preset";

export type CloudSyncStatePayload = {
  exists: boolean;
  value: unknown;
};

export type CloudSyncRow = {
  scope: CloudSyncScope;
  payload: CloudSyncStatePayload;
  updatedAt: string;
};

export type CloudSyncOperationResult = {
  scopesProcessed: number;
  completedAt: string;
};

export type CloudSyncUiStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";
