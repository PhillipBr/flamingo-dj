import type {
  User,
} from "@supabase/supabase-js";

import type {
  CloudSyncOperationResult,
  CloudSyncRow,
  CloudSyncScope,
  CloudSyncStatePayload,
} from "../types/cloudSync";

import {
  supabase,
} from "../lib/supabaseClient";

import {
  readLocalCloudRows,
  writeCloudRowsToLocal,
} from "./cloudStorageRegistry";

import {
  createRecoveryCheckpoint,
} from "./recoveryService";

const CLOUD_TABLE =
  "dj_app_state";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  return supabase;
}

async function requireUser(): Promise<User> {
  const client =
    requireSupabase();

  const {
    data,
    error,
  } =
    await client.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error(
      "You must sign in before syncing Flamingo DJ data.",
    );
  }

  return data.user;
}

export async function getCloudUser(): Promise<User | null> {
  const client =
    requireSupabase();

  const {
    data,
    error,
  } =
    await client.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ??
    null;
}

export async function signUpCloudUser(
  email: string,
  password: string,
): Promise<void> {
  const client =
    requireSupabase();

  const {
    error,
  } =
    await client.auth.signUp({
      email:
        email.trim(),
      password,
    });

  if (error) {
    throw error;
  }
}

export async function signInCloudUser(
  email: string,
  password: string,
): Promise<void> {
  const client =
    requireSupabase();

  const {
    error,
  } =
    await client.auth.signInWithPassword({
      email:
        email.trim(),
      password,
    });

  if (error) {
    throw error;
  }
}

export async function signOutCloudUser(): Promise<void> {
  const client =
    requireSupabase();

  const {
    error,
  } =
    await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function pushLocalStateToCloud(): Promise<CloudSyncOperationResult> {
  const client =
    requireSupabase();

  const user =
    await requireUser();

  const rows =
    readLocalCloudRows();

  const databaseRows =
    rows.map(
      (row) => ({
        user_id:
          user.id,

        scope:
          row.scope,

        payload:
          row.payload,

        updated_at:
          row.updatedAt,
      }),
    );

  const {
    error,
  } =
    await client
      .from(
        CLOUD_TABLE,
      )
      .upsert(
        databaseRows,
        {
          onConflict:
            "user_id,scope",
        },
      );

  if (error) {
    throw error;
  }

  return {
    scopesProcessed:
      rows.length,

    completedAt:
      new Date().toISOString(),
  };
}

type RawCloudRow = {
  scope: string;
  payload: unknown;
  updated_at: string;
};

function isCloudScope(
  value: string,
): value is CloudSyncScope {
  return [
    "event-profiles",
    "performance-history",
    "audience-responses",
    "current-set",
    "event-plan",
    "live-session",
    "pre-event-generator-preset",
  ].includes(
    value,
  );
}

function parsePayload(
  value: unknown,
): CloudSyncStatePayload | null {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof record.exists !==
    "boolean"
  ) {
    return null;
  }

  return {
    exists:
      record.exists,

    value:
      record.value,
  };
}

export async function pullCloudStateToLocal(): Promise<CloudSyncOperationResult> {
  const client =
    requireSupabase();

  const user =
    await requireUser();

  const {
    data,
    error,
  } =
    await client
      .from(
        CLOUD_TABLE,
      )
      .select(
        "scope,payload,updated_at",
      )
      .eq(
        "user_id",
        user.id,
      );

  if (error) {
    throw error;
  }

  const rawRows =
    (
      data ??
      []
    ) as RawCloudRow[];

  const rows:
    CloudSyncRow[] =
    rawRows
      .map(
        (
          raw,
        ): CloudSyncRow | null => {
          if (
            !isCloudScope(
              raw.scope,
            )
          ) {
            return null;
          }

          const payload =
            parsePayload(
              raw.payload,
            );

          if (!payload) {
            return null;
          }

          return {
            scope:
              raw.scope,

            payload,

            updatedAt:
              raw.updated_at,
          };
        },
      )
      .filter(
        (
          row,
        ): row is CloudSyncRow =>
          row !== null,
      );

  createRecoveryCheckpoint(
    "Before Pull Cloud → Local",
  );

  writeCloudRowsToLocal(
    rows,
  );

  return {
    scopesProcessed:
      rows.length,

    completedAt:
      new Date().toISOString(),
  };
}
