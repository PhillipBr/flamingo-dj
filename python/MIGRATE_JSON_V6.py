# -*- coding: utf-8 -*-
"""
MIGRATE_JSON_V6.py
============================================================
One-time safe migration for Flamingo DJ JSON.

Reads:
  src/data/JSON/playlists/*.json                       (legacy playlists)
  src/data/JSON/normalized/catalog/tracks.json         (V5, if present)

Writes:
  src/data/JSON/normalized/catalog/tracks-core.json
  src/data/JSON/normalized/catalog/tracks-extra.json
  src/data/JSON/normalized/playlists/*.json

Safety:
- Never deletes legacy playlists.
- Creates a timestamped backup before writing.
- Uses SongID as canonical identity.
- Existing V5 normalized catalog has priority over legacy track values.
- Legacy files fill missing fields and provide playlist membership/order.
- Re-running is safe: existing V6 values are preserved and missing data filled.
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

DB_ROOT = Path(r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES")
PROJECT_ROOT = DB_ROOT / "FLAMINGOAPP_DJ_REACT"
JSON_ROOT = PROJECT_ROOT / "src" / "data" / "JSON"

LEGACY_PLAYLIST_DIR = JSON_ROOT / "playlists"
NORMALIZED_ROOT = JSON_ROOT / "normalized"
CATALOG_DIR = NORMALIZED_ROOT / "catalog"
NORMALIZED_PLAYLIST_DIR = NORMALIZED_ROOT / "playlists"

V5_CATALOG_PATH = CATALOG_DIR / "tracks.json"
CORE_PATH = CATALOG_DIR / "tracks-core.json"
EXTRA_PATH = CATALOG_DIR / "tracks-extra.json"

BACKUP_ROOT = JSON_ROOT / "_migration_backups"

CORE_FIELDS = {
    "id",
    "externalSongId",
    "title",
    "artist",
    "durationSeconds",
    "durationDisplay",
    "spotifyPopularity",
    "musicalKey",
    "tempo",
    "energy",
    "releaseDate",
}


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def slugify(value: str) -> str:
    import re
    import unicodedata

    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "playlist"


def read_json(path: Path) -> Optional[Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"WARNING: cannot read {path}: {exc}")
        return None


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)


def song_id_of(track: Dict[str, Any]) -> Optional[str]:
    value = (
        track.get("id")
        or track.get("externalSongId")
        or track.get("song_id")
        or track.get("SongID")
    )
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def is_missing(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def merge_fill_missing(
    preferred: Dict[str, Any],
    fallback: Dict[str, Any],
) -> Dict[str, Any]:
    result = dict(preferred)
    for key, value in fallback.items():
        if key not in result or is_missing(result.get(key)):
            result[key] = value
    return result


def split_track(track: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    core: Dict[str, Any] = {}
    extra: Dict[str, Any] = {}

    for key, value in track.items():
        if key in CORE_FIELDS:
            core[key] = value
        else:
            extra[key] = value

    song_id = song_id_of(track)
    if song_id:
        core["id"] = song_id
        core["externalSongId"] = song_id

    return core, extra


def load_track_map(path: Path) -> Dict[str, Dict[str, Any]]:
    payload = read_json(path)
    if not isinstance(payload, dict):
        return {}
    tracks = payload.get("tracks")
    if not isinstance(tracks, dict):
        return {}
    return {
        str(song_id): dict(track)
        for song_id, track in tracks.items()
        if isinstance(track, dict)
    }


def backup_sources() -> Path:
    stamp = time.strftime("%Y%m%d_%H%M%S")
    backup_dir = BACKUP_ROOT / f"V6_{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)

    if LEGACY_PLAYLIST_DIR.exists():
        shutil.copytree(
            LEGACY_PLAYLIST_DIR,
            backup_dir / "playlists",
            dirs_exist_ok=True,
        )

    if NORMALIZED_ROOT.exists():
        shutil.copytree(
            NORMALIZED_ROOT,
            backup_dir / "normalized",
            dirs_exist_ok=True,
        )

    return backup_dir


def main() -> None:
    print("=" * 72)
    print("FLAMINGO DJ - JSON V6 SAFE MIGRATION")
    print("=" * 72)
    print(f"Legacy playlists : {LEGACY_PLAYLIST_DIR}")
    print(f"Normalized root  : {NORMALIZED_ROOT}")
    print()

    if not LEGACY_PLAYLIST_DIR.exists():
        raise FileNotFoundError(
            f"Legacy playlist directory not found:\n{LEGACY_PLAYLIST_DIR}"
        )

    backup_dir = backup_sources()
    print(f"BACKUP: {backup_dir}")
    print()

    # Priority order:
    # 1) existing V6
    # 2) V5 normalized catalog
    # 3) legacy playlist data fills missing values only
    core_tracks = load_track_map(CORE_PATH)
    extra_tracks = load_track_map(EXTRA_PATH)

    v5_tracks = load_track_map(V5_CATALOG_PATH)
    for song_id, track in v5_tracks.items():
        core, extra = split_track(track)
        core_tracks[song_id] = merge_fill_missing(
            core_tracks.get(song_id, {}),
            core,
        )
        extra_tracks[song_id] = merge_fill_missing(
            extra_tracks.get(song_id, {}),
            extra,
        )

    playlist_files = sorted(
        p for p in LEGACY_PLAYLIST_DIR.glob("*.json")
        if p.is_file()
    )

    if not playlist_files:
        raise RuntimeError(
            f"No legacy playlist JSON files found in {LEGACY_PLAYLIST_DIR}"
        )

    total_playlist_refs = 0
    migrated_playlists = 0
    skipped_files = 0

    for index, path in enumerate(playlist_files, start=1):
        payload = read_json(path)
        if not isinstance(payload, dict):
            skipped_files += 1
            continue

        tracks = payload.get("tracks")
        if not isinstance(tracks, list):
            # App-created trackIds-only files are not treated as legacy full playlists.
            skipped_files += 1
            print(f"[{index}/{len(playlist_files)}] SKIP {path.name}: no tracks[]")
            continue

        playlist_name = str(
            payload.get("playlistName")
            or path.stem
        ).strip() or path.stem

        playlist_id = str(
            payload.get("playlistId")
            or slugify(playlist_name)
        ).strip()

        ordered_ids = []
        seen = set()

        for track in tracks:
            if not isinstance(track, dict):
                continue

            song_id = song_id_of(track)
            if not song_id or song_id in seen:
                continue

            seen.add(song_id)
            ordered_ids.append(song_id)

            core, extra = split_track(track)

            # Preserve normalized/app-edited values; legacy only fills gaps.
            core_tracks[song_id] = merge_fill_missing(
                core_tracks.get(song_id, {}),
                core,
            )
            extra_tracks[song_id] = merge_fill_missing(
                extra_tracks.get(song_id, {}),
                extra,
            )

        normalized_playlist = {
            "schemaVersion": 6,
            "playlistId": playlist_id,
            "playlistName": playlist_name,
            "description": payload.get("description") or "",
            "category": payload.get("category") or "Imported",
            "totalTracks": len(ordered_ids),
            "generatedAt": now_iso(),
            "trackIds": ordered_ids,
            "source": {
                "coreCatalog": str(CORE_PATH),
                "extraCatalog": str(EXTRA_PATH),
                "legacyPlaylist": str(path),
            },
        }

        target = NORMALIZED_PLAYLIST_DIR / path.name
        write_json(target, normalized_playlist)

        migrated_playlists += 1
        total_playlist_refs += len(ordered_ids)

        print(
            f"[{index}/{len(playlist_files)}] "
            f"{playlist_name}: {len(ordered_ids)} tracks"
        )

    generated_at = now_iso()

    write_json(
        CORE_PATH,
        {
            "schemaVersion": 6,
            "catalogType": "core",
            "updatedAt": generated_at,
            "tracks": core_tracks,
        },
    )

    write_json(
        EXTRA_PATH,
        {
            "schemaVersion": 6,
            "catalogType": "extra",
            "updatedAt": generated_at,
            "tracks": extra_tracks,
        },
    )

    print()
    print("=" * 72)
    print("MIGRATION COMPLETE")
    print("=" * 72)
    print(f"Playlists migrated : {migrated_playlists}")
    print(f"Files skipped       : {skipped_files}")
    print(f"Playlist references : {total_playlist_refs}")
    print(f"Unique core tracks  : {len(core_tracks)}")
    print(f"Unique extra tracks : {len(extra_tracks)}")
    print()
    print(f"CORE  : {CORE_PATH}")
    print(f"EXTRA : {EXTRA_PATH}")
    print(f"LISTS : {NORMALIZED_PLAYLIST_DIR}")
    print()
    print("Legacy JSON files were NOT deleted or modified.")
    print("Keep them until the React V6 loader has been verified.")


if __name__ == "__main__":
    main()
