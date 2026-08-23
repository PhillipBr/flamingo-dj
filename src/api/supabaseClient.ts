import {
  createClient,
} from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env
    .VITE_SUPABASE_URL
  ?.trim();

const supabaseAnonKey =
  import.meta.env
    .VITE_SUPABASE_ANON_KEY
  ?.trim();

if (
  !supabaseUrl ||
  !supabaseAnonKey
) {
  console.warn(
    "[FlamingoDJ] Supabase env variables are missing. "
      + "Database sync will be unavailable.",
  );
}

export const supabase =
  createClient(
    supabaseUrl || "https://invalid.local",
    supabaseAnonKey || "missing-key",
  );

export function isSupabaseConfigured():
  boolean {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey,
  );
}
