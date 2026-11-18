import { useCallback, useEffect, useState } from "react";
import type { Track } from "../types/track";
import type { PlayedEntry, PlayedSession } from "../types/playedSession";

const KEY = "flamingo-dj-played-session-v2";
const EMPTY: PlayedSession = { active: false, startedAt: null, playedIds: [], entries: [] };
function load(): PlayedSession {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PlayedSession> | null;
    if (value && Array.isArray(value.entries) && Array.isArray(value.playedIds)) {
      return { active: Boolean(value.active), startedAt: value.startedAt ?? null, entries: value.entries, playedIds: value.playedIds };
    }
  } catch { /* Invalid or inaccessible storage */ }
  return EMPTY;
}
export function usePlayedTracks() {
  const [session, setSession] = useState<PlayedSession>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* Storage full */ } }, [session]);
  const startSession = useCallback(() => setSession((old) => ({ ...old, active: true, startedAt: new Date().toISOString(), entries: [] })), []);
  const toggleActive = useCallback(() => setSession((old) => ({ ...old, active: !old.active, startedAt: old.active ? old.startedAt : (old.startedAt ?? new Date().toISOString()) })), []);
  const reset = useCallback(() => setSession({ ...EMPTY }), []);
  // P always toggles the visual mark. Only an active session records a play.
  const togglePlayed = useCallback((track: Track, playlistName: string) => setSession((old) => {
    if (old.playedIds.includes(track.id)) {
      return { ...old, playedIds: old.playedIds.filter((id) => id !== track.id) };
    }
    const playedIds = [...old.playedIds, track.id];
    if (!old.active) return { ...old, playedIds };
    const entry: PlayedEntry = {
      playOrder: old.entries.length + 1, trackId: track.id,
      songId: track.externalSongId || track.id, title: track.title,
      artist: track.artist, playlistName, playedAt: new Date().toISOString(),
    };
    return { ...old, playedIds, entries: [...old.entries, entry] };
  }), []);
  const logAgain = useCallback((track: Track, playlistName: string) => setSession((old) => {
    if (!old.active) return old;
    return {
      ...old,
      playedIds: old.playedIds.includes(track.id) ? old.playedIds : [...old.playedIds, track.id],
      entries: [...old.entries, {
        playOrder: old.entries.length + 1, trackId: track.id,
        songId: track.externalSongId || track.id, title: track.title,
        artist: track.artist, playlistName, playedAt: new Date().toISOString(),
      }],
    };
  }), []);
  return { ...session, startSession, toggleActive, reset, togglePlayed, logAgain };
}
