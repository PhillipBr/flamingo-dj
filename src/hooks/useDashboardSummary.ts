import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  DashboardSummary,
} from "../types/dashboard";

import {
  buildDashboardSummary,
  savePinnedPlaylistIds,
} from "../utils/dashboardInsights";

export function useDashboardSummary() {
  const [
    summary,
    setSummary,
  ] =
    useState<DashboardSummary>(
      buildDashboardSummary,
    );

  const refresh =
    useCallback(
      () => {
        setSummary(
          buildDashboardSummary(),
        );
      },
      [],
    );

  useEffect(() => {
    const handleStorage =
      () => {
        refresh();
      };

    window.addEventListener(
      "storage",
      handleStorage,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage,
      );
    };
  }, [
    refresh,
  ]);

  function togglePin(
    playlistId: string,
  ) {
    const pinned =
      summary.quickPlaylists
        .filter(
          (item) =>
            item.pinned,
        )
        .map(
          (item) => {
            const record =
              item.playlist as unknown as Record<
                string,
                unknown
              >;

            return typeof record.id ===
              "string"
              ? record.id
              : "";
          },
        )
        .filter(Boolean);

    const next =
      pinned.includes(
        playlistId,
      )
        ? pinned.filter(
            (id) =>
              id !==
              playlistId,
          )
        : [
            ...pinned,
            playlistId,
          ];

    savePinnedPlaylistIds(
      next,
    );

    refresh();
  }

  return {
    summary,
    refresh,
    togglePin,
  };
}
