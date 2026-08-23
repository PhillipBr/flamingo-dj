# -*- coding: utf-8 -*-
"""
MIXNKEY_TO_REACT_JSON.py
============================================================

FLAMINGO DJ - STEP 2 / INCREMENTAL MIK

Input:
    PLAYLIST_JSON/<PLAYLIST_NAME>/<PLAYLIST_NAME>.json
    PLAYLIST_JSON/<PLAYLIST_NAME>/<PLAYLIST_NAME>.csv

The CSV may contain ONLY the latest PENDING batch.

Key behavior:
1) COMPLETE tracks already in DJ.db are reused. They do NOT need to exist
   in the current Mixed In Key CSV.
2) Incomplete tracks are matched against the current MIK CSV using a
   tolerant Spotify <-> Deezer matcher:
       SongID / SpotifyURL
       exact title/artist
       base title + primary artist
       artist overlap
       version normalization
   One MIK CSV row can be used only ONCE.
3) Artists are resolved here:
       MASTER Artists/SongArtists
       -> Spotify artist metadata when needed
       -> MusicBrainz for Country / MBID
4) Audio is moved to FLAMINGO_LIBRARY and DJ.db is updated.
5) At the end, tracks that STILL could not be completed are printed.
6) The script asks whether those incomplete/unmatched tracks should be
   EXCLUDED from the FlamingoAppDJ React JSON.
   It does NOT delete them from Spotify or MASTER_CLEAN.db.
"""

import csv
import json
import os
import re
import shutil
import sqlite3
import time
import unicodedata
import webbrowser
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from difflib import SequenceMatcher

import requests
from dotenv import load_dotenv
from spotipy.oauth2 import SpotifyOAuth


# ============================================================
# CONFIG
# ============================================================

