import type {
  Track,
} from "../types/track";

import {
  isSupabaseConfigured,
  supabase,
} from "./supabaseClient";

export type PendingMasterChanges = {
  title?: string;
  artist?: string;
  releaseDate?: string | null;
  genre?: string | null;
  popularity?: number | null;
};

export type PendingDjChanges = {
  title?: string;
  artist?: string;
  releaseDate?: string | null;
  genre?: string | null;
  popularity?: number | null;
  tempo?: number | null;
  musicalKey?: string | null;
  energy?: number | null;
  keywords?: string[];
};

export type TrackEditPayload = {
  songId: string;
  masterChanges:
    PendingMasterChanges;
  djChanges:
    PendingDjChanges;
};

function changed<T>(
  before: T,
  after: T,
): boolean {
  return JSON.stringify(before) !==
    JSON.stringify(after);
}

export function buildTrackEditPayload(
  original: Track,
  changes: Partial<Track>,
): TrackEditPayload {
  const next: Track = {
    ...original,
    ...changes,
  };

  const masterChanges:
    PendingMasterChanges = {};

  const djChanges:
    PendingDjChanges = {};

  if (
    changed(
      original.title,
      next.title,
    )
  ) {
    masterChanges.title =
      next.title;

    djChanges.title =
      next.title;
  }

  if (
    changed(
      original.artist,
      next.artist,
    )
  ) {
    masterChanges.artist =
      next.artist;

    djChanges.artist =
      next.artist;
  }

  if (
    changed(
      original.releaseDate,
      next.releaseDate,
    )
  ) {
    masterChanges.releaseDate =
      next.releaseDate;

    djChanges.releaseDate =
      next.releaseDate;
  }

  if (
    changed(
      original.genre,
      next.genre,
    )
  ) {
    masterChanges.genre =
      next.genre;

    djChanges.genre =
      next.genre;
  }

  if (
    changed(
      original.spotifyPopularity,
      next.spotifyPopularity,
    )
  ) {
    masterChanges.popularity =
      next.spotifyPopularity;

    djChanges.popularity =
      next.spotifyPopularity;
  }

  if (
    changed(
      original.tempo,
      next.tempo,
    )
  ) {
    djChanges.tempo =
      next.tempo;
  }

  if (
    changed(
      original.musicalKey,
      next.musicalKey,
    )
  ) {
    djChanges.musicalKey =
      next.musicalKey;
  }

  if (
    changed(
      original.energy,
      next.energy,
    )
  ) {
    djChanges.energy =
      next.energy;
  }

  if (
    changed(
      original.keywords,
      next.keywords,
    )
  ) {
    djChanges.keywords =
      next.keywords;
  }

  return {
    songId:
      original.externalSongId ??
      original.id,

    masterChanges,
    djChanges,
  };
}

export async function queuePendingTrackEdit(
  payload: TrackEditPayload,
): Promise<void> {
  if (
    !isSupabaseConfigured()
  ) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  const {
    data: sessionData,
  } =
    await supabase.auth
      .getSession();

  if (
    !sessionData.session
  ) {
    throw new Error(
      "Supabase DB Sync is signed out. Sign in first, then save again.",
    );
  }

  const {
    error,
  } =
    await supabase.rpc(
      "queue_track_edit",
      {
        p_song_id:
          payload.songId,

        p_master_changes:
          payload.masterChanges,

        p_dj_changes:
          payload.djChanges,
      },
    );

  if (error) {
    throw error;
  }
}
