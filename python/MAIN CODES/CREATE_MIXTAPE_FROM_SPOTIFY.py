# -*- coding: utf-8 -*-
"""Create a NEW curated React playlist using exact Spotify IDs from a source JSON.
READ: source JSON, normalized catalogs, Spotify playlist, MASTER .env.
WRITE: only destination legacy/normalized playlist JSON and a mismatch report.
Existing destination files are backed up; source, catalogs, DBs and audio stay unchanged.
"""
import argparse
import copy
import json
import os
import re
import shutil
import tempfile
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

SOURCE_PLAYLIST_NAME = "R&B CluB"
OUTPUT_PLAYLIST_NAME = "MIXTAPE"
SPOTIFY_PLAYLIST_ID = "0Ssvzi0VIy7OuarENB8Opa"
DB_ROOT = Path(r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES")
PROJECT = DB_ROOT / "FLAMINGOAPP_DJ_REACT"
MASTER = DB_ROOT / "_FLAMINGO - MASTER"


def read_json(path):
    with Path(path).open(encoding="utf-8-sig") as file:
        return json.load(file)


def slug(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def spotify_id(value):
    value = str(value or "").strip()
    if re.fullmatch(r"[A-Za-z0-9]{22}", value):
        return value
    if value.startswith("spotify:track:"):
        return spotify_id(value.rsplit(":", 1)[-1])
    parsed = urlparse(value)
    if parsed.hostname == "open.spotify.com":
        match = re.search(r"(?:^|/)track/([A-Za-z0-9]{22})(?:/|$)", parsed.path)
        if match:
            return match.group(1)
    return None


def song_id(track):
    for key in ("id", "SongID", "song_id", "externalSongId"):
        value = track.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    raise ValueError("Source track has no SongID/id")


def track_spotify_id(track):
    for key in ("spotifyTrackId", "SpotifyTrackID", "SpotifyID", "SpotifyTrackId", "spotifyUrl", "SpotifyURL", "Spotify_URL", "spotify_url", "SpotifyURI"):
        result = spotify_id(track.get(key))
        if result:
            return result
    return None


def track_list(payload):
    result = payload if isinstance(payload, list) else payload.get("tracks")
    if not isinstance(result, list) or any(not isinstance(t, dict) for t in result):
        raise ValueError("Expected a JSON list of tracks or an object with tracks: [...]")
    return result


def resolve_source(directory, name):
    exact = directory / (name + ".json")
    if exact.exists():
        return exact
    candidates = [p for p in directory.glob("*.json") if p.stem.casefold() == name.casefold()]
    if len(candidates) == 1:
        return candidates[0]
    raise FileNotFoundError(f"Source JSON not found: {exact}. Set --source to the exact file path.")


def make_plan(source, items):
    index = {}
    for track in track_list(source):
        tid = track_spotify_id(track)
        if tid:
            index.setdefault(tid, {})[song_id(track)] = track
    output, missing, seen = [], [], set()
    for position, item in enumerate(items, 1):
        track = item.get("track") or item.get("item")
        if not isinstance(track, dict) or item.get("is_local") or track.get("is_local") or track.get("type", "track") != "track":
            missing.append({"position": position, "reason": "Unavailable/local/non-track item"})
            continue
        # Relinked tracks may expose the original Spotify ID in linked_from.
        ids = [track.get("id"), (track.get("linked_from") or {}).get("id")]
        candidates = {}
        for tid in ids:
            candidates.update(index.get(tid, {}))
        if len(candidates) != 1:
            missing.append({"position": position, "spotifyId": track.get("id"), "title": track.get("name"), "reason": "Not in source" if not candidates else "Ambiguous SongIDs"})
            continue
        sid, matched = next(iter(candidates.items()))
        if sid not in seen:
            seen.add(sid)
            output.append(copy.deepcopy(matched))
    return output, missing


def get_spotify(playlist_id):
    import requests
    from dotenv import load_dotenv
    from spotipy.oauth2 import SpotifyOAuth
    load_dotenv(MASTER / ".env", override=False)
    keys = [os.getenv(k, "").strip() for k in ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI")]
    if not all(keys):
        raise RuntimeError("Missing SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET or SPOTIFY_REDIRECT_URI in MASTER .env")
    auth = SpotifyOAuth(client_id=keys[0], client_secret=keys[1], redirect_uri=keys[2], scope="playlist-read-private playlist-read-collaborative", cache_path=str(MASTER / ".spotify-mixtape-cache"), open_browser=True)

    def get(url):
        if not url.startswith("https://api.spotify.com/v1/"):
            raise RuntimeError("Unexpected Spotify pagination URL")
        for attempt in range(6):
            token = auth.get_access_token(as_dict=False)
            response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=45)
            if response.status_code == 429:
                delay = min(max(float(response.headers.get("Retry-After", "5")), 1), 60)
                print(f"Spotify rate limit. Retrying in {delay:.0f}s...", flush=True)
                time.sleep(delay)
                continue
            if response.status_code >= 500:
                time.sleep(min(2 ** attempt, 15))
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError("Spotify request retry limit reached")

    url = f"https://api.spotify.com/v1/playlists/0Ssvzi0VIy7OuarENB8Opa"
    for _ in range(3):
        metadata = get(url)
        page = metadata.get("items") or metadata.get("tracks")
        if not isinstance(page, dict):
            page = get(url + "/items?limit=50")
        items = []
        while True:
            items.extend(page.get("items", []))
            print(f"Spotify: {len(items)}/{page.get('total', '?')} items", flush=True)
            if not page.get("next"):
                break
            page = get(page["next"])
        after = get(url)
        if after.get("snapshot_id") == metadata.get("snapshot_id"):
            return metadata, items
        print("Playlist changed during reading; retrying...", flush=True)
    raise RuntimeError("Playlist kept changing; no files were written")


def write_outputs(outputs):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    staged, backups, committed = {}, {}, []
    try:
        for path, payload in outputs.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                backup = path.with_name(path.name + f".{stamp}.bak")
                shutil.copy2(path, backup)
                backups[path] = backup
            fd, temp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
            staged[path] = Path(temp)
            with os.fdopen(fd, "w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False, indent=2)
                file.flush()
                os.fsync(file.fileno())
        for path, temp in staged.items():
            os.replace(temp, path)
            committed.append(path)
    except Exception:
        for path in reversed(committed):
            if path in backups:
                shutil.copy2(backups[path], path)
            else:
                path.unlink(missing_ok=True)
        raise
    finally:
        for temp in staged.values():
            temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--source-name", default=SOURCE_PLAYLIST_NAME)
    parser.add_argument("--name", default=OUTPUT_PLAYLIST_NAME)
    parser.add_argument("--spotify-id", default=SPOTIFY_PLAYLIST_ID)
    parser.add_argument("--project", type=Path, default=PROJECT)
    parser.add_argument("--spotify-json", type=Path, help="Offline fixture: {metadata: {...}, items: [...]}")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()
    if any(c in args.name for c in '<>:"/\\|?*') or args.name in {"", ".", ".."} or args.name.endswith((" ", ".")):
        raise ValueError("Output playlist name is not a valid filename")
    base = args.project / "src/data/JSON"
    source_path = args.source or resolve_source(base / "playlists", args.source_name)
    legacy_path = base / "playlists" / (args.name + ".json")
    normalized_path = base / "normalized/playlists" / (args.name + ".json")
    if source_path.resolve() in {legacy_path.resolve(), normalized_path.resolve()} or args.name.casefold() == args.source_name.casefold():
        raise ValueError("Destination must be a NEW playlist name, different from the source")
    source = read_json(source_path)
    if args.spotify_json:
        fixture = read_json(args.spotify_json)
        metadata, items = fixture["metadata"], fixture["items"]
    else:
        metadata, items = get_spotify(args.spotify_id)
    selected, missing = make_plan(source, items)
    print(f"Source: {source_path}\nSpotify: {metadata.get('name')}\nOutput: {args.name}\nSpotify items: {len(items)}\nMatched unique SongIDs: {len(selected)}\nUnmatched: {len(missing)}", flush=True)
    for row in missing:
        print(f"  {row}", flush=True)
    if not selected:
        raise RuntimeError("No matches; refusing to create or overwrite an empty playlist")
    # Normalized output references existing core catalog IDs; never create dangling IDs.
    core = read_json(base / "normalized/catalog/tracks-core.json")
    core_tracks = core.get("tracks") if isinstance(core, dict) else None
    if isinstance(core_tracks, dict):
        core_ids = {str(sid) for sid in core_tracks}
    else:
        core_ids = {song_id(t) for t in track_list(core)}
    ids = [song_id(t) for t in selected]
    absent = [sid for sid in ids if sid not in core_ids]
    if absent:
        raise RuntimeError(f"SongIDs absent from normalized core catalog: {absent}. No writes.")
    now = datetime.now(timezone.utc).isoformat()
    common = {"playlistId": slug(args.name), "playlistName": args.name, "totalTracks": len(selected), "generatedAt": now, "description": metadata.get("description") or "", "curationSpotifyPlaylistId": args.spotify_id, "curationSpotifySnapshotId": metadata.get("snapshot_id"), "derivedFromPlaylist": args.source_name, "derivedFromJson": str(source_path)}
    legacy = dict(common, tracks=selected)
    normalized = dict(common, schemaVersion=6, trackIds=ids)
    report_path = args.project / "python/MAIN CODES/REPORTS" / (args.name + "_MATCH_REPORT.json")
    report = {"generatedAt": now, "source": str(source_path), "spotifyPlaylistId": args.spotify_id, "matchedSongIds": ids, "unmatched": missing}
    print(f"WRITE: {legacy_path}\nWRITE: {normalized_path}\nREPORT: {report_path}", flush=True)
    if args.dry_run:
        print("DRY RUN: no files written")
        return
    if not args.yes and input("Crear/actualizar SOLO esta nueva playlist (backups si existe)? [S/N]: ").strip().lower() not in {"s", "si", "sí", "y", "yes"}:
        print("Cancelled. No writes.")
        return
    write_outputs({legacy_path: legacy, normalized_path: normalized, report_path: report})
    print("MIXTAPE created. Source, catalogs, databases, Spotify and audio unchanged.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"ERROR: {error}")
