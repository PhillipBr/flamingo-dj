# -*- coding: utf-8 -*-

"""
APPLY_PENDING_EDITS.py

Applies pending Flamingo DJ edits stored in Supabase to:

    MASTER_CLEAN.db
    DJ.db

Safety:
- DB backup once per run
- transaction per SongID
- existing SongIDs are required
- successful rows are marked applied
- failed rows are marked error
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict

import requests
from dotenv import load_dotenv


# ============================================================
# PATHS
# ============================================================

DB_ROOT = Path(r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES")

MASTER_DB = (
    DB_ROOT
    / "_FLAMINGO - MASTER"
    / "MASTER_CLEAN.db"
)

DJ_DB = (
    DB_ROOT
    / "DJ.db"
)

PYTHON_ENV_FILE = (
    DB_ROOT
    / "_FLAMINGO - MASTER"
    / ".env"
)

BACKUP_DIR = (
    DB_ROOT
    / "_FLAMINGO - MASTER"
    / "BACKUPS"
    / "APP_EDITS"
)

MAX_EDITS_PER_RUN = 500

DRY_RUN = False
REQUIRE_CONFIRMATION = True


# ============================================================
# ENV
# ============================================================

load_dotenv(PYTHON_ENV_FILE)

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or ""
).strip().rstrip("/")

SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or ""
).strip()


# ============================================================
# SUPABASE
# ============================================================

def supabase_headers() -> Dict[str, str]:
    if not SUPABASE_URL:
        raise RuntimeError(
            "Missing SUPABASE_URL in "
            f"{PYTHON_ENV_FILE}"
        )

    if not SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Missing SUPABASE_SERVICE_ROLE_KEY in "
            f"{PYTHON_ENV_FILE}"
        )

    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_pending_edits() -> list[dict]:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/pending_track_edits",
        headers=supabase_headers(),
        params={
            "status": "eq.pending",
            "order": "updated_at.asc",
            "limit": str(MAX_EDITS_PER_RUN),
        },
        timeout=60,
    )

    response.raise_for_status()

    payload = response.json()

    if not isinstance(payload, list):
        raise RuntimeError(
            "Unexpected Supabase payload."
        )

    return payload


def patch_supabase_row(
    row_id: int,
    values: dict,
) -> None:
    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/pending_track_edits",
        headers={
            **supabase_headers(),
            "Prefer": "return=minimal",
        },
        params={
            "id": f"eq.{row_id}",
        },
        json=values,
        timeout=30,
    )

    response.raise_for_status()


# ============================================================
# BACKUP
# ============================================================

def backup_databases() -> None:
    BACKUP_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    stamp = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    for source in (
        MASTER_DB,
        DJ_DB,
    ):
        if not source.exists():
            raise FileNotFoundError(
                f"Database not found: {source}"
            )

        target = (
            BACKUP_DIR
            / f"{source.stem}_{stamp}{source.suffix}"
        )

        shutil.copy2(
            source,
            target,
        )

        print(
            f"BACKUP: {target}"
        )


# ============================================================
# SQLITE HELPERS
# ============================================================

def open_database(
    path: Path,
) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(
            f"Database not found: {path}"
        )

    conn = sqlite3.connect(
        path,
        timeout=60,
    )

    conn.row_factory = sqlite3.Row

    conn.execute(
        "PRAGMA busy_timeout=60000"
    )

    return conn


def table_exists(
    conn: sqlite3.Connection,
    table_name: str,
) -> bool:
    return (
        conn.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type='table'
              AND name=?
            LIMIT 1
            """,
            (table_name,),
        ).fetchone()
        is not None
    )


def table_columns(
    conn: sqlite3.Connection,
    table_name: str,
) -> Dict[str, str]:
    if not table_exists(
        conn,
        table_name,
    ):
        return {}

    return {
        str(row[1]).lower():
            str(row[1])
        for row in conn.execute(
            f'PRAGMA table_info("{table_name}")'
        )
    }


def existing_song_in_master(
    conn: sqlite3.Connection,
    song_id: int,
) -> bool:
    if not table_exists(
        conn,
        "Songs",
    ):
        raise RuntimeError(
            'MASTER_CLEAN.db is missing table "Songs".'
        )

    return (
        conn.execute(
            """
            SELECT SongID
            FROM Songs
            WHERE SongID=?
            LIMIT 1
            """,
            (song_id,),
        ).fetchone()
        is not None
    )


