# -*- coding: utf-8 -*-
"""
spotify_sync_api.py
============================================================

Local read-only resolver for Flamingo DJ Spotify Pull.

React already tries:
    Spotify -> tracks-extra.json

If a Spotify track is still missing, React calls this backend:

    SpotifyTrackID / linked_from ID
        ->
    MASTER_CLEAN.db / SpotifyLinks
        ->
    SongID
        ->
    DJ.db / tracks
        ->
    complete DJ metadata?
        ->
    return a React Track object

READ ONLY:
- MASTER_CLEAN.db is never modified
- DJ.db is never modified
- audio is never modified
- JSON is never modified

Run:
    python spotify_sync_api.py

Default:
    http://127.0.0.1:8002
"""

from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn


# ============================================================
# PATHS
# ============================================================

DB_ROOT = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
)

MASTER_DB_PATH = (
    DB_ROOT
    / "_FLAMINGO - MASTER"
    / "MASTER_CLEAN.db"
)

DJ_DB_PATH = (
    DB_ROOT
    / "DJ.db"
)


# ============================================================
# API
# ============================================================

app = FastAPI(
    title="Flamingo DJ Spotify Sync Resolver",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "https://phillipbr.github.io",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ============================================================
# MODELS
# ============================================================

class SpotifyLookupTrack(BaseModel):
    spotifyTrackId: str
    linkedFromTrackId: Optional[str] = None
    spotifyUrl: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None


class ResolveRequest(BaseModel):
    tracks: List[SpotifyLookupTrack]


# ============================================================
# HELPERS
# ============================================================

def clean(value: Any) -> Optional[str]:
    if value is None:
        return None

    text = str(value).strip()

    return text or None


def as_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None

        text = str(value).strip()

        if not text:
            return None

        return float(text)

    except Exception:
        return None


def as_int(value: Any) -> Optional[int]:
    number = as_float(value)

    if number is None:
        return None

    return int(
        round(number)
    )


def split_keywords(
    value: Any,
) -> List[str]:
    text = clean(value)

    if not text:
        return []

    return [
        item.strip()
        for item in re.split(
            r"[,;|]",
            text,
        )
        if item.strip()
    ]


def sqlite_connect(
    path: Path,
) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(
            str(path)
        )

    connection = sqlite3.connect(
        path,
        timeout=60,
    )

    connection.row_factory = (
        sqlite3.Row
    )

    return connection


def table_columns(
    connection: sqlite3.Connection,
    table: str,
) -> set[str]:
    rows = connection.execute(
        f"PRAGMA table_info({table})"
    ).fetchall()

    return {
        str(row["name"])
        for row in rows
    }


def spotify_id_from_url(
    value: Any,
) -> Optional[str]:
    text = clean(value)

    if not text:
        return None

    match = re.search(
        r"spotify:track:([A-Za-z0-9]+)",
        text,
        flags=re.IGNORECASE,
    )

    if match:
        return match.group(1)

    match = re.search(
        r"open\.spotify\.com/"
        r"(?:intl-[^/]+/)?"
        r"track/"
        r"([A-Za-z0-9]+)",
        text,
        flags=re.IGNORECASE,
    )

    if match:
        return match.group(1)

    return None


def lookup_master_by_spotify_id(
    connection: sqlite3.Connection,
    spotify_id: str,
) -> Optional[Dict[str, Any]]:
    """
    MASTER_CLEAN schema used by the Flamingo pipeline:

        Songs
        TrackMetadata
        SpotifyLinks

    Match by exact SpotifyTrackID first, URL fallback second.
    """

    row = connection.execute(
        """
        SELECT
            S.SongID AS SongID,
            S.Title AS Title,
            S.Artist AS Artist,

            TM.Album AS Album,
            TM.Duration AS Duration,
            TM.CoverImage AS CoverImage,
            TM.Popularity AS Popularity,
            TM.ReleaseDate AS ReleaseDate,
            TM.Genre AS Genre,

            SL.Spotify_URL AS Spotify_URL,
            SL.SpotifyTrackID AS SpotifyTrackID

        FROM SpotifyLinks SL

        JOIN Songs S
          ON S.SongID = SL.SongID

        LEFT JOIN TrackMetadata TM
          ON TM.SongID = S.SongID

        WHERE
            SL.SpotifyTrackID = ?
            OR SL.Spotify_URL LIKE ?

        LIMIT 1
        """,
        (
            spotify_id,
            f"%/track/{spotify_id}%",
        ),
    ).fetchone()

    if not row:
        return None

    return dict(row)


def lookup_dj_track(
    connection: sqlite3.Connection,
    song_id: str,
) -> Optional[Dict[str, Any]]:
    row = connection.execute(
        """
        SELECT *
        FROM tracks
        WHERE song_id = ?
        LIMIT 1
        """,
        (
            int(song_id),
        ),
    ).fetchone()

    if not row:
        return None

    return dict(row)


def dj_track_complete(
    record: Optional[Dict[str, Any]],
) -> tuple[bool, List[str]]:
    if not record:
        return (
            False,
            ["DJ_DB_TRACK_NOT_FOUND"],
        )

    missing = []

    if (
        as_float(
            record.get("tempo")
        )
        is None
    ):
        missing.append(
            "tempo"
        )

    if not clean(
        record.get("musical_key")
    ):
        missing.append(
            "musical_key"
        )

    if (
        as_float(
            record.get("energy")
        )
        is None
    ):
        missing.append(
            "energy"
        )

    folder = clean(
        record.get("folder")
    )

    if not folder:
        missing.append(
            "folder"
        )
    else:
        try:
            if not Path(
                folder
            ).exists():
                missing.append(
                    "audio_file_missing"
                )
        except Exception:
            missing.append(
                "audio_file_invalid"
            )

    return (
        len(missing) == 0,
        missing,
    )


def normalize_duration_seconds(
    value: Any,
) -> Optional[int]:
    duration = as_int(
        value
    )

    if duration is None:
        return None

    if duration > 10000:
        return int(
            round(
                duration / 1000
            )
        )

    return duration


def to_react_track(
    master: Dict[str, Any],
    dj: Dict[str, Any],
    requested_spotify_id: str,
) -> Dict[str, Any]:
    song_id = str(
        master["SongID"]
    )

    stored_url = clean(
        master.get(
            "Spotify_URL"
        )
    )

    spotify_url = (
        stored_url
        or (
            "https://open.spotify.com/"
            f"track/{requested_spotify_id}"
        )
    )

    return {
        "id":
            song_id,

        "externalSongId":
            song_id,

        "title":
            master.get("Title")
            or "",

        "artist":
            master.get("Artist")
            or "",

        "album":
            master.get("Album"),

        "artworkUrl":
            master.get(
                "CoverImage"
            ),

        "durationSeconds":
            normalize_duration_seconds(
                master.get(
                    "Duration"
                )
            ),

        "releaseDate":
            master.get(
                "ReleaseDate"
            ),

        "genre":
            (
                clean(
                    dj.get(
                        "genre"
                    )
                )
                or master.get(
                    "Genre"
                )
            ),

        "country":
            (
                dj.get("country")
                if "country" in dj
                else dj.get("Country")
            ),

        "spotifyPopularity":
            as_int(
                master.get(
                    "Popularity"
                )
            ),

        "spotifyUrl":
            spotify_url,

        "tempo":
            as_float(
                dj.get(
                    "tempo"
                )
            ),

        "musicalKey":
            clean(
                dj.get(
                    "musical_key"
                )
            ),

        "camelot":
            clean(
                dj.get(
                    "camelot"
                )
            ),

        "energy":
            as_float(
                dj.get(
                    "energy"
                )
            ),

        "overallVolume":
            as_float(
                dj.get(
                    "overall_vol"
                )
            ),

        "cuePoints":
            dj.get(
                "cue_points"
            ),

        "clippedPeaks":
            dj.get(
                "clipped_peaks"
            ),

        "keywords":
            split_keywords(
                dj.get(
                    "keywords"
                )
            ),

        "comments":
            clean(
                dj.get(
                    "comments"
                )
            ),

        "folder":
            clean(
                dj.get(
                    "folder"
                )
            ),

        "dateAdded":
            clean(
                dj.get(
                    "date_added"
                )
            ),

        "rating":
            None,

        "artistDetails":
            None,
    }


# ============================================================
# ROUTES
# ============================================================

@app.get("/api/spotify-sync/health")
def health():
    return {
        "ok":
            True,

        "masterExists":
            MASTER_DB_PATH.exists(),

        "djExists":
            DJ_DB_PATH.exists(),

        "masterPath":
            str(
                MASTER_DB_PATH
            ),

        "djPath":
            str(
                DJ_DB_PATH
            ),
    }


@app.post("/api/spotify-sync/resolve")
def resolve_tracks(
    request: ResolveRequest,
):
    master_connection = (
        sqlite_connect(
            MASTER_DB_PATH
        )
    )

    dj_connection = (
        sqlite_connect(
            DJ_DB_PATH
        )
    )

    resolved = []
    incomplete = []
    unknown = []

    try:
        seen_request_ids = set()

        for item in (
            request.tracks
        ):
            candidate_ids = [
                clean(
                    item.spotifyTrackId
                ),
                clean(
                    item.linkedFromTrackId
                ),
            ]

            candidate_ids = [
                value
                for value in candidate_ids
                if value
            ]

            candidate_ids = list(
                dict.fromkeys(
                    candidate_ids
                )
            )

            request_key = (
                item.spotifyTrackId
            )

            if (
                request_key
                in seen_request_ids
            ):
                continue

            seen_request_ids.add(
                request_key
            )

            master_record = None
            matched_spotify_id = None

            for spotify_id in (
                candidate_ids
            ):
                master_record = (
                    lookup_master_by_spotify_id(
                        master_connection,
                        spotify_id,
                    )
                )

                if master_record:
                    matched_spotify_id = (
                        spotify_id
                    )
                    break

            if not master_record:
                unknown.append({
                    "spotifyTrackId":
                        item.spotifyTrackId,

                    "linkedFromTrackId":
                        item.linkedFromTrackId,

                    "title":
                        item.title,

                    "artist":
                        item.artist,

                    "reason":
                        "NOT_FOUND_IN_MASTER_CLEAN",
                })

                continue

            song_id = str(
                master_record[
                    "SongID"
                ]
            )

            dj_record = (
                lookup_dj_track(
                    dj_connection,
                    song_id,
                )
            )

            (
                complete,
                missing_fields,
            ) = dj_track_complete(
                dj_record
            )

            if not complete:
                incomplete.append({
                    "spotifyTrackId":
                        item.spotifyTrackId,

                    "linkedFromTrackId":
                        item.linkedFromTrackId,

                    "songId":
                        song_id,

                    "title":
                        master_record.get(
                            "Title"
                        )
                        or item.title,

                    "artist":
                        master_record.get(
                            "Artist"
                        )
                        or item.artist,

                    "missing":
                        missing_fields,

                    "reason":
                        "FOUND_IN_MASTER_BUT_DJ_INCOMPLETE",
                })

                continue

            track = to_react_track(
                master_record,
                dj_record,
                matched_spotify_id
                or item.spotifyTrackId,
            )

            resolved.append({
                "spotifyTrackId":
                    item.spotifyTrackId,

                "linkedFromTrackId":
                    item.linkedFromTrackId,

                "matchedSpotifyTrackId":
                    matched_spotify_id,

                "songId":
                    song_id,

                "track":
                    track,
            })

    finally:
        master_connection.close()
        dj_connection.close()

    return {
        "requested":
            len(
                request.tracks
            ),

        "resolvedCount":
            len(
                resolved
            ),

        "incompleteCount":
            len(
                incomplete
            ),

        "unknownCount":
            len(
                unknown
            ),

        "resolved":
            resolved,

        "incomplete":
            incomplete,

        "unknown":
            unknown,
    }


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    print()
    print("=" * 72)
    print(
        "FLAMINGO DJ - "
        "SPOTIFY SYNC LOCAL RESOLVER"
    )
    print("=" * 72)

    print(
        f"MASTER : {MASTER_DB_PATH}"
    )

    print(
        f"DJ     : {DJ_DB_PATH}"
    )

    print(
        "API    : "
        "http://127.0.0.1:8002"
    )

    print()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8002,
    )
