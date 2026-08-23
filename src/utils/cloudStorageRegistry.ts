import type {
  CloudSyncRow,
  CloudSyncScope,
  CloudSyncStatePayload,
} from "../types/cloudSync";

type CloudStorageDefinition = {
  scope: CloudSyncScope;
  localStorageKey: string;
};

export const CLOUD_STORAGE_DEFINITIONS:
  readonly CloudStorageDefinition[] =
  [
    {
      scope:
        "event-profiles",
      localStorageKey:
        "flamingo-dj-event-profiles",
    },
    {
      scope:
        "performance-history",
      localStorageKey:
        "flamingo-dj-live-performance-history",
    },
    {
      scope:
        "audience-responses",
      localStorageKey:
        "flamingo-dj-audience-response",
    },
    {
      scope:
        "current-set",
      localStorageKey:
        "flamingo-dj-current-set",
    },
    {
      scope:
        "event-plan",
      localStorageKey:
        "flamingo-dj-event-plan",
    },
    {
      scope:
        "live-session",
      localStorageKey:
        "flamingo-dj-live-session",
    },
    {
      scope:
        "pre-event-generator-preset",
      localStorageKey:
        "flamingo-dj-pre-event-generator-preset",
    },
  ];

function parseStoredValue(
  rawValue: string,
): unknown {
  try {
    return JSON.parse(
      rawValue,
    );
  } catch {
    return rawValue;
  }
}

export function readLocalCloudRows(): CloudSyncRow[] {
  const now =
    new Date().toISOString();

  return CLOUD_STORAGE_DEFINITIONS.map(
    (definition) => {
      const rawValue =
        localStorage.getItem(
          definition.localStorageKey,
        );

      const payload:
        CloudSyncStatePayload =
        rawValue === null
          ? {
              exists:
                false,
              value:
                null,
            }
          : {
              exists:
                true,
              value:
                parseStoredValue(
                  rawValue,
                ),
            };

      return {
        scope:
          definition.scope,
        payload,
        updatedAt:
          now,
      };
    },
  );
}

function serializeCloudValue(
  value: unknown,
): string {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  return JSON.stringify(
    value,
  );
}

export function writeCloudRowsToLocal(
  rows:
    readonly CloudSyncRow[],
): void {
  const rowByScope =
    new Map(
      rows.map(
        (row) => [
          row.scope,
          row,
        ],
      ),
    );

  CLOUD_STORAGE_DEFINITIONS.forEach(
    (definition) => {
      const row =
        rowByScope.get(
          definition.scope,
        );

      if (!row) {
        return;
      }

      if (
        !row.payload.exists
      ) {
        localStorage.removeItem(
          definition.localStorageKey,
        );

        return;
      }

      localStorage.setItem(
        definition.localStorageKey,
        serializeCloudValue(
          row.payload.value,
        ),
      );
    },
  );
}
