import type {
  StorageMigrationResult,
} from "../types/productionDiagnostics";

import {
  FLAMINGO_LAST_MIGRATION_KEY,
  FLAMINGO_STORAGE_SCHEMA_KEY,
  FLAMINGO_STORAGE_SCHEMA_VERSION,
} from "./storageSchema";

import {
  safeWriteJson,
} from "./safeStorage";

function readStoredVersion(): number {
  const raw =
    localStorage.getItem(
      FLAMINGO_STORAGE_SCHEMA_KEY,
    );

  if (!raw) {
    return 0;
  }

  const parsed =
    Number(raw);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export function runStorageMigrations(): StorageMigrationResult {
  const fromVersion =
    readStoredVersion();

  const messages:
    string[] = [];

  if (
    fromVersion >
    FLAMINGO_STORAGE_SCHEMA_VERSION
  ) {
    messages.push(
      `Storage schema ${fromVersion} is newer than this app supports (${FLAMINGO_STORAGE_SCHEMA_VERSION}). No downgrade was attempted.`,
    );

    return {
      fromVersion,
      toVersion:
        fromVersion,
      migrated:
        false,
      messages,
    };
  }

  let current =
    fromVersion;

  if (current < 1) {
    /*
     * V1 intentionally has no destructive transformations.
     * It establishes a formal schema version for all existing
     * Flamingo localStorage data.
     */
    messages.push(
      "Initialized Flamingo localStorage schema version 1.",
    );

    current = 1;
  }

  localStorage.setItem(
    FLAMINGO_STORAGE_SCHEMA_KEY,
    String(current),
  );

  safeWriteJson(
    FLAMINGO_LAST_MIGRATION_KEY,
    {
      fromVersion,
      toVersion:
        current,
      completedAt:
        new Date().toISOString(),
      messages,
    },
  );

  return {
    fromVersion,
    toVersion:
      current,
    migrated:
      fromVersion !==
      current,
    messages,
  };
}