def existing_song_in_dj(
    conn: sqlite3.Connection,
    song_id: int,
) -> bool:
    if not table_exists(
        conn,
        "tracks",
    ):
        raise RuntimeError(
            'DJ.db is missing table "tracks".'
        )

    columns = table_columns(
        conn,
        "tracks",
    )

    song_id_column = columns.get(
        "song_id"
    )

    if not song_id_column:
        raise RuntimeError(
            'DJ.db tracks table is missing "song_id".'
        )

    return (
        conn.execute(
            f"""
            SELECT 1
            FROM tracks
            WHERE "{song_id_column}"=?
            LIMIT 1
            """,
            (song_id,),
        ).fetchone()
        is not None
    )


# ============================================================
# SNAPSHOTS
# ============================================================

def fetch_master_snapshot(
    conn: sqlite3.Connection,
    song_id: int,
) -> dict:
    result = {
        "title": None,
        "artist": None,
        "releaseDate": None,
        "genre": None,
        "popularity": None,
    }

    if table_exists(
        conn,
        "Songs",
    ):
        row = conn.execute(
            """
            SELECT Title, Artist
            FROM Songs
            WHERE SongID=?
            LIMIT 1
            """,
            (song_id,),
        ).fetchone()

        if row:
            result["title"] = row["Title"]
            result["artist"] = row["Artist"]

    if table_exists(
        conn,
        "TrackMetadata",
    ):
        columns = table_columns(
            conn,
            "TrackMetadata",
        )

        wanted = []

        for logical, expected in (
            ("releaseDate", "ReleaseDate"),
            ("genre", "Genre"),
            ("popularity", "Popularity"),
        ):
            actual = columns.get(
                expected.lower()
            )

            if actual:
                wanted.append(
                    (
                        logical,
                        actual,
                    )
                )

        if wanted:
            select_columns = ", ".join(
                f'"{actual}"'
                for _, actual in wanted
            )

            row = conn.execute(
                f"""
                SELECT {select_columns}
                FROM TrackMetadata
                WHERE SongID=?
                LIMIT 1
                """,
                (song_id,),
            ).fetchone()

            if row:
                for logical, actual in wanted:
                    result[logical] = row[actual]

    return result


def fetch_dj_snapshot(
    conn: sqlite3.Connection,
    song_id: int,
) -> dict:
    result = {
        "title": None,
        "artist": None,
        "releaseDate": None,
        "genre": None,
        "popularity": None,
        "tempo": None,
        "musicalKey": None,
        "energy": None,
        "keywords": None,
    }

    if not table_exists(
        conn,
        "tracks",
    ):
        return result

    columns = table_columns(
        conn,
        "tracks",
    )

    mapping = {
        "title": "title",
        "artist": "artist",
        "releaseDate": "release_date",
        "genre": "genre",
        "popularity": "popularity",
        "tempo": "tempo",
        "musicalKey": "musical_key",
        "energy": "energy",
        "keywords": "keywords",
    }

    wanted = []

    for logical, expected in mapping.items():
        actual = columns.get(
            expected.lower()
        )

        if actual:
            wanted.append(
                (
                    logical,
                    actual,
                )
            )

    if not wanted:
        return result

    song_id_column = columns.get(
        "song_id"
    )

    if not song_id_column:
        return result

    select_columns = ", ".join(
        f'"{actual}"'
        for _, actual in wanted
    )

    row = conn.execute(
        f"""
        SELECT {select_columns}
        FROM tracks
        WHERE "{song_id_column}"=?
        LIMIT 1
        """,
        (song_id,),
    ).fetchone()

    if row:
        for logical, actual in wanted:
            result[logical] = row[actual]

    return result


def print_changes(
    title: str,
    before: dict,
    changes: dict,
) -> None:
    if not changes:
        return

    print(title)

    for field, new_value in changes.items():
        old_value = before.get(
            field
        )

        print(
            f"  {field}: "
            f"{old_value!r} -> {new_value!r}"
        )


# ============================================================
# MASTER APPLY
# ============================================================

