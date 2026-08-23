import {
  CheckCircle2,
  Database,
  LogIn,
  LogOut,
  XCircle,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  getCurrentUserEmail,
  signInWithPassword,
  signOutSupabase,
} from "../../api/supabaseAuth";

import {
  isSupabaseConfigured,
} from "../../api/supabaseClient";

import "./SupabaseSyncAccount.css";

export default function SupabaseSyncAccount() {
  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<string | null>(
      null,
    );

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    isBusy,
    setIsBusy,
  ] = useState(false);

  useEffect(() => {
    void getCurrentUserEmail()
      .then(
        setCurrentUser,
      )
      .catch(() =>
        setCurrentUser(null),
      );
  }, []);

  if (
    !isSupabaseConfigured()
  ) {
    return (
      <div className="supabase-sync-account supabase-sync-account--warning">
        <XCircle size={15} />
        Supabase not configured
      </div>
    );
  }

  async function handleSignIn() {
    if (
      !email.trim() ||
      !password
    ) {
      setMessage(
        "Email and password are required.",
      );

      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await signInWithPassword(
        email,
        password,
      );

      const userEmail =
        await getCurrentUserEmail();

      setCurrentUser(
        userEmail,
      );

      setPassword("");

      setMessage(
        "Database sync enabled.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sign in failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    setIsBusy(true);

    try {
      await signOutSupabase();
      setCurrentUser(null);
      setMessage(
        "Signed out.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (currentUser) {
    return (
      <div className="supabase-sync-account supabase-sync-account--connected">
        <div>
          <CheckCircle2 size={15} />
          <span>
            <strong>
              DB Sync
            </strong>
            <small>
              {currentUser}
            </small>
          </span>
        </div>

        <button
          type="button"
          disabled={isBusy}
          onClick={() =>
            void handleSignOut()
          }
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="supabase-sync-account">
      <div className="supabase-sync-account__title">
        <Database size={15} />

        <span>
          <strong>
            Database sync
          </strong>

          <small>
            Sign in to queue edits for MASTER_CLEAN.db and DJ.db.
          </small>
        </span>
      </div>

      <div className="supabase-sync-account__fields">
        <input
          type="email"
          value={email}
          placeholder="Supabase email"
          autoComplete="username"
          onChange={(event) =>
            setEmail(
              event.target.value,
            )
          }
        />

        <input
          type="password"
          value={password}
          placeholder="Password"
          autoComplete="current-password"
          onChange={(event) =>
            setPassword(
              event.target.value,
            )
          }
          onKeyDown={(event) => {
            if (
              event.key ===
              "Enter"
            ) {
              void handleSignIn();
            }
          }}
        />

        <button
          type="button"
          disabled={
            isBusy ||
            !email.trim() ||
            !password
          }
          onClick={() =>
            void handleSignIn()
          }
        >
          <LogIn size={14} />
          {isBusy
            ? "Signing in..."
            : "Sign in"}
        </button>
      </div>

      {message && (
        <small className="supabase-sync-account__message">
          {message}
        </small>
      )}
    </div>
  );
}
