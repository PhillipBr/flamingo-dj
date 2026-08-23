import {
  supabase,
} from "./supabaseClient";

export async function getCurrentUserEmail():
  Promise<string | null> {
  const {
    data,
  } =
    await supabase.auth
      .getUser();

  return (
    data.user?.email ??
    null
  );
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const {
    error,
  } =
    await supabase.auth
      .signInWithPassword({
        email:
          email.trim(),
        password,
      });

  if (error) {
    throw error;
  }
}

export async function signOutSupabase():
  Promise<void> {
  const {
    error,
  } =
    await supabase.auth
      .signOut();

  if (error) {
    throw error;
  }
}
