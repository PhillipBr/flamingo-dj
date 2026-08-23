import type {
  ProductionDiagnosticItem,
  ProductionDiagnosticsReport,
} from "../types/productionDiagnostics";

import {
  isSupabaseConfigured,
} from "../lib/supabaseClient";

import {
  getLocalStorageUsage,
} from "./safeStorage";

import {
  FLAMINGO_RECOVERY_CHECKPOINT_KEY,
  FLAMINGO_STORAGE_SCHEMA_KEY,
  FLAMINGO_STORAGE_SCHEMA_VERSION,
} from "./storageSchema";

const REQUIRED_KEYS = [
  "flamingo-dj-event-profiles",
  "flamingo-dj-current-set",
  "flamingo-dj-live-performance-history",
] as const;

function isJsonStorageValid(
  key: string,
): boolean {
  const raw =
    localStorage.getItem(key);

  if (raw === null) {
    return true;
  }

  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

export function buildProductionDiagnostics(): ProductionDiagnosticsReport {
  const items:
    ProductionDiagnosticItem[] = [];

  const schemaVersion =
    Number(
      localStorage.getItem(
        FLAMINGO_STORAGE_SCHEMA_KEY,
      ) ??
        "0",
    );

  items.push({
    id:
      "storage-schema",
    level:
      schemaVersion ===
      FLAMINGO_STORAGE_SCHEMA_VERSION
        ? "ok"
        : "warning",
    label:
      "Storage schema",
    detail:
      schemaVersion ===
      FLAMINGO_STORAGE_SCHEMA_VERSION
        ? `Schema v${schemaVersion} is current.`
        : `Stored schema v${schemaVersion}; app expects v${FLAMINGO_STORAGE_SCHEMA_VERSION}.`,
  });

  const invalidKeys =
    REQUIRED_KEYS.filter(
      (key) =>
        !isJsonStorageValid(key),
    );

  items.push({
    id:
      "storage-integrity",
    level:
      invalidKeys.length ===
      0
        ? "ok"
        : "error",
    label:
      "Local storage integrity",
    detail:
      invalidKeys.length ===
      0
        ? "Core Flamingo JSON storage is readable."
        : `Corrupted JSON detected in: ${invalidKeys.join(", ")}`,
  });

  items.push({
    id:
      "supabase-config",
    level:
      isSupabaseConfigured
        ? "ok"
        : "warning",
    label:
      "Supabase configuration",
    detail:
      isSupabaseConfigured
        ? "Supabase client environment variables are configured."
        : "Supabase environment variables are not configured.",
  });

  const recoveryExists =
    localStorage.getItem(
      FLAMINGO_RECOVERY_CHECKPOINT_KEY,
    ) !==
    null;

  items.push({
    id:
      "recovery-checkpoint",
    level:
      recoveryExists
        ? "ok"
        : "warning",
    label:
      "Recovery checkpoint",
    detail:
      recoveryExists
        ? "A local recovery checkpoint is available."
        : "No cloud-pull recovery checkpoint has been created yet.",
  });

  const usage =
    getLocalStorageUsage();

  const approximateMb =
    usage.bytes /
    1024 /
    1024;

  items.push({
    id:
      "storage-usage",
    level:
      approximateMb >
      4
        ? "warning"
        : "ok",
    label:
      "Local storage usage",
    detail:
      `${approximateMb.toFixed(2)} MB across ${usage.entries} entries.`,
  });

  return {
    generatedAt:
      new Date().toISOString(),

    appVersion:
      "production-hardening-v1",

    storageSchemaVersion:
      FLAMINGO_STORAGE_SCHEMA_VERSION,

    items,

    localStorageBytes:
      usage.bytes,

    localStorageEntries:
      usage.entries,
  };
}
