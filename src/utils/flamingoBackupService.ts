import {
  FLAMINGO_BACKUP_VERSION,
  type BackupValidationResult,
  type FlamingoBackupEntry,
  type FlamingoBackupFile,
} from "../types/flamingoBackup";

import {
  FLAMINGO_BACKUP_STORAGE,
} from "./flamingoBackupRegistry";

import {
  buildTimestampForFilename,
  downloadTextFile,
} from "./downloadFile";

function parseStoredValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

function serializeValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : JSON.stringify(value);
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function createFlamingoBackup(): FlamingoBackupFile {
  return {
    app: "flamingo-dj",
    version: FLAMINGO_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: FLAMINGO_BACKUP_STORAGE.map((definition) => {
      const rawValue = localStorage.getItem(
        definition.localStorageKey,
      );

      return {
        scope: definition.scope,
        localStorageKey: definition.localStorageKey,
        exists: rawValue !== null,
        value:
          rawValue === null
            ? null
            : parseStoredValue(rawValue),
      };
    }),
  };
}

export function downloadFlamingoBackup(): void {
  const backup = createFlamingoBackup();

  downloadTextFile({
    filename:
      `flamingo-dj-backup_${buildTimestampForFilename()}.json`,
    content: JSON.stringify(backup, null, 2),
    mimeType: "application/json;charset=utf-8",
  });
}

export function validateFlamingoBackup(
  value: unknown,
): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [
        "The selected file is not a valid Flamingo backup object.",
      ],
      warnings,
      backup: null,
    };
  }

  if (value.app !== "flamingo-dj") {
    errors.push(
      "Backup app identifier is not flamingo-dj.",
    );
  }

  if (typeof value.version !== "number") {
    errors.push(
      "Backup version is missing or invalid.",
    );
  }

  if (!Array.isArray(value.entries)) {
    errors.push("Backup entries are missing.");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      backup: null,
    };
  }

  const version = value.version as number;

  if (version > FLAMINGO_BACKUP_VERSION) {
    warnings.push(
      `Backup version ${version} is newer than supported version ${FLAMINGO_BACKUP_VERSION}. Unknown entries will be ignored.`,
    );
  }

  const allowedKeys = new Set(
    FLAMINGO_BACKUP_STORAGE.map(
      (definition) => definition.localStorageKey,
    ),
  );

  const allowedScopes = new Set(
    FLAMINGO_BACKUP_STORAGE.map(
      (definition) => definition.scope,
    ),
  );

  const entries: FlamingoBackupEntry[] = [];

  (value.entries as unknown[]).forEach(
    (entry, index) => {
      if (!isObject(entry)) {
        warnings.push(
          `Entry ${index + 1} was ignored because it is not an object.`,
        );
        return;
      }

      if (
        typeof entry.localStorageKey !== "string" ||
        !allowedKeys.has(entry.localStorageKey)
      ) {
        warnings.push(
          `Entry ${index + 1} contains an unsupported storage key and was ignored.`,
        );
        return;
      }

      if (
        typeof entry.scope !== "string" ||
        !allowedScopes.has(
          entry.scope as FlamingoBackupEntry["scope"],
        ) ||
        typeof entry.exists !== "boolean"
      ) {
        warnings.push(
          `Entry ${index + 1} has invalid metadata and was ignored.`,
        );
        return;
      }

      entries.push({
        scope:
          entry.scope as FlamingoBackupEntry["scope"],
        localStorageKey: entry.localStorageKey,
        exists: entry.exists,
        value: entry.value,
      });
    },
  );

  if (entries.length === 0) {
    errors.push(
      "The backup contains no supported Flamingo storage entries.",
    );
  }

  const backup: FlamingoBackupFile = {
    app: "flamingo-dj",
    version,
    exportedAt:
      typeof value.exportedAt === "string"
        ? value.exportedAt
        : new Date(0).toISOString(),
    entries,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    backup:
      errors.length === 0
        ? backup
        : null,
  };
}

export async function readBackupFile(
  file: File,
): Promise<BackupValidationResult> {
  try {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);

    return validateFlamingoBackup(parsed);
  } catch {
    return {
      valid: false,
      errors: [
        "The selected file could not be read as JSON.",
      ],
      warnings: [],
      backup: null,
    };
  }
}

export function restoreFlamingoBackup(
  backup: FlamingoBackupFile,
): {
  restored: number;
  removed: number;
} {
  let restored = 0;
  let removed = 0;

  backup.entries.forEach((entry) => {
    if (!entry.exists) {
      localStorage.removeItem(
        entry.localStorageKey,
      );
      removed += 1;
      return;
    }

    localStorage.setItem(
      entry.localStorageKey,
      serializeValue(entry.value),
    );
    restored += 1;
  });

  return {
    restored,
    removed,
  };
}
