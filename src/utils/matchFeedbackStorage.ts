import { createClient } from "@supabase/supabase-js";

import type {
  MatchFeedbackRecord,
  MatchHumanRating,
} from "../types/matchV2";

const STORAGE_KEY = "flamingo-dj-match-feedback-v2";

const supabaseUrl = String(
  import.meta.env.VITE_SUPABASE_URL ?? "",
).trim();

const supabaseAnonKey = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function validRating(value: unknown): value is MatchHumanRating {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function loadMatchFeedbackLocal(): MatchFeedbackRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is MatchFeedbackRecord =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.sourceTrackId === "string" &&
        typeof item.targetTrackId === "string" &&
        validRating(item.rating),
    );
  } catch {
    return [];
  }
}

function saveLocal(records: MatchFeedbackRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function upsertLocal(record: MatchFeedbackRecord): MatchFeedbackRecord[] {
  const current = loadMatchFeedbackLocal();

  const index = current.findIndex(
    (item) =>
      item.sourceTrackId === record.sourceTrackId &&
      item.targetTrackId === record.targetTrackId &&
      item.sourcePlaylistId === record.sourcePlaylistId &&
      item.targetPlaylistId === record.targetPlaylistId,
  );

  const next = [...current];

  if (index >= 0) {
    next[index] = {
      ...record,
      createdAt: current[index].createdAt,
    };
  } else {
    next.push(record);
  }

  saveLocal(next);
  return next;
}

export async function loadMatchFeedback(): Promise<MatchFeedbackRecord[]> {
  const local = loadMatchFeedbackLocal();
  if (!supabase) return local;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return local;

  const { data, error } = await supabase
    .from("dj_match_feedback")
    .select(
      "source_track_id,target_track_id,source_playlist_id,target_playlist_id,rating,technical_score,bpm_score,key_score,energy_score,created_at,updated_at",
    );

  if (error || !Array.isArray(data)) return local;

  const cloud: MatchFeedbackRecord[] = [];

  for (const row of data) {
    if (!validRating(row.rating)) continue;

    cloud.push({
      sourceTrackId: String(row.source_track_id),
      targetTrackId: String(row.target_track_id),
      sourcePlaylistId: row.source_playlist_id
        ? String(row.source_playlist_id)
        : null,
      targetPlaylistId: row.target_playlist_id
        ? String(row.target_playlist_id)
        : null,
      rating: row.rating,
      technicalScore: Number(row.technical_score) || 0,
      bpmScore: Number(row.bpm_score) || 0,
      keyScore: Number(row.key_score) || 0,
      energyScore: Number(row.energy_score) || 0,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    });
  }

  const merged = new Map<string, MatchFeedbackRecord>();

  for (const item of [...local, ...cloud]) {
    const key = [
      item.sourceTrackId,
      item.targetTrackId,
      item.sourcePlaylistId ?? "",
      item.targetPlaylistId ?? "",
    ].join("::");

    merged.set(key, item);
  }

  const result = Array.from(merged.values());
  saveLocal(result);
  return result;
}

export async function saveMatchRating(args: {
  sourceTrackId: string;
  targetTrackId: string;
  sourcePlaylistId: string | null;
  targetPlaylistId: string | null;
  rating: MatchHumanRating;
  technicalScore: number;
  bpmScore: number;
  keyScore: number;
  energyScore: number;
}): Promise<MatchFeedbackRecord[]> {
  const now = new Date().toISOString();

  const record: MatchFeedbackRecord = {
    ...args,
    createdAt: now,
    updatedAt: now,
  };

  const local = upsertLocal(record);
  if (!supabase) return local;

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return local;

  const { error } = await supabase
    .from("dj_match_feedback")
    .upsert(
      {
        user_id: user.id,
        source_track_id: args.sourceTrackId,
        target_track_id: args.targetTrackId,
        source_playlist_id: args.sourcePlaylistId,
        target_playlist_id: args.targetPlaylistId,
        rating: args.rating,
        technical_score: args.technicalScore,
        bpm_score: args.bpmScore,
        key_score: args.keyScore,
        energy_score: args.energyScore,
        updated_at: now,
      },
      {
        onConflict:
          "user_id,source_track_id,target_track_id,source_playlist_id,target_playlist_id",
      },
    );

  if (error) {
    console.warn(
      "MATCH V2: Supabase save failed. Local rating is preserved.",
      error,
    );
  }

  return local;
}
