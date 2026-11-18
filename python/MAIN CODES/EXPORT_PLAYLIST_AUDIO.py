# -*- coding: utf-8 -*-
"""
EXPORT_PLAYLIST_AUDIO.py
============================================================

FLAMINGO DJ - PHYSICAL PLAYLIST EXPORTER

NO INTERNET REQUIRED.

Reads:
    _FLAMINGO - MASTER/PLAYLIST_JSON/<PLAYLIST>/<PLAYLIST>.json
    _FLAMINGO - MASTER/DJ.db

Uses:
    DJ.db -> tracks.folder

Creates:
    C:/Users/fbrav/Music/FLAMINGO_LIBRARY/Playlist/<PLAYLIST>/

Audio filename:
    Title - Artist.mp3

IMPORTANT:
- COPIES audio. It NEVER moves the master audio.
- Does NOT modify MASTER_CLEAN.db.
- Does NOT modify DJ.db.
- Does NOT modify playlist JSON.
- Does NOT delete anything from FLAMINGO_LIBRARY.
- Does NOT require Spotify/API/internet.
"""

import json
import re
import shutil
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ============================================================
# CONFIG
# ============================================================

DB_ROOT = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
)

BASE_DIR = (
    DB_ROOT
    / "_FLAMINGO - MASTER"
)

PLAYLIST_JSON_ROOT = (
    BASE_DIR
    / "PLAYLIST_JSON"
)

DJ_DB_PATH = (
    BASE_DIR
    / "DJ.db"
)

FLAMINGO_LIBRARY_DIR = Path(
    r"C:\Users\fbrav\Music\FLAMINGO_LIBRARY"
)

EXPORT_ROOT = (
    FLAMINGO_LIBRARY_DIR
    / "Playlist"
)

AUDIO_EXTENSIONS = {
    ".mp3",
    ".flac",
    ".wav",
    ".m4a",
    ".aac",
    ".aiff",
    ".aif",
    ".ogg",
}


# ============================================================
# BASIC HELPERS
# ============================================================

def log(message: str):
    print(message, flush=True)


