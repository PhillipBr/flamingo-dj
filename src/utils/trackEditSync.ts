import type {
  Track,
} from "../types/track";

import {
  buildTrackEditPayload,
  queuePendingTrackEdit,
} from "../api/pendingTrackEditsApi";

export type LocalJsonSaveResult = {
  saved: boolean;
  catalogUpdated: boolean;
  legacyFilesUpdated: number;
  error: string | null;
};

export type TrackEditSyncResult = {
  localJsonSaved: boolean;
  catalogUpdated: boolean;
  legacyFilesUpdated: number;

  supabaseQueued: boolean;

  warnings: string[];
};

async function saveLocalJson(
  original: Track,
  changes: Partial<Track>,
): Promise<LocalJsonSaveResult> {
  /*
   * A static GitHub Pages build cannot directly modify files in the
   * repository. Local Vite can, through flamingoTrackEditPlugin.
   */
  if (!import.meta.env.DEV) {
    return {
      saved: false,
      catalogUpdated: false,
      legacyFilesUpdated: 0,
      error:
        "Static production build cannot write repository JSON directly.",
    };
  }

  try {
    const response =
      await fetch(
        "/api/flamingo/track-edit",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              songId:
                original
                  .externalSongId ??
                original.id,

              changes,
            }),
        },
      );

    const payload =
      await response
        .json()
        .catch(
          () => null,
        ) as {
          ok?: boolean;
          catalogUpdated?: boolean;
          legacyFilesUpdated?: number;
          error?: string;
        } | null;

    if (
      !response.ok ||
      !payload?.ok
    ) {
      return {
        saved: false,
        catalogUpdated: false,
        legacyFilesUpdated: 0,

        error:
          payload?.error ??
          (
            "Local JSON save failed "
            + `(${response.status}).`
          ),
      };
    }

    return {
      saved: true,

      catalogUpdated:
        Boolean(
          payload
            .catalogUpdated,
        ),

      legacyFilesUpdated:
        Number(
          payload
            .legacyFilesUpdated ??
          0,
        ),

      error: null,
    };
  } catch (error) {
    return {
      saved: false,
      catalogUpdated: false,
      legacyFilesUpdated: 0,

      error:
        error instanceof Error
          ? error.message
          : "Local JSON save failed.",
    };
  }
}

export async function syncTrackEdit(
  original: Track,
  changes: Partial<Track>,
): Promise<TrackEditSyncResult> {
  const warnings:
    string[] = [];

  const payload =
    buildTrackEditPayload(
      original,
      changes,
    );

  const noMasterChanges =
    Object.keys(
      payload.masterChanges,
    ).length === 0;

  const noDjChanges =
    Object.keys(
      payload.djChanges,
    ).length === 0;

  if (
    noMasterChanges &&
    noDjChanges
  ) {
    return {
      localJsonSaved: true,
      catalogUpdated: false,
      legacyFilesUpdated: 0,
      supabaseQueued: true,
      warnings: [],
    };
  }

  /*
   * ORDER IS DELIBERATE:
   *
   * 1. Flamingo DJ saves its JSON.
   * 2. Only after that, queue the DB change in Supabase.
   *
   * APPLY_PENDING_EDITS.py is NOT part of this operation.
   * It remains a separate database-maintenance script.
   */
  const jsonResult =
    await saveLocalJson(
      original,
      changes,
    );

  /*
   * Local development must successfully save JSON before we queue
   * the database edit. Otherwise the page would refresh back to old data.
   */
  if (
    import.meta.env.DEV &&
    !jsonResult.saved
  ) {
    return {
      localJsonSaved: false,
      catalogUpdated: false,
      legacyFilesUpdated: 0,
      supabaseQueued: false,

      warnings: [
        (
          "JSON was not saved. "
          + (
            jsonResult.error ??
            "Unknown local JSON error."
          )
        ),
        (
          "Supabase was NOT queued "
          + "because JSON save must succeed first."
        ),
      ],
    };
  }

  /*
   * Production / GitHub Pages cannot write local repository JSON.
   * It can still queue Supabase edits.
   *
   * Later, Lite should use a writable remote catalog or a build workflow.
   */
  if (
    !import.meta.env.DEV &&
    jsonResult.error
  ) {
    warnings.push(
      jsonResult.error,
    );
  }

  let supabaseQueued = false;

  try {
    await queuePendingTrackEdit(
      payload,
    );

    supabaseQueued = true;
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Supabase edit queue failed.",
    );
  }

  return {
    localJsonSaved:
      jsonResult.saved,

    catalogUpdated:
      jsonResult
        .catalogUpdated,

    legacyFilesUpdated:
      jsonResult
        .legacyFilesUpdated,

    supabaseQueued,

    warnings,
  };
}