DB_ROOT = Path(r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES")
BASE_DIR = DB_ROOT / "_FLAMINGO - MASTER"

MASTER_DB_PATH = BASE_DIR / "MASTER_CLEAN.db"
DJ_DB_PATH = DB_ROOT / "DJ.db"
ENV_PATH = BASE_DIR / ".env"
ARTIST_EXCEPTIONS_PATH = BASE_DIR / "ARTIST_EXCEPTIONS.json"

PLAYLIST_NAME = "R&B 90-2000"

PLAYLIST_DIR = BASE_DIR / "PLAYLIST_JSON" / PLAYLIST_NAME
SOURCE_PLAYLIST_JSON = PLAYLIST_DIR / f"{PLAYLIST_NAME}.json"
SOURCE_PENDING_JSON = PLAYLIST_DIR / f"{PLAYLIST_NAME}_PENDING.json"
SOURCE_MIXNKEY_CSV = PLAYLIST_DIR / f"{PLAYLIST_NAME}.csv"

FLAMINGO_LIBRARY_DIR = Path(
    r"C:\Users\fbrav\Music\FLAMINGO_LIBRARY"
)

REACT_OUTPUT_DIR = (
    DB_ROOT
    / "FLAMINGOAPP_DJ_REACT"
    / "src"
    / "data"
    / "JSON"
    / "playlists"
)

REACT_OUTPUT_PATH = (
    REACT_OUTPUT_DIR
    / f"{PLAYLIST_NAME}.json"
)


# ============================================================
# NORMALIZED JSON ARCHITECTURE - TRANSITION MODE
# ============================================================
#
# IMPORTANT:
# The current React app still reads the legacy full playlist JSON.
# Therefore MIXNKEY continues writing:
#
#   src/data/JSON/playlists/<PLAYLIST>.json
#
# AND ALSO writes the new normalized architecture:
#
#   src/data/JSON/normalized/catalog/tracks-core.json + tracks-extra.json
#   src/data/JSON/normalized/playlists/<PLAYLIST>.json
#
# Once the React loader is migrated to the normalized structure,
# the legacy full-track playlist JSON can be retired.
# ============================================================

NORMALIZED_JSON_ROOT = (
    DB_ROOT
    / "FLAMINGOAPP_DJ_REACT"
    / "src"
    / "data"
    / "JSON"
    / "normalized"
)

NORMALIZED_CATALOG_DIR = (
    NORMALIZED_JSON_ROOT
    / "catalog"
)

NORMALIZED_CORE_PATH = (
    NORMALIZED_CATALOG_DIR
    / "tracks-core.json"
)

NORMALIZED_EXTRA_PATH = (
    NORMALIZED_CATALOG_DIR
    / "tracks-extra.json"
)

# V5 compatibility source. Read-only during migration/transition.
NORMALIZED_V5_CATALOG_PATH = (
    NORMALIZED_CATALOG_DIR
    / "tracks.json"
)

NORMALIZED_PLAYLIST_DIR = (
    NORMALIZED_JSON_ROOT
    / "playlists"
)

NORMALIZED_PLAYLIST_PATH = (
    NORMALIZED_PLAYLIST_DIR
    / f"{PLAYLIST_NAME}.json"
)

SPOTIFY_TOKEN_CACHE = BASE_DIR / ".spotify_playlist_token_cache"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"

# No write scope needed here.
SPOTIFY_SCOPE = "playlist-read-private"

MOVE_AUDIO_FILES = True
REMOVE_VERIFIED_DUPLICATE_SOURCE = False

# Score required for automatic Spotify <-> Deezer/MIK match.
AUTO_MATCH_MIN_SCORE = 70

# If best and second best are too close, do not auto-match.
AUTO_MATCH_MIN_MARGIN = 6

# Flexible Spotify -> Deezer title fallback.
TITLE_SIMILARITY_MIN = 0.82

# Accept a base-title match only when exactly one unused MIK row can fit.
ALLOW_UNIQUE_BASE_TITLE = True

MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2"
MUSICBRAINZ_USER_AGENT = "FlamingoDJ/1.0 (local-library)"
MUSICBRAINZ_SLEEP = 1.05
HTTP_TIMEOUT = 30

# Artist enrichment:
# The script asks once per execution if missing/new PRIMARY artists
# should be enriched through Spotify + MusicBrainz.
ASK_ARTIST_ENRICHMENT = True

# Only the FIRST Spotify artist is used as the track's country/main artist.
# Collaborators can still be stored in SongArtists, but Country in React
# comes from Position=1.
PRIMARY_ARTIST_ONLY_FOR_COUNTRY = True

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
# MIK COLUMN ALIASES
# ============================================================

MIK_ALIASES = {
    "song_id": [
        "SongID",
        "Song Id",
        "song_id",
    ],
    "spotify_url": [
        "SpotifyURL",
        "Spotify URL",
        "Spotify_URL",
    ],
    "title": [
        "Title",
        "Name",
    ],
    "artist": [
        "Artist",
        "Artists",
    ],
    "key": [
        "Key",
        "Musical Key",
    ],
    "tempo": [
        "Tempo",
        "BPM",
    ],
    "genre": [
        "Genre",
    ],
    "album": [
        "Album",
    ],
    "date_added": [
        "Date Added",
        "DateAdded",
    ],
    "location": [
        "Location",
        "File",
        "File Path",
        "Path",
    ],
    "comment": [
        "Comment",
        "Comments",
    ],
    "overall_volume": [
        "Overall Volume",
        "Overall Vol",
        "OverallVol",
    ],
    "energy": [
        "Energy",
    ],
    "cue_points": [
        "CuePoints",
        "Cue Points",
    ],
    "clipped_peaks": [
        "ClippedPeaks",
        "Clipped Peaks",
        "Clipped Peak",
    ],
}


# ============================================================
# BASIC HELPERS
# ============================================================

def log(message: str):
    print(message, flush=True)


def is_empty(value) -> bool:
    return value is None or (
        isinstance(value, str)
        and not value.strip()
    )


def first_value(*values):
    for value in values:
        if not is_empty(value):
            return value

    return None


def clean_string(value) -> Optional[str]:
    return None if is_empty(value) else str(value).strip()


def strip_accents(value) -> str:
    return "".join(
        ch
        for ch in unicodedata.normalize(
            "NFKD",
            str(value or ""),
        )
        if not unicodedata.combining(ch)
    )


def normalize_text(value) -> str:
    text = strip_accents(value).lower().strip()

    text = (
        text
        .replace("’", "'")
        .replace("`", "'")
        .replace("´", "'")
        .replace("–", "-")
        .replace("—", "-")
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def normalize_title(value) -> str:
    text = normalize_text(value)

    text = re.sub(
        r"[^\w\s#&'+\-()]",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def normalize_artist(value) -> str:
    text = normalize_text(value)

    text = re.sub(
        r"[^\w\s&,'./+\-$]",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def sanitize_header(value) -> str:
    return re.sub(
        r"[^a-z0-9]",
        "",
        normalize_text(value),
    )


def slugify(value) -> str:
    return re.sub(
        r"[^a-z0-9]+",
        " ",
        normalize_text(value),
    ).strip()


def sanitize_filename_component(value) -> str:
    text = str(value or "Unknown").strip()

    text = re.sub(
        r'[<>:"/\\|?*]',
        "_",
        text,
    )

    text = "".join(
        ch
        for ch in text
        if ord(ch) >= 32
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    ).strip(" .")

    return (text or "Unknown")[:120]


def parse_float(value) -> Optional[float]:
    if is_empty(value):
        return None

    match = re.search(
        r"-?\d+(?:\.\d+)?",
        str(value),
    )

    return (
        float(match.group())
        if match
        else None
    )


def parse_int(value) -> Optional[int]:
    value = parse_float(value)

    return (
        int(round(value))
        if value is not None
        else None
    )



def valid_tempo(value) -> Optional[float]:
    tempo = parse_float(value)
    if tempo is None or tempo <= 0:
        return None
    return tempo


def valid_energy(value) -> Optional[float]:
    energy = parse_float(value)
    if energy is None or energy <= 0:
        return None
    return energy

def duration_to_seconds(value) -> Optional[int]:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        number = float(value)

        return (
            int(round(number / 1000))
            if number > 10000
            else int(round(number))
        )

    text = str(value).strip()

    if ":" in text:
        try:
            parts = [
                int(float(part))
                for part in text.split(":")
            ]

            if len(parts) == 2:
                return parts[0] * 60 + parts[1]

            if len(parts) == 3:
                return (
                    parts[0] * 3600
                    + parts[1] * 60
                    + parts[2]
                )

        except Exception:
            pass

    number = parse_float(text)

    if number is None:
        return None

    return (
        int(round(number / 1000))
        if number > 10000
        else int(round(number))
    )


def duration_display(seconds) -> Optional[str]:
    if seconds is None:
        return None

    seconds = int(seconds)

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    return (
        f"{hours:02d}:{minutes:02d}:{secs:02d}"
        if hours
        else f"{minutes:02d}:{secs:02d}"
    )


# ============================================================
# TITLE / VERSION NORMALIZATION
# ============================================================

VERSION_PATTERNS = [
    "radio edit",
    "radio mix",
    "extended mix",
    "original mix",
    "club mix",
    "vocal mix",
    "short edit",
    "edit",
    "remix",
    "mix",
    "version",
    "20th anniversary mix",
]


def strip_feature_text(value) -> str:
    text = normalize_text(value)

    text = re.sub(
        r"\s*[\(\[]\s*"
        r"(?:feat\.?|ft\.?|featuring)\b"
        r".*?[\)\]]",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\s+(?:feat\.?|ft\.?|featuring)\b.*$",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    return re.sub(r"\s+", " ", text).strip()


def extract_version_tokens(value) -> set:
    text = normalize_text(value)

    found = set()

    for pattern in VERSION_PATTERNS:
        if pattern in text:
            found.add(pattern)

    # Keep year when attached to remix/version.
    year_match = re.search(r"\b(19|20)\d{2}\b", text)

    if year_match and (
        "remix" in text
        or "version" in text
        or "mix" in text
    ):
        found.add(year_match.group())

    return found


def base_title(value) -> str:
    text = strip_feature_text(value)

    # Convert punctuation separators to spaces.
    text = re.sub(
        r"[\(\)\[\]\-–—_:]+",
        " ",
        text,
    )

    # Remove known structural version words.
    for phrase in sorted(
        VERSION_PATTERNS,
        key=len,
        reverse=True,
    ):
        text = re.sub(
            rf"\b{re.escape(phrase)}\b",
            " ",
            text,
            flags=re.IGNORECASE,
        )

    # Remove a standalone remix year after version stripping.
    text = re.sub(
        r"\b(?:19|20)\d{2}\b",
        " ",
        text,
    )

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def title_similarity(value_a, value_b) -> float:
    a = base_title(value_a)
    b = base_title(value_b)

    if not a or not b:
        return 0.0

    return SequenceMatcher(None, a, b).ratio()


# ============================================================
# ARTIST EXCEPTIONS / ARTIST LIST
# ============================================================

def load_artist_exceptions() -> List[str]:
    if not ARTIST_EXCEPTIONS_PATH.exists():
        return []

    try:
        data = json.loads(
            ARTIST_EXCEPTIONS_PATH.read_text(
                encoding="utf-8"
            )
        )

        if isinstance(data, list):
            return [
                str(item).strip()
                for item in data
                if str(item).strip()
            ]

        if isinstance(data, dict):
            return [
                str(item).strip()
                for item in data.keys()
                if str(item).strip()
            ]

    except Exception as exc:
        log(
            f"ARTIST_EXCEPTIONS warning: {exc}"
        )

    return []


ARTIST_EXCEPTIONS = load_artist_exceptions()


def protect_artist_exceptions(text: str):
    protected = str(text or "")
    placeholders = {}

    for index, artist in enumerate(
        sorted(
            ARTIST_EXCEPTIONS,
            key=len,
            reverse=True,
        )
    ):
        placeholder = f"__ARTIST_EXCEPTION_{index}__"

        replaced = re.sub(
            re.escape(artist),
            placeholder,
            protected,
            flags=re.IGNORECASE,
        )

        if replaced != protected:
            protected = replaced
            placeholders[placeholder] = artist

    return protected, placeholders


def restore_artist_exceptions(
    text: str,
    placeholders: Dict[str, str],
) -> str:
    for placeholder, artist in placeholders.items():
        text = text.replace(
            placeholder,
            artist,
        )

    return text


def split_artists_from_text(value) -> List[str]:
    text = str(value or "").strip()

    if not text:
        return []

    normalized_full = normalize_artist(text)

    for exception in ARTIST_EXCEPTIONS:
        if normalize_artist(exception) == normalized_full:
            return [exception]

    protected, placeholders = protect_artist_exceptions(text)

    protected = re.sub(
        r"\s+(?:feat\.?|ft\.?|featuring|with|w/|con)\s+",
        ", ",
        protected,
        flags=re.IGNORECASE,
    )

    parts = re.split(
        r"\s*(?:,|&|\+| x | / |;| and | y )\s*",
        protected,
        flags=re.IGNORECASE,
    )

    output = []
    seen = set()

    for part in parts:
        part = restore_artist_exceptions(
            part,
            placeholders,
        )

        part = part.strip()

        key = normalize_artist(part)

        if part and key and key not in seen:
            output.append(part)
            seen.add(key)

    return output


def source_artist_list(source_track: Dict) -> List[str]:
    spotify_artists = source_track.get("SpotifyArtists") or []

    names = [
        str(artist.get("name")).strip()
        for artist in spotify_artists
        if artist.get("name")
    ]

    if names:
        return names

    return split_artists_from_text(
        source_track.get("Artist")
        or source_track.get("artist")
        or ""
    )


def primary_artist_from_source(source_track: Dict) -> str:
    artists = source_artist_list(source_track)

    return (
        normalize_artist(artists[0])
        if artists
        else ""
    )


def primary_artist_from_mik(row: Dict) -> str:
    artists = split_artists_from_text(
        mik_value(row, "artist")
    )

    return (
        normalize_artist(artists[0])
        if artists
        else ""
    )


# ============================================================
# KEY / CAMELOT
# ============================================================

ENHARMONIC = {
    "Bb": "A#",
    "Db": "C#",
    "Eb": "D#",
    "Gb": "F#",
    "Ab": "G#",
    "Bbm": "A#m",
    "Dbm": "C#m",
    "Ebm": "D#m",
    "Gbm": "F#m",
    "Abm": "G#m",
}


def normalize_key(value) -> Optional[str]:
    key = clean_string(value)

    return (
        ENHARMONIC.get(key, key)
        if key
        else None
    )


CAMELOT = {
    "G#m": "1A",
    "Abm": "1A",
    "B": "1B",
    "D#m": "2A",
    "Ebm": "2A",
    "F#": "2B",
    "Gb": "2B",
    "A#m": "3A",
    "Bbm": "3A",
    "C#": "3B",
    "Db": "3B",
    "Fm": "4A",
    "G#": "4B",
    "Ab": "4B",
    "Cm": "5A",
    "D#": "5B",
    "Eb": "5B",
    "Gm": "6A",
    "A#": "6B",
    "Bb": "6B",
    "Dm": "7A",
    "F": "7B",
    "Am": "8A",
    "C": "8B",
    "Em": "9A",
    "G": "9B",
    "Bm": "10A",
    "D": "10B",
    "F#m": "11A",
    "Gbm": "11A",
    "A": "11B",
    "C#m": "12A",
    "Dbm": "12A",
    "E": "12B",
}


def key_to_camelot(value) -> Optional[str]:
    raw = clean_string(value)

    if not raw:
        return None

    return (
        CAMELOT.get(raw)
        or CAMELOT.get(normalize_key(raw))
    )


# ============================================================
# CSV / MIK
# ============================================================

def find_column(
    columns: List[str],
    aliases: List[str],
) -> Optional[str]:
    normalized = {
        sanitize_header(column): column
        for column in columns
    }

    for alias in aliases:
        key = sanitize_header(alias)

        if key in normalized:
            return normalized[key]

    return None


def mik_value(
    row: Optional[Dict],
    field: str,
):
    if not row:
        return None

    column = find_column(
        list(row.keys()),
        MIK_ALIASES.get(field, []),
    )

    return (
        row.get(column)
        if column
        else None
    )


def read_csv_file(path: Path) -> List[Dict]:
    last_error = None

    for encoding in [
        "utf-8-sig",
        "utf-8",
        "cp1252",
        "latin1",
    ]:
        try:
            with open(
                path,
                "r",
                encoding=encoding,
                newline="",
            ) as handle:
                sample = handle.read(8192)
                handle.seek(0)

                try:
                    dialect = csv.Sniffer().sniff(
                        sample,
                        delimiters=",;\t",
                    )
                except Exception:
                    dialect = csv.excel

                return [
                    dict(row)
                    for row in csv.DictReader(
                        handle,
                        dialect=dialect,
                    )
                ]

        except Exception as exc:
            last_error = exc

    raise RuntimeError(
        f"No pude leer {path}: {last_error}"
    )


def load_mik_catalog() -> List[Dict]:
    if not SOURCE_MIXNKEY_CSV.exists():
        raise FileNotFoundError(
            f"No encontré el CSV Mixed In Key:\n"
            f"{SOURCE_MIXNKEY_CSV}"
        )

    rows = read_csv_file(
        SOURCE_MIXNKEY_CSV
    )

    catalog = []

    for index, row in enumerate(rows):
        title = mik_value(row, "title")
        artist = mik_value(row, "artist")

        catalog.append({
            "index": index,
            "row": row,
            "title_norm": normalize_title(title),
            "base_title": base_title(title),
            "artist_norm": normalize_artist(artist),
            "primary_artist": primary_artist_from_mik(row),
            "artist_list": [
                normalize_artist(item)
                for item in split_artists_from_text(artist)
            ],
            "version_tokens": extract_version_tokens(title),
        })

    print()
    print("=" * 72)
    print("MIXED IN KEY BATCH")
    print("=" * 72)
    print(f"CSV    : {SOURCE_MIXNKEY_CSV}")
    print(f"Rows   : {len(catalog)}")

    return catalog


# ============================================================
# TOLERANT MATCHER
# ============================================================

def exact_ids_match(
    source_track: Dict,
    mik_item: Dict,
) -> Optional[Tuple[int, str]]:

    row = mik_item["row"]

    source_song_id = first_value(
        source_track.get("SongID"),
        source_track.get("song_id"),
        source_track.get("externalSongId"),
        source_track.get("id"),
    )

    mik_song_id = mik_value(
        row,
        "song_id",
    )

    if source_song_id is not None and mik_song_id is not None:
        try:
            if int(float(source_song_id)) == int(float(mik_song_id)):
                return 100, "SONG_ID"
        except Exception:
            pass

    source_url = first_value(
        source_track.get("SpotifyURL"),
        source_track.get("spotifyUrl"),
        source_track.get("spotify_url"),
    )

    mik_url = mik_value(
        row,
        "spotify_url",
    )

    if (
        source_url
        and mik_url
        and str(source_url).strip() == str(mik_url).strip()
    ):
        return 100, "SPOTIFY_URL"

    return None


def score_candidate(
    source_track: Dict,
    mik_item: Dict,
) -> Tuple[int, List[str]]:

    exact = exact_ids_match(source_track, mik_item)
    if exact:
        return exact[0], [exact[1]]

    row = mik_item["row"]

    source_title = first_value(
        source_track.get("Title"),
        source_track.get("title"),
    )
    source_title_norm = normalize_title(source_title)
    source_base = base_title(source_title)
    source_primary = primary_artist_from_source(source_track)

    source_artists = {
        normalize_artist(item)
        for item in source_artist_list(source_track)
        if normalize_artist(item)
    }

    source_version = extract_version_tokens(source_title)

    score = 0
    reasons = []

    # TITLE
    if source_title_norm and source_title_norm == mik_item["title_norm"]:
        score += 55
        reasons.append("TITLE_EXACT")

    elif source_base and source_base == mik_item["base_title"]:
        score += 48
        reasons.append("BASE_TITLE")

    else:
        similarity = title_similarity(
            source_title,
            mik_value(row, "title"),
        )

        if similarity < TITLE_SIMILARITY_MIN:
            return 0, ["TITLE_DIFFERENT"]

        score += int(
            35
            + (similarity - TITLE_SIMILARITY_MIN) * 60
        )
        reasons.append(f"TITLE_SIMILAR_{similarity:.2f}")

    # ARTIST
    if (
        source_primary
        and source_primary == mik_item["primary_artist"]
    ):
        score += 38
        reasons.append("PRIMARY_ARTIST")

    elif (
        source_artists
        and mik_item["primary_artist"] in source_artists
    ):
        score += 34
        reasons.append("MIK_PRIMARY_IN_SPOTIFY_ARTISTS")

    elif (
        source_artists
        and set(mik_item["artist_list"]) & source_artists
    ):
        score += 28
        reasons.append("ARTIST_OVERLAP")

    elif (
        normalize_artist(
            source_track.get("Artist")
            or source_track.get("artist")
        )
        == mik_item["artist_norm"]
    ):
        score += 36
        reasons.append("FULL_ARTIST")

    else:
        score -= 25
        reasons.append("ARTIST_DIFFERENT")

    # VERSION
    mik_version = mik_item["version_tokens"]

    if source_version and mik_version:
        if source_version & mik_version:
            score += 6
            reasons.append("VERSION_OVERLAP")

        elif (
            "remix" in source_version
            or "remix" in mik_version
        ):
            score -= 8
            reasons.append("VERSION_POSSIBLE_CONFLICT")

    return score, reasons

def find_best_mik_match(
    source_track: Dict,
    catalog: List[Dict],
    used_rows: set,
) -> Tuple[
    Optional[Dict],
    str,
    int,
    int,
    List[str],
]:

    scored = []

    for item in catalog:
        if item["index"] in used_rows:
            continue

        score, reasons = score_candidate(
            source_track,
            item,
        )

        if score > 0:
            scored.append((score, item, reasons))

    best_score = 0
    second_score = 0

    if scored:
        scored.sort(
            key=lambda value: value[0],
            reverse=True,
        )

        best_score, best_item, reasons = scored[0]
        second_score = scored[1][0] if len(scored) > 1 else 0
        margin = best_score - second_score

        if best_score >= AUTO_MATCH_MIN_SCORE:
            if (
                best_score < 100
                and second_score > 0
                and margin < AUTO_MATCH_MIN_MARGIN
            ):
                return (
                    None,
                    "AMBIGUOUS",
                    best_score,
                    second_score,
                    reasons,
                )

            used_rows.add(best_item["index"])

            return (
                best_item,
                "+".join(reasons),
                best_score,
                second_score,
                reasons,
            )

    # Flexible fallback: same base title, but ONLY one unused candidate.
    if ALLOW_UNIQUE_BASE_TITLE:
        source_title = first_value(
            source_track.get("Title"),
            source_track.get("title"),
        )
        source_base = base_title(source_title)

        candidates = [
            item
            for item in catalog
            if (
                item["index"] not in used_rows
                and source_base
                and item["base_title"] == source_base
            )
        ]

        if len(candidates) == 1:
            candidate = candidates[0]
            used_rows.add(candidate["index"])

            return (
                candidate,
                "UNIQUE_BASE_TITLE",
                best_score,
                second_score,
                ["UNIQUE_BASE_TITLE"],
            )

    if scored:
        return (
            None,
            "LOW_SCORE",
            best_score,
            second_score,
            scored[0][2],
        )

    return (
        None,
        "NO_MATCH",
        0,
        0,
        [],
    )


# ============================================================
# PLAYLIST JSON
# ============================================================

def load_source_playlist() -> Tuple[Dict, List[Dict]]:
    if not SOURCE_PLAYLIST_JSON.exists():
        raise FileNotFoundError(
            SOURCE_PLAYLIST_JSON
        )

    data = json.loads(
        SOURCE_PLAYLIST_JSON.read_text(
            encoding="utf-8"
        )
    )

    if isinstance(data, list):
        return {}, data

    if (
        isinstance(data, dict)
        and isinstance(data.get("tracks"), list)
    ):
        return data, data["tracks"]

    raise RuntimeError(
        "Formato playlist JSON no reconocido."
    )


def load_pending_playlist() -> Tuple[Dict, List[Dict]]:
    """
    Loads ONLY the tracks that SPOTIFY_PLAYLIST_TO_MASTER.py marked as
    pending (NEW / NO_BPM / NO_KEY / NO_ENERGY / NO_AUDIO).

    This is the list that MIXNKEY actually processes.
    The complete Spotify playlist is read only later when rebuilding the
    final React JSON from DJ.db.
    """
    if not SOURCE_PENDING_JSON.exists():
        raise FileNotFoundError(
            "No encontré el JSON PENDING:\n"
            f"{SOURCE_PENDING_JSON}\n\n"
            "Ejecuta primero SPOTIFY_PLAYLIST_TO_MASTER.py."
        )

    data = json.loads(
        SOURCE_PENDING_JSON.read_text(
            encoding="utf-8"
        )
    )

    if isinstance(data, list):
        return {}, data

    if (
        isinstance(data, dict)
        and isinstance(data.get("tracks"), list)
    ):
        return data, data["tracks"]

    raise RuntimeError(
        "Formato PENDING JSON no reconocido."
    )


# ============================================================
# DATABASE HELPERS
# ============================================================

def table_exists(
    conn,
    table: str,
) -> bool:
    return conn.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type='table'
          AND name=?
        """,
        (table,),
    ).fetchone() is not None


def table_columns(
    conn,
    table: str,
) -> Dict[str, str]:
    if not table_exists(conn, table):
        return {}

    return {
        str(row[1]).lower(): str(row[1])
        for row in conn.execute(
            f'PRAGMA table_info("{table}")'
        )
    }


# ============================================================
# MASTER TRACK
# ============================================================

def get_master_connection():
    conn = sqlite3.connect(
        MASTER_DB_PATH,
        timeout=60,
    )

    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=60000")

    return conn


def load_master_track(
    conn,
    song_id,
) -> Optional[Dict]:

    try:
        song_id = int(float(str(song_id)))
    except Exception:
        return None

    song = conn.execute(
        """
        SELECT *
        FROM Songs
        WHERE SongID=?
        LIMIT 1
        """,
        (song_id,),
    ).fetchone()

    if not song:
        return None

    metadata = {}
    spotify = {}

    if table_exists(
        conn,
        "TrackMetadata",
    ):
        row = conn.execute(
            """
            SELECT *
            FROM TrackMetadata
            WHERE SongID=?
            LIMIT 1
            """,
            (song_id,),
        ).fetchone()

        metadata = (
            dict(row)
            if row
            else {}
        )

    if table_exists(
        conn,
        "SpotifyLinks",
    ):
        row = conn.execute(
            """
            SELECT *
            FROM SpotifyLinks
            WHERE SongID=?
            LIMIT 1
            """,
            (song_id,),
        ).fetchone()

        spotify = (
            dict(row)
            if row
            else {}
        )

    song = dict(song)

    return {
        "SongID": song_id,
        "Title": song.get("Title"),
        "Artist": song.get("Artist"),
        "Album": metadata.get("Album"),
        "Duration": metadata.get("Duration"),
        "CoverImage": metadata.get("CoverImage"),
        "Popularity": metadata.get("Popularity"),
        "ReleaseDate": metadata.get("ReleaseDate"),
        "Genre": metadata.get("Genre"),
        "SpotifyURL": spotify.get("Spotify_URL"),
        "SpotifyTrackID": spotify.get("SpotifyTrackID"),
    }


# ============================================================
# DJ.db
# ============================================================

DJ_COLUMNS = {
    "song_id": "INTEGER",
    "title": "TEXT",
    "artist": "TEXT",
    "popularity": "INTEGER",
    "release_date": "TEXT",
    "genre": "TEXT",
    "album": "TEXT",
    "spotify_url": "TEXT",
    "tempo": "REAL",
    "musical_key": "TEXT",
    "camelot": "TEXT",
    "cue_points": "TEXT",
    "energy": "REAL",
    "overall_vol": "REAL",
    "clipped_peaks": "INTEGER",
    "folder": "TEXT",
    "keywords": "TEXT",
    "country": "TEXT",
    "date_added": "TEXT",
    "comments": "TEXT",
}


def get_dj_connection():
    conn = sqlite3.connect(
        DJ_DB_PATH,
        timeout=60,
    )

    conn.row_factory = sqlite3.Row

    return conn


def ensure_dj_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tracks (
            song_id INTEGER,
            title TEXT,
            artist TEXT
        )
        """
    )

    cols = table_columns(
        conn,
        "tracks",
    )

    for name, sql_type in DJ_COLUMNS.items():
        if name.lower() not in cols:
            conn.execute(
                f'ALTER TABLE tracks '
                f'ADD COLUMN "{name}" {sql_type}'
            )

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dj_tracks_songid
        ON tracks(song_id)
        """
    )

    conn.commit()


def load_dj_track(
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
        (int(song_id),),
    ).fetchone()

    return (
        dict(row)
        if row
        else None
    )


def upsert_dj_track(
    conn,
    song_id: int,
    values: Dict,
):
    cols = table_columns(
        conn,
        "tracks",
    )

    supported = {}

    for logical_name, value in values.items():
        actual = cols.get(
            logical_name.lower()
        )

        if actual:
            supported[actual] = value

    existing = conn.execute(
        """
        SELECT rowid
        FROM tracks
        WHERE song_id=?
        LIMIT 1
        """,
        (int(song_id),),
    ).fetchone()

    if existing:
        updates = []
        params = []

        for actual, value in supported.items():
            if actual.lower() == "song_id":
                continue

            updates.append(
                f'"{actual}"=?'
            )

            params.append(value)

        if updates:
            params.append(int(song_id))

            conn.execute(
                f'UPDATE tracks '
                f'SET {", ".join(updates)} '
                f'WHERE song_id=?',
                params,
            )

    else:
        supported[
            cols.get("song_id", "song_id")
        ] = int(song_id)

        names = ", ".join(
            f'"{name}"'
            for name in supported
        )

        placeholders = ", ".join(
            "?"
            for _ in supported
        )

        conn.execute(
            f'INSERT INTO tracks '
            f'({names}) '
            f'VALUES ({placeholders})',
            tuple(supported.values()),
        )

    conn.commit()


def dj_track_is_complete(
    track: Optional[Dict],
) -> bool:

    if not track:
        return False

    if valid_tempo(track.get("tempo")) is None:
        return False

    if is_empty(track.get("musical_key")):
        return False

    if valid_energy(track.get("energy")) is None:
        return False

    folder = track.get("folder")

    if is_empty(folder):
        return False

    try:
        if not Path(str(folder)).exists():
            return False

    except Exception:
        return False

    return True


# ============================================================
# PRIMARY ARTIST ENRICHMENT STATUS
# ============================================================

def source_primary_artist_input(source_track: Dict) -> Optional[Dict]:
    """
    Returns the FIRST artist from Spotify's ordered artists[] array.

    This is the authoritative main artist for:
        - track.country
        - artistDetails
        - primary ArtistID / SongArtists Position=1

    If SpotifyArtists is unavailable, fall back to the first parsed artist.
    """
    spotify_artists = source_track.get("SpotifyArtists") or []

    if spotify_artists:
        artist = spotify_artists[0] or {}
        name = clean_string(artist.get("name"))

        if not name:
            return None

        return {
            "name": name,
            "id": artist.get("id"),
            "uri": artist.get("uri"),
            "external_urls": artist.get("external_urls") or {},
            "position": 1,
        }

    names = split_artists_from_text(
        source_track.get("Artist")
        or source_track.get("artist")
        or ""
    )

    if not names:
        return None

    return {
        "name": names[0],
        "id": None,
        "uri": None,
        "external_urls": {},
        "position": 1,
    }


def primary_artist_needs_enrichment(
    conn,
    source_track: Dict,
) -> Tuple[bool, Optional[Dict], Optional[Dict], List[str]]:
    """
    Returns:
        needs_enrichment,
        artist_input,
        existing_artist_row,
        missing_fields

    We consider a primary artist incomplete when:
        - it does not exist in Artists
        - Country is missing
        - SpotifyID is missing
        - SpotifyURL is missing
        - SpotifyImageURL is missing
        - MusicBrainzID is missing

    Country is intentionally important because the React playlist displays it.
    """
    ensure_artist_schema(conn)

    artist_input = source_primary_artist_input(
        source_track
    )

    if not artist_input:
        return (
            False,
            None,
            None,
            [],
        )

    existing = find_artist(
        conn,
        artist_input["name"],
        artist_input.get("id"),
    )

    missing = []

    if existing is None:
        missing.append("NEW_ARTIST")
        return (
            True,
            artist_input,
            None,
            missing,
        )

    if is_empty(existing.get("Country")):
        missing.append("NO_COUNTRY")

    if is_empty(existing.get("SpotifyID")):
        missing.append("NO_SPOTIFY_ID")

    if is_empty(existing.get("SpotifyURL")):
        missing.append("NO_SPOTIFY_URL")

    if is_empty(existing.get("SpotifyImageURL")):
        missing.append("NO_SPOTIFY_IMAGE")

    if is_empty(existing.get("MusicBrainzID")):
        missing.append("NO_MUSICBRAINZ_ID")

    return (
        bool(missing),
        artist_input,
        existing,
        missing,
    )


def collect_missing_primary_artists(
    conn,
    source_tracks: List[Dict],
) -> List[Dict]:
    """
    Deduplicated list of PRIMARY artists in this Spotify playlist that
    are new or incomplete in MASTER_CLEAN.db.
    """
    output = []
    seen = set()

    for track in source_tracks:
        (
            needs,
            artist_input,
            existing,
            missing,
        ) = primary_artist_needs_enrichment(
            conn,
            track,
        )

        if not needs or not artist_input:
            continue

        spotify_id = clean_string(
            artist_input.get("id")
        )

        key = (
            f"spotify:{spotify_id}"
            if spotify_id
            else f"name:{normalize_artist(artist_input.get('name'))}"
        )

        if key in seen:
            continue

        seen.add(key)

        output.append({
            "name": artist_input.get("name"),
            "spotify_id": artist_input.get("id"),
            "existing_artist_id": (
                existing.get("ArtistID")
                if existing
                else None
            ),
            "missing": missing,
        })

    return output


def ask_artist_enrichment(
    missing_artists: List[Dict],
) -> bool:
    """
    Ask only once.
    """
    if not ASK_ARTIST_ENRICHMENT:
        return False

    if not missing_artists:
        print()
        print("ARTISTS: todos los artistas principales ya tienen metadata suficiente.")
        return False

    print()
    print("=" * 72)
    print("ARTIST MASTER ENRICHMENT")
    print("=" * 72)
    print(
        f"Artistas principales nuevos/incompletos: "
        f"{len(missing_artists)}"
    )

    for index, artist in enumerate(
        missing_artists[:30],
        start=1,
    ):
        print(
            f"[{index}/{len(missing_artists)}] "
            f"{artist.get('name')} "
            f"| ArtistID={artist.get('existing_artist_id')} "
            f"| SpotifyID={artist.get('spotify_id')} "
            f"| {', '.join(artist.get('missing') or [])}"
        )

    if len(missing_artists) > 30:
        print(
            f"... +{len(missing_artists) - 30} artistas adicionales"
        )

    answer = input(
        "\n¿Quieres buscar/completar estos artistas con "
        "Spotify API + MusicBrainz y guardarlos en MASTER_CLEAN.db? [S/N]: "
    ).strip().lower()

    return answer in {
        "s",
        "si",
        "sí",
        "y",
        "yes",
    }


def ensure_primary_artist_enriched(
    conn,
    source_track: Dict,
) -> Optional[Dict]:
    """
    Enrich ONLY the authoritative PRIMARY artist.

    If the artist is new:
        -> next ArtistID is generated by ensure_single_artist()/write_artist()

    If it already exists:
        -> only missing fields are filled.

    Then ensures SongArtists Position=1 points to that ArtistID.
    """
    artist_input = source_primary_artist_input(
        source_track
    )

    if not artist_input:
        return None

    saved_artist = ensure_single_artist(
        conn,
        artist_input,
    )

    # Preserve all collaborators already linked, but make sure Position=1
    # is the first Spotify artist.
    upsert_songartist(
        conn,
        int(source_track.get("SongID")),
        saved_artist,
        artist_input,
        source_track.get("Artist") or "",
    )

    conn.commit()

    return saved_artist


# ============================================================
# SPOTIFY AUTH FOR ARTIST FALLBACK
# ============================================================

_SPOTIFY_TOKEN = None


def get_spotify_token_if_needed() -> Optional[str]:
    global _SPOTIFY_TOKEN

    if _SPOTIFY_TOKEN:
        return _SPOTIFY_TOKEN

    if not ENV_PATH.exists():
        return None

    load_dotenv(
        ENV_PATH,
        override=False,
    )

    client_id = os.getenv(
        "SPOTIFY_CLIENT_ID",
        "",
    ).strip()

    client_secret = os.getenv(
        "SPOTIFY_CLIENT_SECRET",
        "",
    ).strip()

    redirect_uri = os.getenv(
        "SPOTIFY_REDIRECT_URI",
        "",
    ).strip()

    if not all([
        client_id,
        client_secret,
        redirect_uri,
    ]):
        return None

    auth = SpotifyOAuth(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scope=SPOTIFY_SCOPE,
        cache_path=str(SPOTIFY_TOKEN_CACHE),
        open_browser=True,
    )

    token_info = auth.get_cached_token()

    if (
        token_info
        and auth.is_token_expired(token_info)
    ):
        refresh = token_info.get(
            "refresh_token"
        )

        token_info = (
            auth.refresh_access_token(refresh)
            if refresh
            else None
        )

    if not token_info:
        url = auth.get_authorize_url()

        print(url)
        webbrowser.open(url)

        callback = input(
            "\nArtist enrichment necesita Spotify auth.\n"
            "Pega la URL COMPLETA del callback:\n> "
        ).strip()

        code = auth.parse_response_code(
            callback
        )

        if not code:
            return None

        token_info = auth.get_access_token(
            code=code,
            as_dict=True,
            check_cache=False,
        )

    _SPOTIFY_TOKEN = (
        (token_info or {}).get(
            "access_token"
        )
    )

    return _SPOTIFY_TOKEN


def spotify_artist_details(
    token: str,
    artist_id: str,
) -> Optional[Dict]:
    if not token or not artist_id:
        return None

    response = requests.get(
        f"{SPOTIFY_API_BASE}/artists/{artist_id}",
        headers={
            "Authorization": f"Bearer {token}"
        },
        timeout=HTTP_TIMEOUT,
    )

    if response.status_code != 200:
        return None

    return response.json()



def spotify_search_artist(
    token: str,
    artist_name: str,
) -> Optional[Dict]:
    """
    Fallback for legacy playlist JSON where SpotifyArtists[].id is absent.
    Prefer exact normalized artist-name match.
    """
    if not token or not artist_name:
        return None

    response = requests.get(
        f"{SPOTIFY_API_BASE}/search",
        headers={
            "Authorization": f"Bearer {token}"
        },
        params={
            "q": f'artist:"{artist_name}"',
            "type": "artist",
            "limit": 5,
        },
        timeout=HTTP_TIMEOUT,
    )

    if response.status_code != 200:
        return None

    items = (
        (response.json().get("artists") or {})
        .get("items")
        or []
    )

    if not items:
        return None

    target = normalize_artist(
        artist_name
    )

    for item in items:
        if normalize_artist(
            item.get("name")
        ) == target:
            return item

    # Conservative fallback: only take first result if name is very close.
    first = items[0]

    if (
        normalize_artist(first.get("name"))
        == target
    ):
        return first

    return None


# ============================================================
# MUSICBRAINZ
# ============================================================

_last_musicbrainz_request = 0.0


def musicbrainz_search_artist(
    artist_name: str,
) -> Optional[Dict]:

    global _last_musicbrainz_request

    elapsed = (
        time.time()
        - _last_musicbrainz_request
    )

    if elapsed < MUSICBRAINZ_SLEEP:
        time.sleep(
            MUSICBRAINZ_SLEEP - elapsed
        )

    response = requests.get(
        f"{MUSICBRAINZ_API_BASE}/artist/",
        params={
            "query": f'artist:"{artist_name}"',
            "fmt": "json",
            "limit": 5,
        },
        headers={
            "User-Agent": MUSICBRAINZ_USER_AGENT
        },
        timeout=HTTP_TIMEOUT,
    )

    _last_musicbrainz_request = time.time()

    if response.status_code != 200:
        return None

    artists = (
        response.json().get("artists")
        or []
    )

    if not artists:
        return None

    target = normalize_artist(
        artist_name
    )

    for artist in artists:
        if (
            normalize_artist(
                artist.get("name")
            )
            == target
        ):
            return artist

    first = artists[0]

    try:
        score = int(
            first.get("score")
            or 0
        )
    except Exception:
        score = 0

    return (
        first
        if score >= 90
        else None
    )


# ============================================================
# ARTISTS / SONGARTISTS
# ============================================================

def ensure_artist_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS Artists (
            ArtistID INTEGER PRIMARY KEY,
            Artist TEXT,
            Country TEXT,
            Genres TEXT,
            SpotifyID TEXT,
            SpotifyURL TEXT,
            SpotifyURI TEXT,
            SpotifyImageURL TEXT,
            SpotifyPopularity INTEGER,
            SpotifyFollowers INTEGER,
            NormalizedArtist TEXT,
            MusicBrainzID TEXT
        )
        """
    )

    artist_cols = table_columns(
        conn,
        "Artists",
    )

    desired = {
        "Country": "TEXT",
        "Genres": "TEXT",
        "SpotifyID": "TEXT",
        "SpotifyURL": "TEXT",
        "SpotifyURI": "TEXT",
        "SpotifyImageURL": "TEXT",
        "SpotifyPopularity": "INTEGER",
        "SpotifyFollowers": "INTEGER",
        "NormalizedArtist": "TEXT",
        "MusicBrainzID": "TEXT",
    }

    for name, sql_type in desired.items():
        if name.lower() not in artist_cols:
            conn.execute(
                f'ALTER TABLE Artists '
                f'ADD COLUMN "{name}" {sql_type}'
            )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS SongArtists (
            SongID INTEGER NOT NULL,
            ArtistID INTEGER NOT NULL,
            Role TEXT,
            Position INTEGER,
            ArtistName TEXT,
            ParsedArtistName TEXT,
            OriginalArtistText TEXT,
            NormalizedArtist TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_artists_norm
        ON Artists(NormalizedArtist)
        """
    )

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_songartists_songid
        ON SongArtists(SongID)
        """
    )

    conn.commit()


def next_artist_id(conn) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(
            MAX(CAST(ArtistID AS INTEGER)),
            0
        )
        FROM Artists
        """
    ).fetchone()

    return int(row[0] or 0) + 1


def find_artist(
    conn,
    name: str,
    spotify_id: Optional[str],
) -> Optional[Dict]:

    if spotify_id:
        row = conn.execute(
            """
            SELECT *
            FROM Artists
            WHERE SpotifyID=?
            LIMIT 1
            """,
            (spotify_id,),
        ).fetchone()

        if row:
            return dict(row)

    target = normalize_artist(
        name
    )

    rows = conn.execute(
        """
        SELECT *
        FROM Artists
        WHERE Artist IS NOT NULL
        """
    ).fetchall()

    for row in rows:
        candidate = dict(row)

        if (
            normalize_artist(
                candidate.get("Artist")
            )
            == target
        ):
            return candidate

    return None


def write_artist(
    conn,
    existing: Optional[Dict],
    values: Dict,
) -> Dict:

    cols = table_columns(
        conn,
        "Artists",
    )

    if existing:
        artist_id = int(
            existing["ArtistID"]
        )

        updates = []
        params = []

        for logical_name, value in values.items():
            actual = cols.get(
                logical_name.lower()
            )

            if not actual:
                continue

            if is_empty(value):
                continue

            if not is_empty(
                existing.get(actual)
            ):
                continue

            updates.append(
                f'"{actual}"=?'
            )

            params.append(value)

        if updates:
            params.append(
                artist_id
            )

            conn.execute(
                f'UPDATE Artists '
                f'SET {", ".join(updates)} '
                f'WHERE ArtistID=?',
                params,
            )

    else:
        artist_id = next_artist_id(
            conn
        )

        values = {
            "ArtistID": artist_id,
            **values,
        }

        insert_data = {}

        for logical_name, value in values.items():
            actual = cols.get(
                logical_name.lower()
            )

            if actual:
                insert_data[actual] = value

        names = ", ".join(
            f'"{name}"'
            for name in insert_data
        )

        placeholders = ", ".join(
            "?"
            for _ in insert_data
        )

        conn.execute(
            f'INSERT INTO Artists '
            f'({names}) '
            f'VALUES ({placeholders})',
            tuple(insert_data.values()),
        )

    conn.commit()

    row = conn.execute(
        """
        SELECT *
        FROM Artists
        WHERE ArtistID=?
        """,
        (artist_id,),
    ).fetchone()

    return dict(row)


def ensure_single_artist(
    conn,
    artist_input: Dict,
) -> Dict:

    name = artist_input["name"]
    spotify_id = artist_input.get("id")

    existing = find_artist(
        conn,
        name,
        spotify_id,
    )

    # ========================================================
    # SPOTIFY
    # ========================================================

    needs_spotify = (
        existing is None
        or is_empty(existing.get("SpotifyID"))
        or is_empty(existing.get("SpotifyURL"))
        or is_empty(existing.get("SpotifyImageURL"))
    )

    spotify_data = None

    if needs_spotify:
        token = get_spotify_token_if_needed()

        if token:
            # Best path: Spotify track already gave us the Artist ID.
            if spotify_id:
                spotify_data = spotify_artist_details(
                    token,
                    spotify_id,
                )

            # Legacy/fallback path: search by exact artist name.
            if spotify_data is None:
                spotify_data = spotify_search_artist(
                    token,
                    name,
                )

            if spotify_data and spotify_data.get("id"):
                spotify_id = spotify_data.get("id")

    canonical_name = first_value(
        (spotify_data or {}).get("name"),
        (existing or {}).get("Artist"),
        name,
    )

    # ========================================================
    # MUSICBRAINZ
    # ========================================================
    #
    # Spotify artist objects do NOT provide a reliable Country field.
    # MusicBrainz supplies Country/MBID.
    # ========================================================

    needs_musicbrainz = (
        existing is None
        or is_empty(existing.get("Country"))
        or is_empty(existing.get("MusicBrainzID"))
    )

    mb_data = (
        musicbrainz_search_artist(
            canonical_name
        )
        if needs_musicbrainz
        else None
    )

    spotify_data = spotify_data or {}

    images = spotify_data.get("images") or []
    followers = spotify_data.get("followers") or {}
    genres = spotify_data.get("genres")

    if isinstance(genres, list):
        genres = ", ".join(
            str(item)
            for item in genres
            if str(item).strip()
        )

    values = {
        "Artist": canonical_name,

        "Country": (
            (mb_data or {}).get("country")
        ),

        "Genres": genres,

        "SpotifyID": (
            spotify_data.get("id")
            or spotify_id
        ),

        "SpotifyURL": (
            (spotify_data.get("external_urls") or {}).get(
                "spotify"
            )
            or (
                (artist_input.get("external_urls") or {})
                .get("spotify")
            )
        ),

        "SpotifyURI": (
            spotify_data.get("uri")
            or artist_input.get("uri")
        ),

        "SpotifyImageURL": (
            images[0].get("url")
            if images
            else None
        ),

        "SpotifyPopularity": (
            spotify_data.get("popularity")
        ),

        "SpotifyFollowers": (
            followers.get("total")
            if isinstance(followers, dict)
            else None
        ),

        "NormalizedArtist": normalize_artist(
            canonical_name
        ),

        "MusicBrainzID": (
            (mb_data or {}).get("id")
        ),
    }

    saved = write_artist(
        conn,
        existing,
        values,
    )

    return saved

def upsert_songartist(
    conn,
    song_id: int,
    artist: Dict,
    input_artist: Dict,
    original_artist_text: str,
):

    cols = table_columns(
        conn,
        "SongArtists",
    )

    position = int(
        input_artist.get("position")
        or 1
    )

    conn.execute(
        """
        DELETE FROM SongArtists
        WHERE SongID=?
          AND Position=?
        """,
        (
            int(song_id),
            position,
        ),
    )

    values = {
        "SongID": int(song_id),
        "ArtistID": int(artist["ArtistID"]),
        "Role": (
            "main"
            if position == 1
            else "secondary_main"
        ),
        "Position": position,
        "ArtistName": artist.get("Artist"),
        "ParsedArtistName": input_artist.get("name"),
        "OriginalArtistText": original_artist_text,
        "NormalizedArtist": normalize_artist(
            artist.get("Artist")
        ),
    }

    actual = {}

    for logical_name, value in values.items():
        column = cols.get(
            logical_name.lower()
        )

        if column:
            actual[column] = value

    names = ", ".join(
        f'"{name}"'
        for name in actual
    )

    placeholders = ", ".join(
        "?"
        for _ in actual
    )

    conn.execute(
        f'INSERT INTO SongArtists '
        f'({names}) '
        f'VALUES ({placeholders})',
        tuple(actual.values()),
    )


def ensure_song_artists(
    conn,
    source_track: Dict,
    master: Dict,
):
    ensure_artist_schema(conn)

    spotify_artists = (
        source_track.get("SpotifyArtists")
        or []
    )

    if spotify_artists:
        inputs = []

        for position, artist in enumerate(
            spotify_artists,
            start=1,
        ):
            inputs.append({
                **artist,
                "position": position,
            })

    else:
        names = split_artists_from_text(
            master.get("Artist")
            or ""
        )

        inputs = [
            {
                "name": name,
                "id": None,
                "position": position,
                "uri": None,
                "external_urls": {},
            }
            for position, name in enumerate(
                names,
                start=1,
            )
        ]

    if not inputs:
        return

    # Spotify ordered array is authoritative.
    if spotify_artists:
        conn.execute(
            """
            DELETE FROM SongArtists
            WHERE SongID=?
            """,
            (int(master["SongID"]),),
        )

    for input_artist in inputs:
        artist = ensure_single_artist(
            conn,
            input_artist,
        )

        upsert_songartist(
            conn,
            master["SongID"],
            artist,
            input_artist,
            master.get("Artist") or "",
        )

    conn.commit()


def sync_songartists_without_api(
    conn,
    source_track: Dict,
    master: Dict,
):
    """
    Synchronize SongArtists using ONLY Artists rows that already exist.

    Used when the user answers NO to artist API enrichment.
    It never calls Spotify or MusicBrainz and never creates a new Artist.
    """
    ensure_artist_schema(conn)

    spotify_artists = source_track.get("SpotifyArtists") or []

    if spotify_artists:
        inputs = [
            {
                **artist,
                "position": position,
            }
            for position, artist in enumerate(
                spotify_artists,
                start=1,
            )
            if artist.get("name")
        ]
    else:
        names = split_artists_from_text(
            master.get("Artist")
            or ""
        )

        inputs = [
            {
                "name": name,
                "id": None,
                "position": position,
                "uri": None,
                "external_urls": {},
            }
            for position, name in enumerate(
                names,
                start=1,
            )
        ]

    for input_artist in inputs:
        existing = find_artist(
            conn,
            input_artist.get("name"),
            input_artist.get("id"),
        )

        if not existing:
            continue

        upsert_songartist(
            conn,
            master["SongID"],
            existing,
            input_artist,
            master.get("Artist") or "",
        )

    conn.commit()


def artist_to_json(
    artist: Dict,
) -> Dict:

    genres_raw = artist.get(
        "Genres"
    )

    if isinstance(
        genres_raw,
        list,
    ):
        genres = genres_raw

    elif genres_raw:
        genres = [
            item.strip()
            for item in re.split(
                r"[,;|]",
                str(genres_raw),
            )
            if item.strip()
        ]

    else:
        genres = []

    return {
        "artistId": (
            str(artist.get("ArtistID"))
            if artist.get("ArtistID") is not None
            else None
        ),
        "name": artist.get("Artist"),
        "imageUrl": artist.get("SpotifyImageURL"),
        "genres": genres,
        "country": artist.get("Country"),
        "spotifyUrl": artist.get("SpotifyURL"),
        "spotifyId": artist.get("SpotifyID"),
        "musicBrainzId": artist.get("MusicBrainzID"),
        "popularity": artist.get("SpotifyPopularity"),
        "followers": artist.get("SpotifyFollowers"),
    }


def get_primary_artist_details(
    conn,
    song_id: int,
) -> Optional[Dict]:

    row = conn.execute(
        """
        SELECT A.*
        FROM SongArtists SA
        JOIN Artists A
          ON A.ArtistID=SA.ArtistID
        WHERE SA.SongID=?
        ORDER BY
            COALESCE(SA.Position, 999999),
            A.ArtistID
        LIMIT 1
        """,
        (int(song_id),),
    ).fetchone()

    return (
        artist_to_json(dict(row))
        if row
        else None
    )


# ============================================================
# AUDIO LIBRARY
# ============================================================

def get_library_bucket(
    song_id: int,
) -> str:

    song_id = int(song_id)

    start = (
        song_id
        // 1000
        * 1000
    )

    return (
        f"{start}-{start + 999}"
    )


def build_library_filename(
    song_id,
    artist,
    title,
    extension,
) -> str:

    return (
        f"{song_id}__"
        f"{sanitize_filename_component(artist)}__"
        f"{sanitize_filename_component(title)}"
        f"{extension.lower()}"
    )


def find_existing_library_file(
    song_id,
) -> Optional[Path]:

    folder = (
        FLAMINGO_LIBRARY_DIR
        / get_library_bucket(song_id)
    )

    if not folder.exists():
        return None

    prefix = f"{song_id}__"

    for path in folder.iterdir():
        if (
            path.is_file()
            and path.name.startswith(prefix)
        ):
            return path

    return None


def same_file_size(
    path_a: Path,
    path_b: Path,
) -> bool:

    try:
        return (
            path_a.stat().st_size
            == path_b.stat().st_size
        )

    except Exception:
        return False


def import_audio_to_library(
    master: Dict,
    mik_item: Dict,
) -> Tuple[
    Optional[str],
    str,
]:

    existing = find_existing_library_file(
        master["SongID"]
    )

    location = clean_string(
        mik_value(
            mik_item["row"],
            "location",
        )
    )

    if existing:
        if (
            REMOVE_VERIFIED_DUPLICATE_SOURCE
            and location
        ):
            source = Path(location)

            if (
                source.exists()
                and same_file_size(
                    source,
                    existing,
                )
            ):
                try:
                    source.unlink()

                    return (
                        str(existing),
                        "DUPLICATE_SOURCE_REMOVED",
                    )

                except Exception:
                    pass

        return (
            str(existing),
            "ALREADY_IN_LIBRARY",
        )

    if not location:
        return None, "NO_LOCATION"

    source = Path(location)

    if not source.exists():
        return None, "SOURCE_NOT_FOUND"

    if not source.is_file():
        return None, "SOURCE_NOT_FOUND"

    if (
        source.suffix.lower()
        not in AUDIO_EXTENSIONS
    ):
        return None, "UNSUPPORTED_FILE"

    folder = (
        FLAMINGO_LIBRARY_DIR
        / get_library_bucket(
            master["SongID"]
        )
    )

    destination = (
        folder
        / build_library_filename(
            master["SongID"],
            master.get("Artist"),
            master.get("Title"),
            source.suffix,
        )
    )

    if not MOVE_AUDIO_FILES:
        return (
            str(destination),
            "DRY_RUN",
        )

    folder.mkdir(
        parents=True,
        exist_ok=True,
    )

    if destination.exists():
        return (
            str(destination),
            "ALREADY_IN_LIBRARY",
        )

    shutil.move(
        str(source),
        str(destination),
    )

    return (
        str(destination),
        "MOVED",
    )


# ============================================================
# DJ DATA FROM MIK
# ============================================================

def update_dj_from_mik(
    conn,
    master: Dict,
    mik_item: Dict,
    artist_details: Optional[Dict],
    library_path: Optional[str],
):
    row = mik_item["row"]

    musical_key = normalize_key(
        mik_value(
            row,
            "key",
        )
    )

    upsert_dj_track(
        conn,
        master["SongID"],
        {
            "title": master.get("Title"),
            "artist": master.get("Artist"),
            "popularity": master.get("Popularity"),
            "release_date": master.get("ReleaseDate"),
            "genre": first_value(
                master.get("Genre"),
                clean_string(
                    mik_value(
                        row,
                        "genre",
                    )
                ),
            ),
            "album": master.get("Album"),
            "spotify_url": master.get("SpotifyURL"),
            "tempo": valid_tempo(
                mik_value(
                    row,
                    "tempo",
                )
            ),
            "musical_key": musical_key,
            "camelot": key_to_camelot(
                musical_key
            ),
            "cue_points": clean_string(
                mik_value(
                    row,
                    "cue_points",
                )
            ),
            "energy": valid_energy(
                mik_value(
                    row,
                    "energy",
                )
            ),
            "overall_vol": parse_float(
                mik_value(
                    row,
                    "overall_volume",
                )
            ),
            "clipped_peaks": parse_int(
                mik_value(
                    row,
                    "clipped_peaks",
                )
            ),
            "folder": library_path,
            "country": (
                artist_details.get("country")
                if artist_details
                else None
            ),
            "date_added": clean_string(
                mik_value(
                    row,
                    "date_added",
                )
            ),
            "comments": clean_string(
                mik_value(
                    row,
                    "comment",
                )
            ),
        },
    )


# ============================================================
# REACT TRACK
# ============================================================

def build_react_track(
    master: Dict,
    dj_track: Dict,
    artist_details: Optional[Dict],
) -> Dict:

    duration_seconds = duration_to_seconds(
        master.get("Duration")
    )

    keywords = [
        item.strip()
        for item in re.split(
            r"[,;|]",
            str(
                dj_track.get("keywords")
                or ""
            ),
        )
        if item.strip()
    ]

    return {
        "id": str(master["SongID"]),
        "externalSongId": str(master["SongID"]),
        "title": master.get("Title"),
        "artist": master.get("Artist"),
        "album": master.get("Album"),
        "artworkUrl": master.get("CoverImage"),
        "durationSeconds": duration_seconds,
        "durationDisplay": duration_display(
            duration_seconds
        ),
        "releaseDate": master.get("ReleaseDate"),
        "genre": first_value(
            dj_track.get("genre"),
            master.get("Genre"),
        ),
        "country": first_value(
            dj_track.get("country"),
            (
                artist_details.get("country")
                if artist_details
                else None
            ),
        ),
        "spotifyPopularity": parse_int(
            master.get("Popularity")
        ),
        "spotifyUrl": master.get("SpotifyURL"),
        "tempo": dj_track.get("tempo"),
        "musicalKey": dj_track.get("musical_key"),
        "camelot": dj_track.get("camelot"),
        "energy": dj_track.get("energy"),
        "overallVolume": dj_track.get("overall_vol"),
        "cuePoints": dj_track.get("cue_points"),
        "clippedPeaks": dj_track.get("clipped_peaks"),
        "keywords": keywords,
        "comments": dj_track.get("comments"),
        "folder": dj_track.get("folder"),
        "dateAdded": dj_track.get("date_added"),
        "rating": None,
        "artistDetails": artist_details,
    }


# ============================================================
# EXISTING REACT PLAYLIST MERGE
# ============================================================

def load_existing_react_playlist() -> Dict:
    """
    Load the current FlamingoAppDJ playlist before writing a new batch.

    IMPORTANT:
    MIXNKEY batches are incremental.
    A new CSV may contain only 10, 50 or 100 new tracks.

    Therefore the current React JSON must NEVER be replaced by only
    the current batch.
    """
    if not REACT_OUTPUT_PATH.exists():
        return {
            "tracks": [],
        }

    try:
        data = json.loads(
            REACT_OUTPUT_PATH.read_text(
                encoding="utf-8"
            )
        )

        if isinstance(data, dict):
            return data

    except Exception as exc:
        print(
            f"WARNING: no pude leer React JSON existente: {exc}"
        )

    return {
        "tracks": [],
    }


def react_track_song_id(track: Dict) -> Optional[str]:
    """
    Canonical playlist identity.

    SongID must be UNIQUE inside one playlist.
    """
    value = (
        track.get("id")
        or track.get("externalSongId")
        or track.get("song_id")
        or track.get("SongID")
    )

    if value is None:
        return None

    return str(value).strip()


def merge_react_tracks_by_song_id(
    existing_tracks: List[Dict],
    new_tracks: List[Dict],
    valid_spotify_song_ids: Optional[set] = None,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Merge old React tracks + current MIXNKEY batch.

    STRICT RULE:
    Every track, including OLD React records, must still pass:
        BPM > 0
        Key exists
        Energy > 0
        Audio file exists

    Returns:
        merged_complete_tracks,
        removed_incomplete_existing_tracks
    """
    merged = {}
    removed_incomplete = []

    # Existing React tracks: revalidate them.
    for track in existing_tracks:
        song_id = react_track_song_id(track)

        if not song_id:
            continue

        if (
            valid_spotify_song_ids is not None
            and song_id not in valid_spotify_song_ids
        ):
            continue

        missing = validate_react_track_complete(track)

        if missing:
            removed_incomplete.append({
                "SongID": song_id,
                "Title": track.get("title"),
                "Artist": track.get("artist"),
                "Reason": ",".join(missing),
            })
            continue

        merged[song_id] = track

    # Current batch wins for duplicate SongIDs.
    for track in new_tracks:
        song_id = react_track_song_id(track)

        if not song_id:
            continue

        if (
            valid_spotify_song_ids is not None
            and song_id not in valid_spotify_song_ids
        ):
            continue

        missing = validate_react_track_complete(track)

        if missing:
            continue

        merged[song_id] = track

    return list(merged.values()), removed_incomplete


# ============================================================
# SAVE FINAL REACT JSON
# ============================================================

def save_react_json(
    playlist_metadata: Dict,
    tracks: List[Dict],
    excluded_tracks: List[Dict],
):
    """
    Incremental React save.

    `tracks` contains only tracks successfully completed by THIS run/batch.

    This function:
        - loads existing React playlist
        - merges by unique SongID
        - keeps old complete songs
        - replaces existing SongID with current newer data
        - adds new SongIDs
        - removes only songs no longer present in the source Spotify playlist
    """

    existing_payload = load_existing_react_playlist()

    existing_tracks = (
        existing_payload.get("tracks")
        or []
    )

    # Current Spotify source membership.
    try:
        _meta, source_tracks = load_source_playlist()

        valid_spotify_song_ids = {
            str(track.get("SongID")).strip()
            for track in source_tracks
            if track.get("SongID") is not None
        }

        spotify_order = {
            str(track.get("SongID")).strip():
                int(
                    track.get("Position")
                    or 999999
                )
            for track in source_tracks
            if track.get("SongID") is not None
        }

    except Exception:
        valid_spotify_song_ids = None
        spotify_order = {}

    (
        merged_tracks,
        removed_incomplete_existing,
    ) = merge_react_tracks_by_song_id(
        existing_tracks,
        tracks,
        valid_spotify_song_ids,
    )

    # Preserve Spotify playlist order where possible.
    merged_tracks.sort(
        key=lambda track:
            spotify_order.get(
                react_track_song_id(track),
                999999,
            )
    )

    payload = {
        "schemaVersion": 4,
        "playlistId": slugify(
            PLAYLIST_NAME
        ),
        "playlistName": PLAYLIST_NAME,
        "description": (
            "Incremental Flamingo DJ playlist. "
            "Existing complete tracks are preserved; "
            "current MIXNKEY batch is merged by unique SongID."
        ),
        "totalTracks": len(
            merged_tracks
        ),
        "batchCompletedTracks": len(
            tracks
        ),
        "excludedIncompleteTracks": len(
            excluded_tracks
        ),
        "generatedAt": time.strftime(
            "%Y-%m-%dT%H:%M:%S"
        ),
        "filters": {
            "genres_any": [],
            "genres_exclude": [],
            "popularity_min": None,
            "popularity_max": None,
            "release_date_from": None,
            "release_date_to": None,
            "artists_any": [],
            "title_contains_any": [],
            "keywords_any": [],
            "countries_any": [],
            "require_complete_track": True,
        },
        "sort": {
            "field": "spotify_playlist_order",
            "descending": False,
            "secondaryField": None,
            "secondaryDescending": False,
        },
        "tracks": merged_tracks,
        "source": {
            "catalogDatabase": "MASTER_CLEAN.db",
            "djDatabase": str(
                DJ_DB_PATH
            ),
            "spotifyPlaylistJson": str(
                SOURCE_PLAYLIST_JSON
            ),
            "mixedInKeyCsv": str(
                SOURCE_MIXNKEY_CSV
            ),
            "audioLibrary": str(
                FLAMINGO_LIBRARY_DIR
            ),
            "outputDirectory": str(
                REACT_OUTPUT_DIR
            ),
        },
    }

    REACT_OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    REACT_OUTPUT_PATH.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 72)
    print("REACT PLAYLIST MERGE")
    print("=" * 72)
    print(
        f"Existing React tracks : "
        f"{len(existing_tracks)}"
    )
    print(
        f"Old invalid removed   : "
        f"{len(removed_incomplete_existing)}"
    )
    print(
        f"Current batch complete: "
        f"{len(tracks)}"
    )
    print(
        f"Final unique SongIDs  : "
        f"{len(merged_tracks)}"
    )

    if removed_incomplete_existing:
        print()
        print("OLD REACT TRACKS REMOVED FOR INCOMPLETE DJ DATA:")

        for index, item in enumerate(
            removed_incomplete_existing,
            start=1,
        ):
            print(
                f"[{index}/{len(removed_incomplete_existing)}] "
                f"SongID={item.get('SongID')} | "
                f"{item.get('Artist')} - {item.get('Title')} | "
                f"{item.get('Reason')}"
            )




# ============================================================
# FINAL PLAYLIST REBUILD
# ============================================================

def rebuild_react_from_dj(
    playlist_metadata: Dict,
    source_tracks: List[Dict],
    exclude_incomplete: bool,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Very fast final pass:
        full Spotify playlist JSON
            + MASTER_CLEAN.db
            + DJ.db
            -> React JSON

    No MIK matching.
    No audio moving.
    No Spotify search.
    No MusicBrainz search.

    It only reads already-persisted data.
    """
    print()
    print("=" * 72)
    print("BUILDING FINAL REACT JSON FROM DJ.db")
    print("=" * 72)

    master_conn = get_master_connection()
    dj_conn = get_dj_connection()
    ensure_dj_schema(dj_conn)

    final_tracks = []
    incomplete_tracks = []

    try:
        total = len(source_tracks)

        for position, source_track in enumerate(source_tracks, start=1):
            song_id = source_track.get("SongID")

            master = load_master_track(
                master_conn,
                song_id,
            )

            if not master:
                incomplete_tracks.append({
                    "SongID": song_id,
                    "Title": source_track.get("Title"),
                    "Artist": source_track.get("Artist"),
                    "Reason": "MASTER_NOT_FOUND",
                })
                continue

            dj_track = load_dj_track(
                dj_conn,
                master["SongID"],
            )

            artist_details = get_primary_artist_details(
                master_conn,
                master["SongID"],
            )

            complete = dj_track_is_complete(
                dj_track
            )

            if not complete:
                missing = []

                if not dj_track:
                    missing.append("NO_DJ_RECORD")
                else:
                    if dj_track.get("tempo") is None:
                        missing.append("NO_BPM")

                    if is_empty(dj_track.get("musical_key")):
                        missing.append("NO_KEY")

                    if dj_track.get("energy") is None:
                        missing.append("NO_ENERGY")

                    folder = dj_track.get("folder")

                    if is_empty(folder):
                        missing.append("NO_AUDIO")
                    else:
                        try:
                            if not Path(str(folder)).exists():
                                missing.append("AUDIO_FILE_MISSING")
                        except Exception:
                            missing.append("AUDIO_FILE_MISSING")

                incomplete_tracks.append({
                    "SongID": master["SongID"],
                    "Title": master.get("Title"),
                    "Artist": master.get("Artist"),
                    "Reason": ",".join(missing) if missing else "INCOMPLETE",
                })

                if exclude_incomplete:
                    continue

            final_tracks.append(
                build_react_track(
                    master,
                    dj_track or {},
                    artist_details,
                )
            )

        # Preserve exact Spotify playlist order.
        source_order = {
            str(track.get("SongID")): int(
                track.get("Position")
                or 999999
            )
            for track in source_tracks
        }

        final_tracks.sort(
            key=lambda track: source_order.get(
                str(track.get("id")),
                999999,
            )
        )

        return final_tracks, incomplete_tracks

    finally:
        master_conn.close()
        dj_conn.close()



# ============================================================
# FINAL REACT ARTIST REFRESH
# ============================================================

def refresh_final_react_artist_data(
    tracks: List[Dict],
) -> List[Dict]:
    """
    Final pass after all Spotify/MusicBrainz artist enrichment is finished.

    This guarantees the JSON receives the newest:
        - Country
        - ArtistID
        - Spotify artist URL/ID/image
        - Genres
        - MusicBrainzID

    It does not redo MIK matching and does not move audio.
    """
    if not tracks:
        return tracks

    master_conn = get_master_connection()

    try:
        refreshed = []

        for track in tracks:
            try:
                song_id = int(
                    track.get("id")
                    or track.get("externalSongId")
                )
            except Exception:
                refreshed.append(track)
                continue

            artist_details = get_primary_artist_details(
                master_conn,
                song_id,
            )

            updated = dict(track)

            if artist_details:
                updated["artistDetails"] = artist_details

                if not is_empty(
                    artist_details.get("country")
                ):
                    updated["country"] = artist_details.get(
                        "country"
                    )

            refreshed.append(
                updated
            )

        return refreshed

    finally:
        master_conn.close()



# ============================================================
# NORMALIZED JSON OUTPUT
# ============================================================

CORE_TRACK_FIELDS = {
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


def _empty_catalog(schema_version: int = 6) -> Dict:
    return {
        "schemaVersion": schema_version,
        "updatedAt": None,
        "tracks": {},
    }


def _read_track_catalog(path: Path) -> Dict:
    if not path.exists():
        return _empty_catalog()

    try:
        data = json.loads(
            path.read_text(encoding="utf-8")
        )
        if (
            isinstance(data, dict)
            and isinstance(data.get("tracks"), dict)
        ):
            return data
    except Exception as exc:
        log(f"NORMALIZED CATALOG warning ({path.name}): {exc}")

    return _empty_catalog()


def split_track_for_v6(track: Dict) -> Tuple[Dict, Dict]:
    """
    Core = fields required for the default fast table.
    Extra = every other field, so migration does not discard metadata.
    """
    core = {}
    extra = {}

    for key, value in track.items():
        if key in CORE_TRACK_FIELDS:
            core[key] = value
        else:
            extra[key] = value

    song_id = react_track_song_id(track)
    if song_id:
        core["id"] = str(song_id)
        core["externalSongId"] = str(song_id)

    return core, extra


def load_normalized_v6_catalogs() -> Tuple[Dict, Dict]:
    core_catalog = _read_track_catalog(
        NORMALIZED_CORE_PATH
    )
    extra_catalog = _read_track_catalog(
        NORMALIZED_EXTRA_PATH
    )

    # First V6 run: seed from the existing V5 full catalog if present.
    if (
        not core_catalog.get("tracks")
        and not extra_catalog.get("tracks")
        and NORMALIZED_V5_CATALOG_PATH.exists()
    ):
        v5_catalog = _read_track_catalog(
            NORMALIZED_V5_CATALOG_PATH
        )
        for song_id, track in (
            v5_catalog.get("tracks") or {}
        ).items():
            if not isinstance(track, dict):
                continue
            core, extra = split_track_for_v6(track)
            core_catalog["tracks"][str(song_id)] = core
            extra_catalog["tracks"][str(song_id)] = extra

    return core_catalog, extra_catalog


def save_normalized_json(
    playlist_metadata: Dict,
) -> Tuple[int, int]:
    """
    Transition-safe V6 writer.

    Legacy playlist JSON remains untouched and continues to be generated.
    V6 additionally writes:
        normalized/catalog/tracks-core.json
        normalized/catalog/tracks-extra.json
        normalized/playlists/<PLAYLIST>.json

    Current playlist data wins for its SongID, preserving the behavior
    of the previous normalized writer.
    """
    if not REACT_OUTPUT_PATH.exists():
        raise FileNotFoundError(
            "Legacy React JSON was not created:\n"
            f"{REACT_OUTPUT_PATH}"
        )

    legacy_payload = json.loads(
        REACT_OUTPUT_PATH.read_text(
            encoding="utf-8"
        )
    )

    legacy_tracks = (
        legacy_payload.get("tracks")
        if isinstance(legacy_payload, dict)
        else None
    )

    if not isinstance(legacy_tracks, list):
        raise RuntimeError(
            "Legacy React JSON has no valid tracks list."
        )

    core_catalog, extra_catalog = (
        load_normalized_v6_catalogs()
    )

    core_tracks = core_catalog.get("tracks") or {}
    extra_tracks = extra_catalog.get("tracks") or {}

    ordered_track_ids = []
    seen_ids = set()

    for track in legacy_tracks:
        if not isinstance(track, dict):
            continue

        song_id = react_track_song_id(track)
        if not song_id or song_id in seen_ids:
            continue

        seen_ids.add(song_id)
        ordered_track_ids.append(song_id)

        core, extra = split_track_for_v6(track)

        # Current playlist data wins for this SongID.
        core_tracks[song_id] = core
        extra_tracks[song_id] = extra

    generated_at = time.strftime(
        "%Y-%m-%dT%H:%M:%S"
    )

    NORMALIZED_CATALOG_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )
    NORMALIZED_PLAYLIST_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    NORMALIZED_CORE_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 6,
                "catalogType": "core",
                "updatedAt": generated_at,
                "tracks": core_tracks,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    NORMALIZED_EXTRA_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 6,
                "catalogType": "extra",
                "updatedAt": generated_at,
                "tracks": extra_tracks,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    normalized_playlist_payload = {
        "schemaVersion": 6,
        "playlistId": slugify(PLAYLIST_NAME),
        "playlistName": PLAYLIST_NAME,
        "description": first_value(
            (
                legacy_payload.get("description")
                if isinstance(legacy_payload, dict)
                else None
            ),
            (
                playlist_metadata.get("description")
                if isinstance(playlist_metadata, dict)
                else None
            ),
            "",
        ),
        "totalTracks": len(ordered_track_ids),
        "generatedAt": generated_at,
        "trackIds": ordered_track_ids,
        "source": {
            "coreCatalog": str(NORMALIZED_CORE_PATH),
            "extraCatalog": str(NORMALIZED_EXTRA_PATH),
            "legacyPlaylist": str(REACT_OUTPUT_PATH),
            "catalogDatabase": "MASTER_CLEAN.db",
            "djDatabase": str(DJ_DB_PATH),
        },
    }

    NORMALIZED_PLAYLIST_PATH.write_text(
        json.dumps(
            normalized_playlist_payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 72)
    print("NORMALIZED JSON V6")
    print("=" * 72)
    print(f"Playlist trackIds      : {len(ordered_track_ids)}")
    print(f"Shared core tracks     : {len(core_tracks)}")
    print(f"Shared extra tracks    : {len(extra_tracks)}")
    print(f"Core catalog           : {NORMALIZED_CORE_PATH}")
    print(f"Extra catalog          : {NORMALIZED_EXTRA_PATH}")
    print(f"Playlist refs          : {NORMALIZED_PLAYLIST_PATH}")

    return (
        len(ordered_track_ids),
        len(core_tracks),
    )


# ============================================================
# STRICT FINAL REACT VALIDATION
# ============================================================

def validate_react_track_complete(track: Dict) -> List[str]:
    missing = []

    if valid_tempo(track.get("tempo")) is None:
        missing.append("NO_BPM")

    if is_empty(track.get("musicalKey")):
        missing.append("NO_KEY")

    if valid_energy(track.get("energy")) is None:
        missing.append("NO_ENERGY")

    folder = track.get("folder")

    if is_empty(folder):
        missing.append("NO_AUDIO")
    else:
        try:
            if not Path(str(folder)).exists():
                missing.append("AUDIO_FILE_MISSING")
        except Exception:
            missing.append("AUDIO_FILE_MISSING")

    return missing


# ============================================================
# MAIN
# ============================================================

def main():

    if not MASTER_DB_PATH.exists():
        raise FileNotFoundError(
            MASTER_DB_PATH
        )

    # FULL REBUILD:
    # Spotify complete playlist x complete MIK/Deezer CSV.
    # React receives ONLY their valid intersection.

    playlist_metadata, all_source_tracks = (
        load_source_playlist()
    )

    # Incremental rule:
    # process only PENDING tracks against the current MIK CSV.
    #
    # The full Spotify playlist is still used inside save_react_json()
    # for final membership/order.
    pending_metadata, pending_tracks = (
        load_pending_playlist()
    )

    source_tracks = (
        pending_tracks
        if pending_tracks
        else all_source_tracks
    )

    mik_catalog = load_mik_catalog()

    print()
    print("=" * 72)
    print("MIXNKEY INPUT MODE")
    print("=" * 72)
    print(
        f"Spotify full playlist : "
        f"{len(all_source_tracks)}"
    )
    print(
        f"Current pending batch : "
        f"{len(pending_tracks)}"
    )
    print(
        f"Tracks processed now  : "
        f"{len(source_tracks)}"
    )
    print(
        f"MIK CSV rows          : "
        f"{len(mik_catalog)}"
    )

    # ========================================================
    # OPTIONAL PRIMARY ARTIST ENRICHMENT DECISION
    # ========================================================

    artist_scan_conn = get_master_connection()

    try:
        missing_primary_artists = collect_missing_primary_artists(
            artist_scan_conn,
            source_tracks,
        )
    finally:
        artist_scan_conn.close()

    enrich_missing_artists = ask_artist_enrichment(
        missing_primary_artists
    )

    print()
    print("=" * 72)
    print("FULL SPOTIFY x MIXED IN KEY REBUILD")
    print("=" * 72)
    print(f"Spotify playlist tracks : {len(source_tracks)}")
    print(f"Mixed In Key CSV rows   : {len(mik_catalog)}")

    used_mik_rows = set()

    master_conn = get_master_connection()
    dj_conn = get_dj_connection()
    ensure_dj_schema(dj_conn)

    FLAMINGO_LIBRARY_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    final_output = []
    unmatched_spotify = []
    invalid_matches = []

    match_stats = {}
    audio_stats = {}
    matched_pairs = 0

    try:
        total = len(source_tracks)

        for position, source_track in enumerate(
            source_tracks,
            start=1,
        ):
            print()
            print("=" * 72)

            log(
                f"[{position}/{total}] "
                f"{source_track.get('Artist')} - "
                f"{source_track.get('Title')}"
            )

            master = load_master_track(
                master_conn,
                source_track.get("SongID"),
            )

            if not master:
                unmatched_spotify.append({
                    "SongID": source_track.get("SongID"),
                    "Title": source_track.get("Title"),
                    "Artist": source_track.get("Artist"),
                    "Reason": "MASTER_NOT_FOUND",
                })
                log("MASTER : NOT FOUND → EXCLUDED")
                continue

            (
                mik_item,
                match_type,
                best_score,
                second_score,
                reasons,
            ) = find_best_mik_match(
                source_track,
                mik_catalog,
                used_mik_rows,
            )

            if not mik_item:
                unmatched_spotify.append({
                    "SongID": master["SongID"],
                    "Title": master.get("Title"),
                    "Artist": master.get("Artist"),
                    "Reason": match_type,
                    "BestScore": best_score,
                    "SecondScore": second_score,
                })

                log(
                    f"MIK    : {match_type} "
                    f"| best={best_score} "
                    f"| second={second_score} "
                    f"→ EXCLUDED"
                )
                continue

            matched_pairs += 1

            match_stats[match_type] = (
                match_stats.get(match_type, 0)
                + 1
            )

            row = mik_item["row"]

            log(
                f"MIK    : MATCH | score={best_score} | {match_type}"
            )
            log(
                f"         Spotify: "
                f"{source_track.get('Artist')} - "
                f"{source_track.get('Title')}"
            )
            log(
                f"         Deezer : "
                f"{mik_value(row, 'artist')} - "
                f"{mik_value(row, 'title')}"
            )

            # =================================================
            # ARTIST / ARTIST_FEATURES MASTER
            # =================================================
            #
            # Primary artist = FIRST Spotify artist.
            # Country displayed in React always belongs to this artist.
            #
            # If the user said YES above:
            #   - new artist -> create new ArtistID
            #   - incomplete artist -> fill Spotify + MusicBrainz data
            #
            # Collaborator relations are still synchronized from Spotify.
            # =================================================

            try:
                if enrich_missing_artists:
                    (
                        needs_primary_enrichment,
                        _primary_input,
                        _existing_primary,
                        _primary_missing,
                    ) = primary_artist_needs_enrichment(
                        master_conn,
                        source_track,
                    )

                    if needs_primary_enrichment:
                        saved_primary = ensure_primary_artist_enriched(
                            master_conn,
                            source_track,
                        )

                        if saved_primary:
                            log(
                                f"ARTIST : ENRICHED | "
                                f"ArtistID={saved_primary.get('ArtistID')} "
                                f"| {saved_primary.get('Artist')} "
                                f"| Country={saved_primary.get('Country')}"
                            )

                # Keep SongArtists synchronized.
                if enrich_missing_artists:
                    ensure_song_artists(
                        master_conn,
                        source_track,
                        master,
                    )
                else:
                    sync_songartists_without_api(
                        master_conn,
                        source_track,
                        master,
                    )

            except Exception as exc:
                log(
                    f"ARTIST : WARNING | {exc}"
                )

            artist_details = (
                get_primary_artist_details(
                    master_conn,
                    master["SongID"],
                )
            )

            bpm = valid_tempo(
                mik_value(row, "tempo")
            )
            musical_key = normalize_key(
                mik_value(row, "key")
            )
            energy = valid_energy(
                mik_value(row, "energy")
            )

            missing_mik = []

            if bpm is None:
                missing_mik.append("NO_BPM")

            if is_empty(musical_key):
                missing_mik.append("NO_KEY")

            if energy is None:
                missing_mik.append("NO_ENERGY")

            if missing_mik:
                invalid_matches.append({
                    "SongID": master["SongID"],
                    "Title": master.get("Title"),
                    "Artist": master.get("Artist"),
                    "Reason": ",".join(missing_mik),
                })

                log(
                    "DATA   : INVALID | "
                    + ", ".join(missing_mik)
                    + " → EXCLUDED"
                )
                continue

            log(
                f"DATA   : BPM={bpm} "
                f"| Key={musical_key} "
                f"| Camelot={key_to_camelot(musical_key)} "
                f"| Energy={energy}"
            )

            library_path, audio_status = (
                import_audio_to_library(
                    master,
                    mik_item,
                )
            )

            audio_stats[audio_status] = (
                audio_stats.get(audio_status, 0)
                + 1
            )

            log(
                f"AUDIO  : {audio_status}"
            )

            if not library_path:
                invalid_matches.append({
                    "SongID": master["SongID"],
                    "Title": master.get("Title"),
                    "Artist": master.get("Artist"),
                    "Reason": audio_status,
                })
                continue

            update_dj_from_mik(
                dj_conn,
                master,
                mik_item,
                artist_details,
                library_path,
            )

            updated_dj = load_dj_track(
                dj_conn,
                master["SongID"],
            )

            if not updated_dj:
                invalid_matches.append({
                    "SongID": master["SongID"],
                    "Title": master.get("Title"),
                    "Artist": master.get("Artist"),
                    "Reason": "DJ_RECORD_NOT_CREATED",
                })
                continue

            react_track = build_react_track(
                master,
                updated_dj,
                artist_details,
            )

            final_missing = (
                validate_react_track_complete(
                    react_track
                )
            )

            if final_missing:
                invalid_matches.append({
                    "SongID": master["SongID"],
                    "Title": master.get("Title"),
                    "Artist": master.get("Artist"),
                    "Reason": ",".join(final_missing),
                })

                log(
                    "REACT  : EXCLUDED | "
                    + ", ".join(final_missing)
                )
                continue

            final_output.append(
                react_track
            )

            log(
                "REACT  : COMPLETE → INCLUDED"
            )

    finally:
        master_conn.close()
        dj_conn.close()

    unused_mik = [
        item
        for item in mik_catalog
        if item["index"] not in used_mik_rows
    ]

    source_order = {
        str(track.get("SongID")):
            int(
                track.get("Position")
                or 999999
            )
        for track in source_tracks
    }

    final_output.sort(
        key=lambda track:
            source_order.get(
                str(track.get("id")),
                999999,
            )
    )

    # ========================================================
    # FINAL ARTIST REFRESH
    # ========================================================
    #
    # All artist API writes are already committed at this point.
    # Re-read artistDetails/Country so the new information is present
    # in the JSON produced for FlamingoAppDJ.
    # ========================================================

    final_output = refresh_final_react_artist_data(
        final_output
    )

    # No question: incomplete/unmatched tracks NEVER enter React.
    all_excluded = (
        unmatched_spotify
        + invalid_matches
    )

    save_react_json(
        playlist_metadata,
        final_output,
        all_excluded,
    )


    # ========================================================
    # NEW NORMALIZED JSON V6
    # ========================================================
    #
    # Keep the legacy React JSON for the current app, but also create:
    #
    #   normalized/catalog/tracks-core.json + tracks-extra.json
    #       -> one shared track record per SongID
    #
    #   normalized/playlists/<PLAYLIST>.json
    #       -> only ordered trackIds
    #
    # This is the safe first migration step toward the lighter architecture.
    # ========================================================

    save_normalized_json(
        playlist_metadata
    )

    print()
    print("=" * 72)
    print("SPOTIFY TRACKS WITHOUT MIXED IN KEY MATCH")
    print("=" * 72)

    if not unmatched_spotify:
        print("Ninguno.")
    else:
        for index, track in enumerate(
            unmatched_spotify,
            start=1,
        ):
            print(
                f"[{index}/{len(unmatched_spotify)}] "
                f"SongID={track.get('SongID')} | "
                f"{track.get('Artist')} - "
                f"{track.get('Title')} | "
                f"{track.get('Reason')}"
            )

    print()
    print("=" * 72)
    print("MATCHED BUT EXCLUDED FOR INCOMPLETE DJ DATA")
    print("=" * 72)

    if not invalid_matches:
        print("Ninguno.")
    else:
        for index, track in enumerate(
            invalid_matches,
            start=1,
        ):
            print(
                f"[{index}/{len(invalid_matches)}] "
                f"SongID={track.get('SongID')} | "
                f"{track.get('Artist')} - "
                f"{track.get('Title')} | "
                f"{track.get('Reason')}"
            )

    print()
    print("=" * 72)
    print("MIXED IN KEY ROWS WITHOUT SPOTIFY MATCH")
    print("=" * 72)

    if not unused_mik:
        print("Ninguno.")
    else:
        for index, item in enumerate(
            unused_mik,
            start=1,
        ):
            row = item["row"]
            print(
                f"[{index}/{len(unused_mik)}] "
                f"{mik_value(row, 'artist')} - "
                f"{mik_value(row, 'title')}"
            )

    print()
    print("=" * 72)
    print("FINAL REACT VALIDATION")
    print("=" * 72)

    print(
        f"Spotify playlist       : {len(source_tracks)}"
    )
    print(
        f"Mixed In Key rows      : {len(mik_catalog)}"
    )
    print(
        f"Spotify <-> MIK matches: {matched_pairs}"
    )
    print(
        f"Spotify without MIK    : {len(unmatched_spotify)}"
    )
    print(
        f"MIK without Spotify    : {len(unused_mik)}"
    )
    print(
        f"Matched but incomplete : {len(invalid_matches)}"
    )
    print(
        f"FINAL REACT TRACKS     : {len(final_output)}"
    )

    print()
    print("MATCH TYPES:")

    for key, count in sorted(
        match_stats.items()
    ):
        print(
            f"  {key:<50} {count}"
        )

    print()
    print("AUDIO:")

    for key, count in sorted(
        audio_stats.items()
    ):
        print(
            f"  {key:<30} {count}"
        )

    print()
    print("JSON LEGACY (CURRENT REACT):")
    print(
        REACT_OUTPUT_PATH
    )

    print()
    print("JSON NORMALIZED CORE:")
    print(NORMALIZED_CORE_PATH)

    print()
    print("JSON NORMALIZED EXTRA:")
    print(NORMALIZED_EXTRA_PATH)

    print()
    print("JSON NORMALIZED PLAYLIST:")
    print(
        NORMALIZED_PLAYLIST_PATH
    )


if __name__ == "__main__":
    main()