def sanitize_filename(value) -> str:
    """
    Windows-safe filename component.
    """

    text = str(
        value or "Unknown"
    ).strip()

    # Windows invalid characters
    text = re.sub(
        r'[<>:"/\\|?*]',
        "_",
        text,
    )

    # Remove control characters
    text = "".join(
        char
        for char in text
        if ord(char) >= 32
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    text = text.strip(
        " ."
    )

    return text or "Unknown"


def trim_text(
    value: str,
    max_length: int,
) -> str:

    value = str(
        value or ""
    ).strip()

    if len(value) <= max_length:
        return value

    shortened = value[
        :max_length
    ].rstrip()

    if " " in shortened:
        candidate = shortened.rsplit(
            " ",
            1,
        )[0]

        if len(candidate) >= int(
            max_length * 0.65
        ):
            shortened = candidate

    return (
        shortened.strip(" ._-")
        or value[:max_length]
    )


def safe_playlist_folder_name(
    playlist_name: str,
) -> str:

    return sanitize_filename(
        playlist_name
    )


def get_song_id(
    track: Dict,
) -> Optional[int]:

    value = (
        track.get("SongID")
        or track.get("song_id")
        or track.get("externalSongId")
        or track.get("id")
    )

    if value is None:
        return None

    try:
        return int(
            float(
                str(value)
            )
        )

    except Exception:
        return None


def get_title(
    track: Dict,
) -> str:

    return str(
        track.get("Title")
        or track.get("title")
        or "Unknown"
    ).strip()


def get_artist(
    track: Dict,
) -> str:

    return str(
        track.get("Artist")
        or track.get("artist")
        or "Unknown"
    ).strip()


# ============================================================
# PLAYLIST DISCOVERY
# ============================================================

def discover_playlists() -> List[Dict]:
    """
    Looks for:

        PLAYLIST_JSON/
            R&B CLUB/
                R&B CLUB.json

    Ignores:
        *_PENDING.json
        other auxiliary JSON files
    """

    playlists = []

    if not PLAYLIST_JSON_ROOT.exists():
        raise FileNotFoundError(
            f"No existe:\n"
            f"{PLAYLIST_JSON_ROOT}"
        )

    for folder in sorted(
        PLAYLIST_JSON_ROOT.iterdir(),
        key=lambda path: path.name.lower(),
    ):

        if not folder.is_dir():
            continue

        expected_json = (
            folder
            / f"{folder.name}.json"
        )

        if expected_json.exists():
            playlists.append({
                "name": folder.name,
                "json": expected_json,
            })

            continue

        # ----------------------------------------------------
        # Fallback:
        # If folder/file names do not match exactly,
        # choose a normal JSON but NEVER _PENDING.json.
        # ----------------------------------------------------

        candidates = [
            path
            for path in folder.glob(
                "*.json"
            )
            if not path.name.upper().endswith(
                "_PENDING.JSON"
            )
        ]

        if len(candidates) == 1:
            playlists.append({
                "name": folder.name,
                "json": candidates[0],
            })

    return playlists


# ============================================================
# LOAD PLAYLIST
# ============================================================

def load_playlist(
    path: Path,
) -> Tuple[Dict, List[Dict]]:

    data = json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

    if isinstance(
        data,
        list,
    ):
        return {}, data

    if (
        isinstance(data, dict)
        and isinstance(
            data.get("tracks"),
            list,
        )
    ):
        return (
            data,
            data["tracks"],
        )

    raise RuntimeError(
        f"Formato JSON no reconocido:\n"
        f"{path}"
    )


# ============================================================
# DJ DATABASE
# ============================================================

def get_dj_connection():

    if not DJ_DB_PATH.exists():
        raise FileNotFoundError(
            f"No existe DJ.db:\n"
            f"{DJ_DB_PATH}"
        )

    conn = sqlite3.connect(
        DJ_DB_PATH,
        timeout=60,
    )

    conn.row_factory = (
        sqlite3.Row
    )

    return conn


def get_dj_track(
    conn,
    song_id: int,
) -> Optional[Dict]:

    row = conn.execute(
        """
        SELECT *
        FROM tracks
        WHERE song_id=?
        LIMIT 1
        """,
        (
            int(song_id),
        ),
    ).fetchone()

    return (
        dict(row)
        if row
        else None
    )


# ============================================================
# AUDIO LOCATION
# ============================================================

def get_library_bucket(
    song_id: int,
) -> str:
    """
    Same bucket architecture used by MIXNKEY_TO_REACT_JSON.

    Example:
        205341
        -> 205000-205999
    """

    song_id = int(
        song_id
    )

    start = (
        song_id
        // 1000
        * 1000
    )

    return (
        f"{start}-"
        f"{start + 999}"
    )


def find_audio_by_song_id(
    song_id: int,
) -> Optional[Path]:
    """
    Fallback when DJ.db.folder is missing/broken.

    Searches the expected Flamingo Library bucket
    for the canonical:

        SongID__Artist__Title.ext
    """

    bucket = (
        FLAMINGO_LIBRARY_DIR
        / get_library_bucket(
            song_id
        )
    )

    if not bucket.exists():
        return None

    prefix = (
        f"{song_id}__"
    )

    for path in bucket.iterdir():

        if (
            path.is_file()
            and path.suffix.lower()
            in AUDIO_EXTENSIONS
            and path.name.startswith(
                prefix
            )
        ):
            return path

    return None


def resolve_audio_path(
    conn,
    song_id: int,
) -> Tuple[
    Optional[Path],
    str,
]:
    """
    Priority:

    1. DJ.db tracks.folder
    2. FLAMINGO_LIBRARY SongID search
    """

    dj_track = get_dj_track(
        conn,
        song_id,
    )

    if dj_track:

        folder = (
            dj_track.get("folder")
        )

        if folder:

            try:
                path = Path(
                    str(folder)
                )

                if (
                    path.exists()
                    and path.is_file()
                ):
                    return (
                        path,
                        "DJ_DB",
                    )

            except Exception:
                pass

    fallback = (
        find_audio_by_song_id(
            song_id
        )
    )

    if fallback:
        return (
            fallback,
            "LIBRARY_SEARCH",
        )

    return (
        None,
        "NOT_FOUND",
    )


# ============================================================
# EXPORT FILENAME
# ============================================================

def build_export_filename(
    title: str,
    artist: str,
    extension: str,
) -> str:
    """
    NO SongID.

    Format:
        Title - Artist.mp3
    """

    title = sanitize_filename(
        title
    )

    artist = sanitize_filename(
        artist
    )

    # Avoid extremely long Windows filenames.
    title = trim_text(
        title,
        100,
    )

    artist = trim_text(
        artist,
        70,
    )

    extension = (
        extension.lower()
    )

    if not extension.startswith(
        "."
    ):
        extension = (
            "."
            + extension
        )

    return (
        f"{title} - {artist}"
        f"{extension}"
    )


def unique_destination(
    destination_folder: Path,
    filename: str,
) -> Path:
    """
    Never overwrite another track.

    Example:
        Song - Artist.mp3
        Song - Artist (2).mp3
        Song - Artist (3).mp3
    """

    destination = (
        destination_folder
        / filename
    )

    if not destination.exists():
        return destination

    path = Path(
        filename
    )

    stem = path.stem
    suffix = path.suffix

    counter = 2

    while True:

        candidate = (
            destination_folder
            / (
                f"{stem} "
                f"({counter})"
                f"{suffix}"
            )
        )

        if not candidate.exists():
            return candidate

        counter += 1


# ============================================================
# EXPORT ONE PLAYLIST
# ============================================================

def export_playlist(
    playlist: Dict,
):

    playlist_name = (
        playlist["name"]
    )

    json_path = (
        playlist["json"]
    )

    print()
    print("=" * 72)
    print(
        f"EXPORT PLAYLIST: "
        f"{playlist_name}"
    )
    print("=" * 72)

    print(
        f"JSON   : {json_path}"
    )

    metadata, tracks = (
        load_playlist(
            json_path
        )
    )

    output_folder = (
        EXPORT_ROOT
        / safe_playlist_folder_name(
            playlist_name
        )
    )

    output_folder.mkdir(
        parents=True,
        exist_ok=True,
    )

    conn = get_dj_connection()

    copied = 0
    missing = []
    invalid_song_id = []
    found_dj_db = 0
    found_fallback = 0

    try:

        total = len(
            tracks
        )

        for position, track in enumerate(
            tracks,
            start=1,
        ):

            song_id = get_song_id(
                track
            )

            title = get_title(
                track
            )

            artist = get_artist(
                track
            )

            if song_id is None:

                invalid_song_id.append({
                    "Title": title,
                    "Artist": artist,
                })

                print(
                    f"[{position}/{total}] "
                    f"INVALID SongID | "
                    f"{artist} - {title}"
                )

                continue

            (
                source,
                source_type,
            ) = resolve_audio_path(
                conn,
                song_id,
            )

            if source is None:

                missing.append({
                    "SongID": song_id,
                    "Title": title,
                    "Artist": artist,
                })

                print(
                    f"[{position}/{total}] "
                    f"MISSING | "
                    f"{artist} - {title}"
                )

                continue

            if source_type == "DJ_DB":
                found_dj_db += 1

            elif source_type == "LIBRARY_SEARCH":
                found_fallback += 1

            filename = (
                build_export_filename(
                    title,
                    artist,
                    source.suffix,
                )
            )

            destination = (
                output_folder
                / filename
            )

            # ------------------------------------------------
            # If exact destination already exists and appears
            # to be the same physical audio, don't duplicate it.
            # ------------------------------------------------

            if destination.exists():

                try:

                    if (
                        destination.stat().st_size
                        == source.stat().st_size
                    ):

                        print(
                            f"[{position}/{total}] "
                            f"EXISTS  | "
                            f"{filename}"
                        )

                        continue

                except Exception:
                    pass

                destination = (
                    unique_destination(
                        output_folder,
                        filename,
                    )
                )

            try:

                # COPY.
                # NEVER MOVE.
                shutil.copy2(
                    str(source),
                    str(destination),
                )

                copied += 1

                print(
                    f"[{position}/{total}] "
                    f"COPIED  | "
                    f"{destination.name}"
                )

            except Exception as exc:

                missing.append({
                    "SongID": song_id,
                    "Title": title,
                    "Artist": artist,
                    "Error": str(exc),
                })

                print(
                    f"[{position}/{total}] "
                    f"COPY ERROR | "
                    f"{artist} - {title}"
                )

                print(
                    f"    {exc}"
                )

    finally:

        conn.close()

    # ========================================================
    # SUMMARY
    # ========================================================

    print()
    print("-" * 72)
    print("SUMMARY")
    print("-" * 72)

    print(
        f"Playlist tracks       : "
        f"{len(tracks)}"
    )

    print(
        f"Found via DJ.db       : "
        f"{found_dj_db}"
    )

    print(
        f"Found via fallback    : "
        f"{found_fallback}"
    )

    print(
        f"Copied now            : "
        f"{copied}"
    )

    print(
        f"Missing audio         : "
        f"{len(missing)}"
    )

    print(
        f"Invalid SongID        : "
        f"{len(invalid_song_id)}"
    )

    print(
        f"Output                : "
        f"{output_folder}"
    )

    # ========================================================
    # MISSING REPORT
    # ========================================================

    if missing:

        print()
        print(
            "MISSING AUDIO:"
        )

        for index, item in enumerate(
            missing,
            start=1,
        ):

            print(
                f"[{index}/{len(missing)}] "
                f"SongID={item.get('SongID')} | "
                f"{item.get('Artist')} - "
                f"{item.get('Title')}"
            )

    return {
        "playlist": playlist_name,
        "tracks": len(tracks),
        "copied": copied,
        "missing": len(missing),
        "output": str(
            output_folder
        ),
    }


# ============================================================
# MENU
# ============================================================

def print_menu(
    playlists: List[Dict],
):

    print()
    print("=" * 72)
    print(
        "FLAMINGO DJ - "
        "EXPORT PHYSICAL PLAYLIST AUDIO"
    )
    print("=" * 72)

    print()
    print(
        "NO INTERNET REQUIRED"
    )

    print(
        f"Playlist source : "
        f"{PLAYLIST_JSON_ROOT}"
    )

    print(
        f"Audio library   : "
        f"{FLAMINGO_LIBRARY_DIR}"
    )

    print(
        f"Export root     : "
        f"{EXPORT_ROOT}"
    )

    print()

    for index, playlist in enumerate(
        playlists,
        start=1,
    ):

        print(
            f"[{index:>2}] "
            f"{playlist['name']}"
        )

    print()
    print(
        "[A] EXPORT ALL PLAYLISTS"
    )

    print(
        "[Q] QUIT"
    )

    print()


def choose_playlists(
    playlists: List[Dict],
) -> List[Dict]:

    while True:

        print_menu(
            playlists
        )

        answer = input(
            "Select playlist: "
        ).strip()

        if not answer:
            continue

        if answer.lower() == "q":
            return []

        if answer.lower() == "a":
            return playlists

        try:

            index = int(
                answer
            )

            if (
                1
                <= index
                <= len(playlists)
            ):
                return [
                    playlists[
                        index - 1
                    ]
                ]

        except ValueError:
            pass

        print()
        print(
            "Invalid selection."
        )


# ============================================================
# MAIN
# ============================================================

def main():

    if not DJ_DB_PATH.exists():

        raise FileNotFoundError(
            f"DJ.db no encontrado:\n"
            f"{DJ_DB_PATH}"
        )

    playlists = (
        discover_playlists()
    )

    if not playlists:

        raise RuntimeError(
            "No encontré playlists válidas en:\n"
            f"{PLAYLIST_JSON_ROOT}"
        )

    selected = (
        choose_playlists(
            playlists
        )
    )

    if not selected:

        print(
            "Cancelled."
        )

        return

    EXPORT_ROOT.mkdir(
        parents=True,
        exist_ok=True,
    )

    summaries = []

    for playlist in selected:

        result = export_playlist(
            playlist
        )

        summaries.append(
            result
        )

    # ========================================================
    # FINAL SUMMARY
    # ========================================================

    print()
    print("=" * 72)
    print(
        "EXPORT COMPLETE"
    )
    print("=" * 72)

    total_tracks = sum(
        item["tracks"]
        for item in summaries
    )

    total_copied = sum(
        item["copied"]
        for item in summaries
    )

    total_missing = sum(
        item["missing"]
        for item in summaries
    )

    print(
        f"Playlists processed : "
        f"{len(summaries)}"
    )

    print(
        f"Playlist tracks     : "
        f"{total_tracks}"
    )

    print(
        f"Copied now          : "
        f"{total_copied}"
    )

    print(
        f"Missing audio       : "
        f"{total_missing}"
    )

    print()
    print(
        f"Output root:\n"
        f"{EXPORT_ROOT}"
    )


if __name__ == "__main__":
    main()