def apply_master_changes(
    conn: sqlite3.Connection,
    song_id: int,
    changes: dict,
) -> None:
    if not changes:
        return

    if not existing_song_in_master(
        conn,
        song_id,
    ):
        raise RuntimeError(
            f"SongID {song_id} does not exist "
            "in MASTER_CLEAN.db."
        )

    songs_columns = table_columns(
        conn,
        "Songs",
    )

    if "title" in changes:
        title_column = songs_columns.get(
            "title"
        )

        if not title_column:
            raise RuntimeError(
                'Songs table is missing "Title".'
            )

        conn.execute(
            f"""
            UPDATE Songs
            SET "{title_column}"=?
            WHERE SongID=?
            """,
            (
                changes["title"],
                song_id,
            ),
        )

    if "artist" in changes:
        artist_column = songs_columns.get(
            "artist"
        )

        if not artist_column:
            raise RuntimeError(
                'Songs table is missing "Artist".'
            )

        conn.execute(
            f"""
            UPDATE Songs
            SET "{artist_column}"=?
            WHERE SongID=?
            """,
            (
                changes["artist"],
                song_id,
            ),
        )

    metadata_mapping = {
        "releaseDate": "ReleaseDate",
        "genre": "Genre",
        "popularity": "Popularity",
    }

    requested = {
        key: changes[key]
        for key in metadata_mapping
        if key in changes
    }

    if not requested:
        return

    if not table_exists(
        conn,
        "TrackMetadata",
    ):
        raise RuntimeError(
            'MASTER_CLEAN.db is missing "TrackMetadata".'
        )

    columns = table_columns(
        conn,
        "TrackMetadata",
    )

    song_id_column = columns.get(
        "songid"
    )

    if not song_id_column:
        raise RuntimeError(
            'TrackMetadata is missing "SongID".'
        )

    existing = conn.execute(
        f"""
        SELECT 1
        FROM TrackMetadata
        WHERE "{song_id_column}"=?
        LIMIT 1
        """,
        (song_id,),
    ).fetchone()

    if not existing:
        raise RuntimeError(
            f"SongID {song_id} has no "
            "TrackMetadata row. "
            "No row was created automatically."
        )

    updates = {}

    for logical, value in requested.items():
        expected = metadata_mapping[
            logical
        ]

        actual = columns.get(
            expected.lower()
        )

        if not actual:
            print(
                "MASTER SKIP: missing column "
                f"TrackMetadata.{expected}"
            )
            continue

        updates[actual] = value

    if not updates:
        return

    setters = ", ".join(
        f'"{column}"=?'
        for column in updates
    )

    params = list(
        updates.values()
    )
    params.append(song_id)

    conn.execute(
        f"""
        UPDATE TrackMetadata
        SET {setters}
        WHERE "{song_id_column}"=?
        """,
        params,
    )


# ============================================================
# DJ APPLY
# ============================================================

def apply_dj_changes(
    conn: sqlite3.Connection,
    song_id: int,
    changes: dict,
) -> None:
    if not changes:
        return

    if not existing_song_in_dj(
        conn,
        song_id,
    ):
        raise RuntimeError(
            f"SongID {song_id} does not exist "
            "in DJ.db. No row was created."
        )

    columns = table_columns(
        conn,
        "tracks",
    )

    song_id_column = columns.get(
        "song_id"
    )

    if not song_id_column:
        raise RuntimeError(
            'DJ.db tracks table is missing "song_id".'
        )

    mapping = {
        "title": "title",
        "artist": "artist",
        "releaseDate": "release_date",
        "genre": "genre",
        "popularity": "popularity",
        "tempo": "tempo",
        "musicalKey": "musical_key",
        "energy": "energy",
        "keywords": "keywords",
    }

    updates = {}

    for logical, expected in mapping.items():
        if logical not in changes:
            continue

        actual = columns.get(
            expected.lower()
        )

        if not actual:
            print(
                "DJ SKIP: missing column "
                f"tracks.{expected}"
            )
            continue

        value = changes[
            logical
        ]

        if (
            logical == "keywords"
            and isinstance(
                value,
                list,
            )
        ):
            value = ", ".join(
                str(item).strip()
                for item in value
                if str(item).strip()
            )

        updates[actual] = value

    if not updates:
        return

    setters = ", ".join(
        f'"{column}"=?'
        for column in updates
    )

    params = list(
        updates.values()
    )
    params.append(song_id)

    conn.execute(
        f"""
        UPDATE tracks
        SET {setters}
        WHERE "{song_id_column}"=?
        """,
        params,
    )


