import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  EventProfile,
  EventProfileType,
} from "../types/eventProfile";

import {
  createEventProfile,
  loadEventProfileState,
  saveEventProfileState,
} from "../utils/eventProfileStorage";

export function useEventProfiles() {
  const [
    state,
    setState,
  ] =
    useState(
      loadEventProfileState,
    );

  useEffect(() => {
    saveEventProfileState(
      state,
    );
  }, [state]);

  const activeProfile =
    useMemo(
      () =>
        state.profiles.find(
          (profile) =>
            profile.id ===
            state.activeProfileId,
        ) ??
        state.profiles[0] ??
        null,
      [
        state.activeProfileId,
        state.profiles,
      ],
    );

  const setActiveProfileId =
    useCallback(
      (
        profileId:
          string,
      ) => {
        setState(
          (current) => ({
            ...current,

            activeProfileId:
              current.profiles.some(
                (profile) =>
                  profile.id ===
                  profileId,
              )
                ? profileId
                : current.activeProfileId,
          }),
        );
      },
      [],
    );

  const addProfile =
    useCallback(
      ({
        name,
        type,
        location,
        notes,
      }: {
        name: string;

        type:
          EventProfileType;

        location?: string;

        notes?: string;
      }): EventProfile | null => {
        const cleanName =
          name.trim();

        if (!cleanName) {
          return null;
        }

        const profile =
          createEventProfile(
            cleanName,
            type,
            location,
            notes,
          );

        setState(
          (current) => ({
            profiles: [
              ...current.profiles,
              profile,
            ],

            activeProfileId:
              profile.id,
          }),
        );

        return profile;
      },
      [],
    );

  const deleteProfile =
    useCallback(
      (
        profileId:
          string,
      ) => {
        if (
          profileId ===
          "global"
        ) {
          return;
        }

        setState(
          (current) => {
            const profiles =
              current.profiles.filter(
                (profile) =>
                  profile.id !==
                  profileId,
              );

            return {
              profiles,

              activeProfileId:
                current.activeProfileId ===
                profileId
                  ? profiles[0]?.id ??
                    null
                  : current.activeProfileId,
            };
          },
        );
      },
      [],
    );

  return {
    profiles:
      state.profiles,

    activeProfile,

    activeProfileId:
      state.activeProfileId,

    setActiveProfileId,

    addProfile,

    deleteProfile,
  };
}
