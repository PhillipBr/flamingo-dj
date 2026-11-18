import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Track } from "../types/track";
import { trackWindow } from "../utils/virtualTrackRange";

export function useVirtualTrackRows(tracks: Track[], wrapperRef: RefObject<HTMLDivElement | null>, layoutKey: string) {
  const heights = useRef(new Map<string, number>());
  const frame = useRef<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [viewport, setViewport] = useState({top: 0, height: 600});
  const offsets = useMemo(() => {
    const result = [0];
    for (const track of tracks) result.push(result[result.length - 1] + (heights.current.get(track.id) ?? 64));
    return result;
  }, [tracks, revision]);
  const range = trackWindow(offsets, viewport.top, viewport.height);

  const readViewport = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const header = wrapper.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = Math.max(0, wrapper.scrollTop - header);
    const height = wrapper.clientHeight || 600;
    setViewport(old => old.top === top && old.height === height ? old : {top, height});
  }, [wrapperRef]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onScroll = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {frame.current = null; readViewport();});
    };
    wrapper.addEventListener("scroll", onScroll, {passive: true});
    window.addEventListener("resize", onScroll);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    observer?.observe(wrapper);
    readViewport();
    return () => {
      wrapper.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [wrapperRef, readViewport, tracks.length]);

  useLayoutEffect(() => {
    heights.current.clear();
    setRevision(value => value + 1);
  }, [layoutKey]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rows = Array.from(wrapper.querySelectorAll<HTMLTableRowElement>("tbody tr[data-track-id]"));
    const measure = () => {
      let changed = false;
      for (const row of rows) {
        const id = row.dataset.trackId;
        const height = row.getBoundingClientRect().height;
        if (id && height > 0 && Math.abs((heights.current.get(id) ?? 64) - height) > 0.5) {
          heights.current.set(id, height); changed = true;
        }
      }
      if (changed) setRevision(value => value + 1);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    rows.forEach(row => observer?.observe(row));
    return () => observer?.disconnect();
  }, [range.start, range.end, tracks, layoutKey, wrapperRef]);

  // Clamp scroll after a search/filter shrinks the collection.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const maximum = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
    if (wrapper.scrollTop > maximum) wrapper.scrollTop = maximum;
    readViewport();
  }, [tracks, readViewport, wrapperRef]);

  const revealTrack = useCallback((id: string) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const index = tracks.findIndex(track => track.id === id);
    if (index < 0) return;
    const header = wrapper.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const start = offsets[index] + header;
    const end = offsets[index + 1] + header;
    const visibleTop = wrapper.scrollTop + header;
    if (start < visibleTop) wrapper.scrollTop = Math.max(0, start - header);
    else if (end > wrapper.scrollTop + wrapper.clientHeight) wrapper.scrollTop = end - wrapper.clientHeight;
    readViewport();
  }, [tracks, offsets, readViewport, wrapperRef]);

  return {...range, revealTrack};
}