# ============================================================
# MAIN
# ============================================================

def confirm_apply(
    total: int,
) -> bool:
    if DRY_RUN:
        return True

    if not REQUIRE_CONFIRMATION:
        return True

    print()

    answer = input(
        f"Apply {total} pending edit(s) "
        "to MASTER_CLEAN.db and DJ.db? "
        "[y/N]: "
    ).strip().lower()

    return answer in {
        "y",
        "yes",
        "s",
        "si",
        "sí",
    }


def main() -> None:
    print("=" * 72)
    print(
        "FLAMINGO DJ - APPLY PENDING SUPABASE EDITS"
    )
    print("=" * 72)

    print(
        f"MASTER : {MASTER_DB}"
    )
    print(
        f"DJ     : {DJ_DB}"
    )
    print(
        f"ENV    : {PYTHON_ENV_FILE}"
    )
    print(
        f"DRY RUN: {DRY_RUN}"
    )
    print()

    edits = fetch_pending_edits()

    print(
        f"Pending edits: {len(edits)}"
    )

    if not edits:
        print(
            "Nothing to apply."
        )
        return

    master = open_database(
        MASTER_DB
    )
    dj = open_database(
        DJ_DB
    )

    try:
        # Preview all edits first.
        for index, edit in enumerate(
            edits,
            start=1,
        ):
            song_id = int(
                float(
                    str(
                        edit["song_id"]
                    )
                )
            )

            master_changes = (
                edit.get(
                    "master_changes"
                )
                or {}
            )

            dj_changes = (
                edit.get(
                    "dj_changes"
                )
                or {}
            )

            print()
            print(
                f"[{index}/{len(edits)}] "
                f"SongID={song_id}"
            )

            print_changes(
                "MASTER CHANGES:",
                fetch_master_snapshot(
                    master,
                    song_id,
                ),
                master_changes,
            )

            print_changes(
                "DJ CHANGES:",
                fetch_dj_snapshot(
                    dj,
                    song_id,
                ),
                dj_changes,
            )

        if DRY_RUN:
            print()
            print(
                "DRY RUN enabled. "
                "No database was modified."
            )
            return

        if not confirm_apply(
            len(edits)
        ):
            print(
                "Cancelled. "
                "No database was modified."
            )
            return

        backup_databases()

        for index, edit in enumerate(
            edits,
            start=1,
        ):
            row_id = int(
                edit["id"]
            )

            song_id = int(
                float(
                    str(
                        edit["song_id"]
                    )
                )
            )

            master_changes = (
                edit.get(
                    "master_changes"
                )
                or {}
            )

            dj_changes = (
                edit.get(
                    "dj_changes"
                )
                or {}
            )

            print()
            print(
                f"APPLY "
                f"[{index}/{len(edits)}] "
                f"SongID={song_id}"
            )

            try:
                patch_supabase_row(
                    row_id,
                    {
                        "status": "applying",
                        "last_error": None,
                    },
                )

                master.execute(
                    "BEGIN"
                )
                dj.execute(
                    "BEGIN"
                )

                apply_master_changes(
                    master,
                    song_id,
                    master_changes,
                )

                apply_dj_changes(
                    dj,
                    song_id,
                    dj_changes,
                )

                master.commit()
                dj.commit()

                patch_supabase_row(
                    row_id,
                    {
                        "status": "applied",
                        "applied_at": (
                            datetime.now()
                            .astimezone()
                            .isoformat()
                        ),
                        "last_error": None,
                    },
                )

                print(
                    "STATUS: APPLIED"
                )

            except Exception as exc:
                master.rollback()
                dj.rollback()

                print(
                    f"STATUS: ERROR | {exc}"
                )

                try:
                    patch_supabase_row(
                        row_id,
                        {
                            "status": "error",
                            "last_error": str(
                                exc
                            )[:2000],
                        },
                    )

                except Exception as patch_exc:
                    print(
                        "WARNING: Could not update "
                        "Supabase error status: "
                        f"{patch_exc}"
                    )

    finally:
        master.close()
        dj.close()


if __name__ == "__main__":
    main()
