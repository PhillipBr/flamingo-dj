import {
  Activity,
  ListMusic,
  Plus,
  RotateCcw,
  WandSparkles,
  Wrench,
} from "lucide-react";

import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import PlaylistRepairPanel from "../tracks/PlaylistRepairPanel";
import SetJourneyPanel from "../tracks/SetJourneyPanel";
import SetlistGeneratorModal from "../tracks/SetlistGeneratorModal";

import PlaylistCreator from "./PlaylistCreator";

import type { Playlist } from "../../types/playlist";
import type { CurrentSet } from "../../types/setlist";
import type {
  SetlistEventPlan,
  SetlistInsertMode,
} from "../../types/setlistGenerator";
import type { Track } from "../../types/track";

import {
  createCurrentSetItem,
} from "../../utils/currentSetStorage";

import "./LiveSetWorkspace.css";

type Props = {
  tracks: Track[];
  playlists: Playlist[];
  currentSet: CurrentSet;
  setCurrentSet: Dispatch<SetStateAction<CurrentSet>>;
  eventPlan: SetlistEventPlan | null;
};

export default function LiveSetWorkspace({
  tracks,
  playlists,
  currentSet,
  setCurrentSet,
  eventPlan,
}: Props) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const [isJourneyOpen, setIsJourneyOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  const selectedPlaylist = playlists.find(
    (playlist) => playlist.id === selectedPlaylistId,
  ) ?? null;

  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );

  const temporaryTracks = useMemo(
    () => currentSet.items
      .map((item) => trackById.get(item.trackId) ?? null)
      .filter((track): track is Track => track !== null),
    [currentSet.items, trackById],
  );

  function playlistItems(playlist: Playlist) {
    return playlist.trackIds
      .filter((trackId) => trackById.has(trackId))
      .map((trackId) => createCurrentSetItem(trackId));
  }

  function replaceWithPlaylist() {
    if (!selectedPlaylist) return;

    setCurrentSet((current) => ({
      ...current,
      name: `Live · ${selectedPlaylist.name}`,
      items: playlistItems(selectedPlaylist),
      updatedAt: new Date().toISOString(),
    }));
  }

  function appendPlaylist() {
    if (!selectedPlaylist) return;

    setCurrentSet((current) => {
      const existing = new Set(current.items.map((item) => item.trackId));
      const additions = playlistItems(selectedPlaylist)
        .filter((item) => !existing.has(item.trackId));

      return {
        ...current,
        items: [...current.items, ...additions],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function clearTemporarySet() {
    if (
      currentSet.items.length > 0 &&
      !window.confirm("Clear the temporary Live playlist?")
    ) {
      return;
    }

    setCurrentSet((current) => ({
      ...current,
      name: "Current Set",
      items: [],
      updatedAt: new Date().toISOString(),
    }));
  }

  function insertBridge(afterTrackId: string, bridgeTrackId: string) {
    setCurrentSet((current) => {
      if (current.items.some((item) => item.trackId === bridgeTrackId)) {
        return current;
      }

      const items = [...current.items];
      const index = items.findIndex((item) => item.trackId === afterTrackId);
      items.splice(index < 0 ? items.length : index + 1, 0, createCurrentSetItem(bridgeTrackId));

      return {
        ...current,
        items,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function replaceTrack(trackId: string, replacementTrackId: string) {
    setCurrentSet((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.trackId === trackId
          ? createCurrentSetItem(replacementTrackId, item.plannedPlaySeconds)
          : item,
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  function applyOrder(trackIds: string[]) {
    const itemById = new Map(currentSet.items.map((item) => [item.trackId, item]));

    setCurrentSet((current) => ({
      ...current,
      items: trackIds
        .map((trackId) => itemById.get(trackId) ?? createCurrentSetItem(trackId)),
      updatedAt: new Date().toISOString(),
    }));
  }

  function applyGeneratedSet(
    generatedTracks: Track[],
    mode: SetlistInsertMode,
    plannedPlaySeconds = 60,
  ) {
    const items = generatedTracks.map((track) =>
      createCurrentSetItem(track.id, plannedPlaySeconds),
    );

    setCurrentSet((current) => {
      if (mode === "replace") {
        return {
          ...current,
          name: "Live · Generated Set",
          items,
          updatedAt: new Date().toISOString(),
        };
      }

      const existing = new Set(current.items.map((item) => item.trackId));

      return {
        ...current,
        items: [
          ...current.items,
          ...items.filter((item) => !existing.has(item.trackId)),
        ],
        updatedAt: new Date().toISOString(),
      };
    });

    setIsGeneratorOpen(false);
  }

  return (
    <>
      <PlaylistCreator
        tracks={tracks}
        playlists={playlists}
        setCurrentSet={setCurrentSet}
      />

      <section className="live-set-workspace">
        <header className="live-set-workspace__header">
          <div>
            <span>TEMPORARY LIVE PLAYLIST</span>
            <strong>{currentSet.name || "Current Set"}</strong>
            <small>{currentSet.items.length} tracks · changes remain in Current Set until you clear or replace it.</small>
          </div>
        </header>

        <div className="live-set-workspace__loader">
          <select
            value={selectedPlaylistId}
            onChange={(event) => setSelectedPlaylistId(event.target.value)}
          >
            <option value="">Choose a playlist...</option>
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name} · {playlist.trackIds.length} tracks
              </option>
            ))}
          </select>

          <button type="button" disabled={!selectedPlaylist} onClick={replaceWithPlaylist}>
            <ListMusic size={15} /> Load as temporary set
          </button>

          <button type="button" disabled={!selectedPlaylist} onClick={appendPlaylist}>
            <Plus size={15} /> Add playlist
          </button>
        </div>

        <div className="live-set-workspace__actions">
          <button type="button" disabled={currentSet.items.length === 0} onClick={() => setIsJourneyOpen(true)}>
            <Activity size={15} /> Set Journey
          </button>

          <button type="button" disabled={currentSet.items.length < 2} onClick={() => setIsRepairOpen(true)}>
            <Wrench size={15} /> Repair Set
          </button>

          <button type="button" onClick={() => setIsGeneratorOpen(true)}>
            <WandSparkles size={15} /> Quick Generate
          </button>

          <button type="button" disabled={currentSet.items.length === 0} onClick={clearTemporarySet}>
            <RotateCcw size={15} /> Clear temporary set
          </button>
        </div>

        {temporaryTracks.length > 0 && (
          <div className="live-set-workspace__preview">
            {temporaryTracks.slice(0, 8).map((track, index) => (
              <span key={track.id} title={`${track.title} · ${track.artist}`}>
                <b>{index + 1}</b> {track.title}
              </span>
            ))}

            {temporaryTracks.length > 8 && (
              <span>+{temporaryTracks.length - 8} more</span>
            )}
          </div>
        )}

        <SetJourneyPanel
          isOpen={isJourneyOpen}
          currentSet={currentSet}
          tracks={tracks}
          eventPlan={eventPlan}
          onClose={() => setIsJourneyOpen(false)}
        />

        <PlaylistRepairPanel
          isOpen={isRepairOpen}
          playlistName={currentSet.name || "Temporary Live Set"}
          playlistTracks={temporaryTracks}
          allTracks={tracks}
          onClose={() => setIsRepairOpen(false)}
          onInsertBridge={insertBridge}
          onReplaceTrack={replaceTrack}
          onApplyOrder={applyOrder}
        />

        <SetlistGeneratorModal
          isOpen={isGeneratorOpen}
          tracks={tracks}
          selectedTrack={temporaryTracks[temporaryTracks.length - 1] ?? null}
          onClose={() => setIsGeneratorOpen(false)}
          onApply={applyGeneratedSet}
        />
      </section>
    </>
  );
}
