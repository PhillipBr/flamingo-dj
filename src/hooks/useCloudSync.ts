import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  User,
} from "@supabase/supabase-js";

import type {
  CloudSyncUiStatus,
} from "../types/cloudSync";

import {
  isSupabaseConfigured,
  supabase,
} from "../lib/supabaseClient";

import {
  getCloudUser,
  pullCloudStateToLocal,
  pushLocalStateToCloud,
  signInCloudUser,
  signOutCloudUser,
  signUpCloudUser,
} from "../utils/cloudSyncService";

export function useCloudSync() {
  const [
    user,
    setUser,
  ] =
    useState<User | null>(
      null,
    );

  const [
    status,
    setStatus,
  ] =
    useState<CloudSyncUiStatus>(
      "idle",
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      "",
    );

  const [
    lastSyncAt,
    setLastSyncAt,
  ] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    if (
      !isSupabaseConfigured ||
      !supabase
    ) {
      return;
    }

    void getCloudUser().then(
      setUser,
    );

    const {
      data,
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session,
        ) => {
          setUser(
            session?.user ??
              null,
          );
        },
      );

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const run =
    useCallback(
      async (
        operation:
          () => Promise<{
            scopesProcessed: number;
            completedAt: string;
          }>,
        successLabel:
          string,
      ) => {
        setStatus(
          "loading",
        );

        setMessage(
          "",
        );

        try {
          const result =
            await operation();

          setLastSyncAt(
            result.completedAt,
          );

          setStatus(
            "success",
          );

          setMessage(
            `${successLabel}: ${result.scopesProcessed} data scopes.`,
          );

          return true;
        } catch (error) {
          setStatus(
            "error",
          );

          setMessage(
            error instanceof
              Error
              ? error.message
              : "Cloud operation failed.",
          );

          return false;
        }
      },
      [],
    );

  const signIn =
    useCallback(
      async (
        email: string,
        password: string,
      ) => {
        setStatus(
          "loading",
        );

        try {
          await signInCloudUser(
            email,
            password,
          );

          const currentUser =
            await getCloudUser();

          setUser(
            currentUser,
          );

          setStatus(
            "success",
          );

          setMessage(
            "Signed in to Flamingo Cloud.",
          );
        } catch (error) {
          setStatus(
            "error",
          );

          setMessage(
            error instanceof
              Error
              ? error.message
              : "Sign in failed.",
          );
        }
      },
      [],
    );

  const signUp =
    useCallback(
      async (
        email: string,
        password: string,
      ) => {
        setStatus(
          "loading",
        );

        try {
          await signUpCloudUser(
            email,
            password,
          );

          const currentUser =
            await getCloudUser();

          setUser(
            currentUser,
          );

          setStatus(
            "success",
          );

          setMessage(
            currentUser
              ? "Account created and signed in."
              : "Account created. Check your email if Supabase email confirmation is enabled.",
          );
        } catch (error) {
          setStatus(
            "error",
          );

          setMessage(
            error instanceof
              Error
              ? error.message
              : "Account creation failed.",
          );
        }
      },
      [],
    );

  const signOut =
    useCallback(
      async () => {
        setStatus(
          "loading",
        );

        try {
          await signOutCloudUser();

          setUser(
            null,
          );

          setStatus(
            "success",
          );

          setMessage(
            "Signed out.",
          );
        } catch (error) {
          setStatus(
            "error",
          );

          setMessage(
            error instanceof
              Error
              ? error.message
              : "Sign out failed.",
          );
        }
      },
      [],
    );

  const push =
    useCallback(
      () =>
        run(
          pushLocalStateToCloud,
          "Local data uploaded",
        ),
      [
        run,
      ],
    );

  const pull =
    useCallback(
      () =>
        run(
          pullCloudStateToLocal,
          "Cloud data downloaded",
        ),
      [
        run,
      ],
    );

  return {
    isConfigured:
      isSupabaseConfigured,

    user,

    status,

    message,

    lastSyncAt,

    signIn,

    signUp,

    signOut,

    push,

    pull,
  };
}
