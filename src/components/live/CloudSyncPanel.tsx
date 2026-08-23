import {
  Cloud,
  CloudDownload,
  CloudUpload,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  useCloudSync,
} from "../../hooks/useCloudSync";

import "./CloudSyncPanel.css";

export default function CloudSyncPanel() {
  const {
    isConfigured,
    user,
    status,
    message,
    lastSyncAt,
    signIn,
    signUp,
    signOut,
    push,
    pull,
  } =
    useCloudSync();

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const busy =
    status ===
    "loading";

  async function handlePull() {
    const confirmed =
      window.confirm(
        "Pull Cloud data to this device? This will overwrite the local Flamingo state for synced sections.",
      );

    if (!confirmed) {
      return;
    }

    const success =
      await pull();

    if (success) {
      window.location.reload();
    }
  }

  return (
    <section className="cloud-sync-panel">
      <header>
        <div>
          <Cloud
            size={16}
          />

          <div>
            <span>
              Multi-device persistence
            </span>

            <strong>
              Flamingo Cloud
            </strong>
          </div>
        </div>

        {user && (
          <small>
            {user.email ??
              "Signed in"}
          </small>
        )}
      </header>

      {!isConfigured ? (
        <div className="cloud-sync-panel__setup">
          <ShieldCheck
            size={15}
          />

          <div>
            <strong>
              Supabase configuration required
            </strong>

            <p>
              Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local .env file,
              run the included Supabase schema, then restart Vite.
            </p>
          </div>
        </div>
      ) : !user ? (
        <div className="cloud-sync-panel__auth">
          <label>
            <span>
              Email
            </span>

            <input
              type="email"
              value={
                email
              }
              autoComplete="email"
              onChange={(
                event,
              ) =>
                setEmail(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <label>
            <span>
              Password
            </span>

            <input
              type="password"
              value={
                password
              }
              autoComplete="current-password"
              onChange={(
                event,
              ) =>
                setPassword(
                  event.target
                    .value,
                )
              }
            />
          </label>

          <button
            type="button"
            disabled={
              busy ||
              !email.trim() ||
              password.length <
                6
            }
            onClick={() =>
              void signIn(
                email,
                password,
              )
            }
          >
            <LogIn
              size={12}
            />
            Sign in
          </button>

          <button
            type="button"
            disabled={
              busy ||
              !email.trim() ||
              password.length <
                6
            }
            onClick={() =>
              void signUp(
                email,
                password,
              )
            }
          >
            <UserPlus
              size={12}
            />
            Create account
          </button>
        </div>
      ) : (
        <>
          <div className="cloud-sync-panel__actions">
            <button
              type="button"
              disabled={
                busy
              }
              onClick={() =>
                void push()
              }
            >
              <CloudUpload
                size={13}
              />
              Push Local → Cloud
            </button>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={() =>
                void handlePull()
              }
            >
              <CloudDownload
                size={13}
              />
              Pull Cloud → Local
            </button>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={() =>
                void signOut()
              }
            >
              <LogOut
                size={12}
              />
              Sign out
            </button>
          </div>

          <div className="cloud-sync-panel__scope">
            <span>
              Event Profiles
            </span>
            <span>
              Performance History
            </span>
            <span>
              Audience Response
            </span>
            <span>
              Current Set
            </span>
            <span>
              Event Plan
            </span>
            <span>
              Live Session
            </span>
            <span>
              Pre-Event Preset
            </span>
          </div>
        </>
      )}

      {(message ||
        lastSyncAt) && (
        <footer
          className={
            status ===
            "error"
              ? "cloud-sync-panel__status cloud-sync-panel__status--error"
              : "cloud-sync-panel__status"
          }
        >
          <span>
            {message}
          </span>

          {lastSyncAt && (
            <small>
              Last sync:{" "}
              {new Date(
                lastSyncAt,
              ).toLocaleString()}
            </small>
          )}
        </footer>
      )}
    </section>
  );
}
