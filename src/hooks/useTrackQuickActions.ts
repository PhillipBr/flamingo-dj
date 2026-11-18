import { useEffect, useRef, useState } from "react";
import type { Track } from "../types/track";

export function useTrackQuickActions() {
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const notify = (message: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(""), 2200);
  };

  const copyTitle = async (track: Track) => {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(track.title);
          notify("Title is copied");
          return;
        } catch { /* Try the fallback when clipboard permission is unavailable. */ }
      }
      const previousFocus = document.activeElement;
      const field = document.createElement("textarea");
      field.value = track.title;
      field.readOnly = true;
      field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(field);
      let copied = false;
      try {
        field.select();
        copied = document.execCommand("copy");
      } finally {
        field.remove();
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
      }
      notify(copied ? "Title is copied" : "Could not copy title");
    } catch {
      notify("Could not copy title");
    }
  };

  const openSpotify = (track: Track) => {
    const link = track.spotifyUrl?.trim();
    if (!link) { notify("Spotify link is unavailable"); return; }
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") {
        notify("Spotify link is unavailable");
        return;
      }
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      notify("Spotify link is unavailable");
    }
  };
  return { notice, copyTitle, openSpotify };
}
