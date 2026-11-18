# -*- coding: utf-8 -*-
"""
SPOTIFY_PLAYLIST_TO_MASTER.py
\============================================================
FLAMINGO DJ - STEP 1 / INCREMENTAL SYNC
This script:
1) Reads the COMPLETE Spotify playlist.
2) Resolves/reuses SongID in MASTER_CLEAN.db.
3) Creates new Songs/TrackMetadata/SpotifyLinks only for unknown Spotify tracks.
4) Checks DJ.db to decide which tracks are already COMPLETE.
5) Writes:
       PLAYLIST_JSON/\<PLAYLIST_NAME>/\<PLAYLIST_NAME>.json
       PLAYLIST_JSON/\<PLAYLIST_NAME>/\<PLAYLIST_NAME>_PENDING.json
6) Creates or updates ONE Spotify work playlist:
       \<PLAYLIST_NAME> - PENDING
   containing ONLY tracks that need audio / Mixed In Key work.
You only edit:
    PLAYLIST_NAME
    SPOTIFY_PLAYLIST_ID
IMPORTANT
\--------
"New to the Spotify playlist" is NOT the same as "new to the DJ library".
If a SongID is already complete in DJ.db, it is skipped even if you just
added it to this Spotify playlist.
"""
import os
import re
import json
import time
import sqlite3
import unicodedata
import webbrowser
from pathlib import Path
from typing import Optional, Dict, List, Tuple
import requests
from dotenv import load_dotenv
from spotipy.oauth2 import SpotifyOAuth
# ============================================================
# CONFIG
# ============================================================
DB_ROOT = Path(r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES")
BASE_DIR = DB_ROOT / "_FLAMINGO - MASTER"

MASTER_DB_PATH = BASE_DIR / "MASTER_CLEAN.db"
DJ_DB_PATH = BASE_DIR / "DJ.db"

ENV_PATH = BASE_DIR / ".env"
REACT_PLAYLIST_DIR = (
    DB_ROOT / "FLAMINGOAPP_DJ_REACT" / "src" / "data" / "JSON" / "playlists"
)

# CHANGE ONLY THESE TWO
PLAYLIST_NAME = "LGTB"
SPOTIFY_PLAYLIST_ID = "6mPckdpDLbDNxuqcMPK7vr"
REACT_PLAYLIST_JSON_PATH = REACT_PLAYLIST_DIR / f"{PLAYLIST_NAME}.json"
PLAYLIST_DIR = BASE_DIR / "PLAYLIST_JSON" / PLAYLIST_NAME
OUTPUT_JSON_PATH = PLAYLIST_DIR / f"{PLAYLIST_NAME}.json"
PENDING_JSON_PATH = PLAYLIST_DIR / f"{PLAYLIST_NAME}_PENDING.json"
PENDING_PLAYLIST_PREFIX = f"{PLAYLIST_NAME} - NEW"
PENDING_PLAYLIST_PUBLIC = False
SPOTIFY_TOKEN_CACHE = BASE_DIR / ".spotify_playlist_token_cache"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_SCOPE = (
    "playlist-read-private "
    "playlist-modify-private "
    "playlist-modify-public"
)
REQUEST_TIMEOUT = 30
MAX_RETRIES = 6
# DJ completeness rule.
# We deliberately do NOT require CuePoints/OverallVol.
REQUIRE_BPM = True
REQUIRE_KEY = True
REQUIRE_ENERGY = True
REQUIRE_AUDIO_FILE = True
# ============================================================
# HELPERS
# ============================================================
def log(message: str):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)
def is_empty(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())
def normalize_text(value) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip()
def extract_track_id_from_url(url: Optional[str]) -> Optional[str]:
    """
    Extract Spotify Track ID from:
        https://open.spotify.com/track/<TRACK_ID>
    """
    if not url:
        return None

    match = re.search(
        r"open\.spotify\.com/track/([A-Za-z0-9]+)",
        str(url),
    )

    return match.group(1) if match else None

def validate_paths():
    if not MASTER_DB_PATH.exists():
        raise FileNotFoundError(f"MASTER_CLEAN.db no existe:\n{MASTER_DB_PATH}")
    if not ENV_PATH.exists():
        raise FileNotFoundError(f".env no existe:\n{ENV_PATH}")
    PLAYLIST_DIR.mkdir(parents=True, exist_ok=True)
# ============================================================
# SPOTIFY AUTH
# ============================================================
def load_environment():
    load_dotenv(ENV_PATH, override=False)
    client_id = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("SPOTIFY_REDIRECT_URI", "").strip()
    if not all([client_id, client_secret, redirect_uri]):
        raise RuntimeError(
            "Faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / "
            "SPOTIFY_REDIRECT_URI en .env"
        )
    return client_id, client_secret, redirect_uri
def get_spotify_access_token() -> str:
    client_id, client_secret, redirect_uri = load_environment()
    auth = SpotifyOAuth(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scope=SPOTIFY_SCOPE,
        cache_path=str(SPOTIFY_TOKEN_CACHE),
        open_browser=True,
    )
    token_info = auth.get_cached_token()
    if token_info and auth.is_token_expired(token_info):
        refresh = token_info.get("refresh_token")
        token_info = auth.refresh_access_token(refresh) if refresh else None
    if not token_info:
        authorize_url = auth.get_authorize_url()
        print("\nAUTORIZACIÓN SPOTIFY")
        print(authorize_url)
        webbrowser.open(authorize_url)
        callback = input(
            "\nDespués de autorizar, pega la URL COMPLETA del callback:\n> "
        ).strip()
        code = auth.parse_response_code(callback)
        if not code:
            raise RuntimeError(
                "Authorization code inválido. Pega la URL del callback, "
                "no la URL accounts.spotify.com/authorize."
            )
        token_info = auth.get_access_token(
            code=code,
            as_dict=True,
            check_cache=False,
        )
    token = (token_info or {}).get("access_token")
    if not token:
        raise RuntimeError("Spotify no entregó access_token.")
    return token
# ============================================================
# SPOTIFY HTTP
# ============================================================
def spotify_request(
    token: str,
    method: str,
    endpoint_or_url: str,
    *,
    params=None,
    json_body=None,
    expected=(200, 201),
):
    url = (
        endpoint_or_url
        if endpoint_or_url.startswith("http")
        else f"{SPOTIFY_API_BASE}/{endpoint_or_url.lstrip('/')}"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        response = requests.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code in expected:
            if not response.content:
                return {}
            try:
                return response.json()
            except Exception:
                return {}
        if response.status_code == 429:
            wait = int(response.headers.get("Retry-After", "5"))
            log(f"Spotify rate limit. Esperando {wait}s...")
            time.sleep(wait + 1)
            continue
        if attempt == MAX_RETRIES:
            raise RuntimeError(
                f"Spotify HTTP {response.status_code}\n"
                f"{response.text[:1000]}"
            )
        time.sleep(min(2 ** attempt, 15))
    raise RuntimeError("Spotify request failed.")
def spotify_get(token, endpoint_or_url, params=None):
    return spotify_request(
        token,
        "GET",
        endpoint_or_url,
        params=params,
        expected=(200,),
    )
# ============================================================
# SOURCE PLAYLIST
# ============================================================
def get_playlist_metadata(token: str) -> Dict:
    return spotify_get(token, f"playlists/{SPOTIFY_PLAYLIST_ID}")
def get_playlist_tracks(token: str) -> List[Dict]:
    url = f"{SPOTIFY_API_BASE}/playlists/{SPOTIFY_PLAYLIST_ID}/items"
    params = {
        "limit": 50,
        "offset": 0,
        "additional_types": "track",
    }
    result = []
    while url:
        data = spotify_get(token, url, params=params)
        params = None
        for item in data.get("items", []):
            track = item.get("item") or item.get("track")
            if not track:
                continue
            if track.get("type") != "track":
                continue
            if item.get("is_local"):
                continue
            track_id = track.get("id")
            if not track_id:
                continue
            album = track.get("album") or {}
            artists = []
            for artist in track.get("artists") or []:
                if not artist.get("name"):
                    continue
                artists.append({
                    "id": artist.get("id"),
                    "name": artist.get("name"),
                    "uri": artist.get("uri"),
                    "external_urls": artist.get("external_urls") or {},
                })
            images = album.get("images") or []
            result.append({
                "SpotifyTrackID": track_id,
                "SpotifyURI": track.get("uri") or f"spotify:track:{track_id}",
                "SpotifyURL": (
                    (track.get("external_urls") or {}).get("spotify")
                    or f"https://open.spotify.com/track/{track_id}"
                ),
                "SpotifyArtists": artists,
                "Title": track.get("name") or "",
                "Artist": ", ".join(a["name"] for a in artists),
                "Album": album.get("name") or "",
                "Duration": track.get("duration_ms"),
                "CoverImage": (
                    images[0].get("url")
                    if images
                    else None
                ),
                "Popularity": track.get("popularity"),
                "ReleaseDate": album.get("release_date") or "",
                "Genre": None,
                "PlaylistAddedAt": item.get("added_at"),
                "Position": len(result) + 1,
            })
        url = data.get("next")
    return result
# ============================================================
# MASTER_CLEAN.db
# ============================================================
def get_master_connection():
    conn = sqlite3.connect(MASTER_DB_PATH, timeout=60)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=60000")
    return conn
def table_exists(conn, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone() is not None
def get_columns(conn, table: str) -> List[str]:
    return [
        row["name"]
        for row in conn.execute(f'PRAGMA table_info("{table}")')
    ]
def ensure_master_schema(conn):
    for table in ["Songs", "TrackMetadata", "SpotifyLinks"]:
        if not table_exists(conn, table):
            raise RuntimeError(f"Falta tabla MASTER: {table}")
    spotify_cols = {
        col.lower(): col
        for col in get_columns(conn, "SpotifyLinks")
    }
    if "spotifytrackid" not in spotify_cols:
        conn.execute(
            "ALTER TABLE SpotifyLinks ADD COLUMN SpotifyTrackID TEXT"
        )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_spotifylinks_trackid "
        "ON SpotifyLinks(SpotifyTrackID)"
    )
    conn.commit()
def insert_supported(conn, table: str, values: Dict):
    cols = {
        col.lower(): col
        for col in get_columns(conn, table)
    }
    data = {}
    for logical_name, value in values.items():
        actual = cols.get(logical_name.lower())
        if actual:
            data[actual] = value
    if not data:
        raise RuntimeError(f"No hay columnas compatibles para {table}")
    names = ", ".join(f'"{name}"' for name in data)
    placeholders = ", ".join("?" for _ in data)
    conn.execute(
        f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})',
        tuple(data.values()),
    )
def update_supported_missing(conn, table: str, song_id: int, values: Dict):
    cols = {
        col.lower(): col
        for col in get_columns(conn, table)
    }
    song_id_col = cols.get("songid")
    if not song_id_col:
        return
    row = conn.execute(
        f'SELECT * FROM "{table}" WHERE "{song_id_col}"=? LIMIT 1',
        (song_id,),
    ).fetchone()
    if not row:
        insert_supported(
            conn,
            table,
            {"SongID": song_id, **values},
        )
        return
    existing = dict(row)
    updates = []
    params = []
    for logical_name, value in values.items():
        actual = cols.get(logical_name.lower())
        if not actual or is_empty(value):
            continue
        current = existing.get(actual)
        if is_empty(current):
            updates.append(f'"{actual}"=?')
            params.append(value)
    if updates:
        params.append(song_id)
        conn.execute(
            f'UPDATE "{table}" '
            f'SET {", ".join(updates)} '
            f'WHERE "{song_id_col}"=?',
            params,
        )
def find_song(
    conn,
    spotify_track_id: str,
    spotify_url: str,
) -> Tuple[Optional[int], Optional[str]]:
    row = conn.execute(
        """
        SELECT SongID
        FROM SpotifyLinks
        WHERE SpotifyTrackID=?
        LIMIT 1
        """,
        (spotify_track_id,),
    ).fetchone()
    if row:
        return int(row["SongID"]), "SPOTIFY_TRACK_ID"
    row = conn.execute(
        """
        SELECT SongID
        FROM SpotifyLinks
        WHERE Spotify_URL=?
        LIMIT 1
        """,
        (spotify_url,),
    ).fetchone()
    if row:
        song_id = int(row["SongID"])
        conn.execute(
            """
            UPDATE SpotifyLinks
            SET SpotifyTrackID=
                CASE
                    WHEN SpotifyTrackID IS NULL
                      OR TRIM(SpotifyTrackID)=''
                    THEN ?
                    ELSE SpotifyTrackID
                END
            WHERE SongID=?
            """,
            (spotify_track_id, song_id),
        )
        conn.commit()
        return song_id, "SPOTIFY_URL"
    return None, None
def get_next_song_id(conn) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(MAX(CAST(SongID AS INTEGER)),0)
        FROM Songs
        """
    ).fetchone()
    return int(row[0] or 0) + 1
def create_new_song(conn, track: Dict) -> int:
    song_id = get_next_song_id(conn)
    log(f"Creando SongID {song_id}")
    conn.execute("BEGIN IMMEDIATE")
    try:
        insert_supported(
            conn,
            "Songs",
            {
                "SongID": song_id,
                "Title": track["Title"],
                "Artist": track["Artist"],
                "NormalizedTitle": normalize_text(track["Title"]),
                "NormalizedArtist": normalize_text(track["Artist"]),
            },
        )
        insert_supported(
            conn,
            "TrackMetadata",
            {
                "SongID": song_id,
                "Album": track.get("Album"),
                "Duration": track.get("Duration"),
                "CoverImage": track.get("CoverImage"),
                "Popularity": track.get("Popularity"),
                "ReleaseDate": track.get("ReleaseDate"),
                "Genre": track.get("Genre"),
            },
        )
        insert_supported(
            conn,
            "SpotifyLinks",
            {
                "SongID": song_id,
                "Spotify_URL": track.get("SpotifyURL"),
                "SpotifyTrackID": track.get("SpotifyTrackID"),
            },
        )
        conn.commit()
        return song_id
    except Exception:
        conn.rollback()
        raise
def update_existing_song(conn, song_id: int, track: Dict):
    update_supported_missing(
        conn,
        "TrackMetadata",
        song_id,
        {
            "Album": track.get("Album"),
            "Duration": track.get("Duration"),
            "CoverImage": track.get("CoverImage"),
            "Popularity": track.get("Popularity"),
            "ReleaseDate": track.get("ReleaseDate"),
            "Genre": track.get("Genre"),
        },
    )
    update_supported_missing(
        conn,
        "SpotifyLinks",
        song_id,
        {
            "Spotify_URL": track.get("SpotifyURL"),
            "SpotifyTrackID": track.get("SpotifyTrackID"),
        },
    )
    conn.commit()
# ============================================================
# DJ.db READ-ONLY STATUS CHECK
# ============================================================
def get_dj_connection():
    if not DJ_DB_PATH.exists():
        return None
    conn = sqlite3.connect(DJ_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
def load_dj_track(conn, song_id: int) -> Optional[Dict]:
    if conn is None:
        return None
    if not table_exists(conn, "tracks"):
        return None
    cols = {
        str(row[1]).lower()
        for row in conn.execute('PRAGMA table_info("tracks")')
    }
    if "song_id" not in cols:
        return None
    row = conn.execute(
        "SELECT * FROM tracks WHERE song_id=? LIMIT 1",
        (int(song_id),),
    ).fetchone()
    return dict(row) if row else None
def classify_dj_track(
    dj_track: Optional[Dict],
    *,
    is_new_to_playlist: bool,
) -> Tuple[str, List[str]]:
    reasons = []
    if dj_track is None:
        reasons.append("NO_DJ_RECORD")
        if is_new_to_playlist:
            reasons.insert(0, "NEW")
        return "NEEDS_MIK", reasons
    if REQUIRE_BPM and dj_track.get("tempo") is None:
        reasons.append("NO_BPM")
    if REQUIRE_KEY and is_empty(dj_track.get("musical_key")):
        reasons.append("NO_KEY")
    if REQUIRE_ENERGY and dj_track.get("energy") is None:
        reasons.append("NO_ENERGY")
    if REQUIRE_AUDIO_FILE:
        folder = dj_track.get("folder")
        if is_empty(folder):
            reasons.append("NO_AUDIO")
        else:
            try:
                if not Path(str(folder)).exists():
                    reasons.append("AUDIO_FILE_MISSING")
            except Exception:
                reasons.append("AUDIO_FILE_MISSING")
    if reasons:
        if is_new_to_playlist:
            reasons.insert(0, "NEW")
        return "NEEDS_MIK", reasons
    return "COMPLETE", []
# ============================================================
# DJ.db BASE SCHEMA / UPSERT
# ============================================================

DJ_BASE_COLUMNS = {
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


def ensure_dj_schema_for_base(conn):
    """
    Ensure DJ.db exists with all columns required by the DJ pipeline.

    Spotify only writes base/catalog metadata here.
    MIXNKEY later fills:
        BPM
        Key
        Camelot
        Energy
        CuePoints
        OverallVolume
        ClippedPeaks
        Folder/audio
        Country
        Comments
    """
    if conn is None:
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tracks (
            song_id INTEGER,
            title TEXT,
            artist TEXT
        )
        """
    )

    existing_columns = {
        str(row[1]).lower(): str(row[1])
        for row in conn.execute(
            'PRAGMA table_info("tracks")'
        )
    }

    for name, sql_type in DJ_BASE_COLUMNS.items():
        if name.lower() not in existing_columns:
            conn.execute(
                f'ALTER TABLE tracks '
                f'ADD COLUMN "{name}" {sql_type}'
            )

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_dj_tracks_song_id
        ON tracks(song_id)
        """
    )

    conn.commit()


def upsert_dj_base_track(
    conn,
    song_id: int,
    track: Dict,
):
    """
    Insert/update the SongID base record in DJ.db.

    IMPORTANT:
    This function NEVER overwrites Mixed In Key fields.
    """
    if conn is None:
        return

    ensure_dj_schema_for_base(
        conn
    )

    existing = conn.execute(
        """
        SELECT rowid
        FROM tracks
        WHERE song_id=?
        LIMIT 1
        """,
        (int(song_id),),
    ).fetchone()

    title = track.get("Title")
    artist = track.get("Artist")
    popularity = track.get("Popularity")
    release_date = track.get("ReleaseDate")
    genre = track.get("Genre")
    album = track.get("Album")
    spotify_url = track.get("SpotifyURL")

    if existing:
        conn.execute(
            """
            UPDATE tracks
            SET title=?,
                artist=?,
                popularity=?,
                release_date=?,
                genre=COALESCE(?, genre),
                album=?,
                spotify_url=?
            WHERE song_id=?
            """,
            (
                title,
                artist,
                popularity,
                release_date,
                genre,
                album,
                spotify_url,
                int(song_id),
            ),
        )

    else:
        conn.execute(
            """
            INSERT INTO tracks (
                song_id,
                title,
                artist,
                popularity,
                release_date,
                genre,
                album,
                spotify_url
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(song_id),
                title,
                artist,
                popularity,
                release_date,
                genre,
                album,
                spotify_url,
            ),
        )

    conn.commit()


# ============================================================
# PREVIOUS PLAYLIST STATE
# ============================================================
def load_previous_playlist_json() -> Dict:
    if not OUTPUT_JSON_PATH.exists():
        return {}
    try:
        return json.loads(
            OUTPUT_JSON_PATH.read_text(encoding="utf-8")
        )
    except Exception:
        return {}
def previous_spotify_track_ids(previous: Dict) -> set:
    return {
        str(track.get("SpotifyTrackID"))
        for track in previous.get("tracks", [])
        if track.get("SpotifyTrackID")
    }
# ============================================================
# FINAL REACT PLAYLIST STATE
# ============================================================
def load_react_playlist_json() -> Dict:
    if not REACT_PLAYLIST_JSON_PATH.exists():
        log("REACT : JSON final no existe; todos serán candidatos PENDING.")
        return {}
    try:
        data = json.loads(REACT_PLAYLIST_JSON_PATH.read_text(encoding="utf-8"))
        log(f"REACT : cargado {REACT_PLAYLIST_JSON_PATH}")
        return data
    except Exception as exc:
        log(f"REACT : error leyendo JSON ({exc}); se usará vacío.")
        return {}

def react_completed_song_ids(react_json: Dict) -> set:
    completed = set()
    for track in react_json.get("tracks", []) or []:
        value = (
            track.get("id")
            or track.get("song_id")
            or track.get("SongID")
            or track.get("externalSongId")
        )
        if value is not None:
            completed.add(str(value).strip())
    return completed

def react_completed_spotify_track_ids(react_json: Dict) -> set:
    completed = set()
    for track in react_json.get("tracks", []) or []:
        spotify_url = (
            track.get("spotifyUrl")
            or track.get("spotify_url")
            or track.get("SpotifyURL")
        )
        track_id = extract_track_id_from_url(spotify_url)
        if track_id:
            completed.add(track_id)
    return completed

def make_new_batch_playlist_name() -> str:
    return f"{PENDING_PLAYLIST_PREFIX} - {time.strftime('%Y%m%d-%H%M%S')}"

# ============================================================
# PENDING SPOTIFY PLAYLIST
# ============================================================
def create_pending_playlist(token: str, playlist_name: str) -> Dict:
    return spotify_request(
        token,
        "POST",
        "me/playlists",
        json_body={
            "name": playlist_name,
            "public": PENDING_PLAYLIST_PUBLIC,
            "collaborative": False,
            "description": (
                "Flamingo DJ temporary NEW batch. "
                "Tracks not yet completed in the final React playlist."
            ),
        },
        expected=(201,),
    )

def add_pending_playlist_items(token: str, playlist_id: str, uris: List[str]):
    for start in range(0, len(uris), 100):
        chunk = uris[start:start + 100]
        if chunk:
            spotify_request(
                token,
                "POST",
                f"playlists/{playlist_id}/items",
                json_body={"uris": chunk},
                expected=(200, 201),
            )

def sync_pending_spotify_playlist(
    token: str,
    pending_tracks: List[Dict],
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    print()
    print("=" * 72)
    print("NEW SPOTIFY WORK PLAYLIST")
    print("=" * 72)
    print(f"Tracks pendientes : {len(pending_tracks)}")

    if not pending_tracks:
        print("No hay pendientes; no se creará una playlist vacía.")
        return None, None, None

    playlist_name = make_new_batch_playlist_name()
    print(f"Nueva playlist    : {playlist_name}")

    answer = input(
        "\n¿Crear una NUEVA playlist Spotify con estos tracks? [S/N]: "
    ).strip().lower()

    if answer not in {"s", "si", "sí", "y", "yes"}:
        print("No se creó playlist Spotify.")
        return None, None, None

    playlist = create_pending_playlist(token, playlist_name)
    playlist_id = playlist.get("id")
    if not playlist_id:
        raise RuntimeError("Spotify no devolvió ID para la nueva playlist.")

    playlist_url = (
        (playlist.get("external_urls") or {}).get("spotify")
        or f"https://open.spotify.com/playlist/{playlist_id}"
    )
    uris = [
        track["SpotifyURI"]
        for track in pending_tracks
        if track.get("SpotifyURI")
    ]
    add_pending_playlist_items(token, playlist_id, uris)

    print()
    print("SPOTIFY NEW BATCH CREATED")
    print(f"Name   : {playlist_name}")
    print(f"ID     : {playlist_id}")
    print(f"Tracks : {len(uris)}")
    print(f"URL    : {playlist_url}")
    return playlist_id, playlist_name, playlist_url

# ============================================================
# PROCESS
# ============================================================
def process_tracks(
    spotify_tracks: List[Dict],
    previous: Dict,
    react_json: Dict,
) -> Tuple[List[Dict], List[Dict], Dict]:

    master_conn = get_master_connection()
    ensure_master_schema(
        master_conn
    )

    # Create/open DJ.db.
    if DJ_DB_PATH.exists():
        dj_conn = get_dj_connection()
    else:
        DJ_DB_PATH.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        dj_conn = sqlite3.connect(
            DJ_DB_PATH,
            timeout=60,
        )
        dj_conn.row_factory = sqlite3.Row

    ensure_dj_schema_for_base(
        dj_conn
    )

    old_track_ids = previous_spotify_track_ids(
        previous
    )

    react_song_ids = react_completed_song_ids(
        react_json
    )

    react_spotify_ids = (
        react_completed_spotify_track_ids(
            react_json
        )
    )

    full_tracks = []
    pending_tracks = []

    summary = {
        "master_found": 0,
        "master_new": 0,
        "dj_base_upsert": 0,
        "dj_complete_diagnostic": 0,
        "dj_incomplete_diagnostic": 0,
        "react_complete": 0,
        "pending": 0,
        "new_to_playlist": 0,
        "errors": 0,
    }

    try:
        total = len(
            spotify_tracks
        )

        for index, track in enumerate(
            spotify_tracks,
            start=1,
        ):
            print()
            print("-" * 72)

            log(
                f"[{index}/{total}] "
                f"{track['Artist']} - {track['Title']}"
            )

            try:
                # =================================================
                # MASTER_CLEAN.db
                # =================================================

                song_id, match_source = find_song(
                    master_conn,
                    track["SpotifyTrackID"],
                    track["SpotifyURL"],
                )

                if song_id is None:
                    song_id = create_new_song(
                        master_conn,
                        track,
                    )

                    summary["master_new"] += 1

                    log(
                        f"MASTER : NEW | SongID={song_id}"
                    )

                else:
                    update_existing_song(
                        master_conn,
                        song_id,
                        track,
                    )

                    summary["master_found"] += 1

                    log(
                        f"MASTER : FOUND | "
                        f"SongID={song_id} | {match_source}"
                    )

                # =================================================
                # DJ.db BASE ROW
                # =================================================

                upsert_dj_base_track(
                    dj_conn,
                    song_id,
                    track,
                )

                summary["dj_base_upsert"] += 1

                log(
                    f"DJ     : BASE UPSERT | "
                    f"SongID={song_id}"
                )

                # =================================================
                # Previous Spotify source state
                # =================================================

                is_new_to_playlist = (
                    track["SpotifyTrackID"]
                    not in old_track_ids
                )

                if is_new_to_playlist:
                    summary["new_to_playlist"] += 1

                # =================================================
                # DJ diagnostic state
                # =================================================

                dj_track = load_dj_track(
                    dj_conn,
                    song_id,
                )

                (
                    dj_status,
                    dj_reasons,
                ) = classify_dj_track(
                    dj_track,
                    is_new_to_playlist=
                        is_new_to_playlist,
                )

                if dj_status == "COMPLETE":
                    summary[
                        "dj_complete_diagnostic"
                    ] += 1
                else:
                    summary[
                        "dj_incomplete_diagnostic"
                    ] += 1

                # =================================================
                # AUTHORITATIVE PENDING DECISION = REACT
                # =================================================
                #
                # SongID is primary.
                # SpotifyTrackID via React spotifyUrl is fallback.
                #
                # This solves the case where:
                #   MASTER already has SongID
                #   DJ.db already has a skeleton row
                #   BUT the track never reached Deezer/MIK/React.
                # =================================================

                in_react = (
                    str(song_id) in react_song_ids
                    or (
                        track["SpotifyTrackID"]
                        in react_spotify_ids
                    )
                )

                if in_react:
                    status = "COMPLETE_REACT"
                    reasons = []

                    summary["react_complete"] += 1

                    log(
                        "REACT  : COMPLETE → "
                        "SKIP DOWNLOAD / SKIP MIK"
                    )

                else:
                    status = "NEEDS_MIK"

                    reasons = [
                        "NOT_IN_REACT",
                    ]

                    # Preserve diagnostic reasons so PENDING.json is useful.
                    for reason in dj_reasons:
                        if reason not in reasons:
                            reasons.append(
                                reason
                            )

                    if (
                        is_new_to_playlist
                        and "NEW" not in reasons
                    ):
                        reasons.insert(
                            0,
                            "NEW",
                        )

                    summary["pending"] += 1

                    log(
                        "REACT  : NOT FOUND → "
                        "PENDING FOR DEEZER / MIK"
                    )

                    if dj_reasons:
                        log(
                            "DJ     : "
                            + ", ".join(
                                dj_reasons
                            )
                        )

                track_output = {
                    "SongID": song_id,
                    "Title": track["Title"],
                    "Artist": track["Artist"],
                    "Position": track["Position"],
                    "PlaylistAddedAt":
                        track.get(
                            "PlaylistAddedAt"
                        ),
                    "SpotifyTrackID":
                        track[
                            "SpotifyTrackID"
                        ],
                    "SpotifyURI":
                        track[
                            "SpotifyURI"
                        ],
                    "SpotifyURL":
                        track[
                            "SpotifyURL"
                        ],
                    "SpotifyArtists":
                        track[
                            "SpotifyArtists"
                        ],
                    "Status": status,
                    "DJStatus": dj_status,
                    "DJReasons": dj_reasons,
                    "PendingReasons": reasons,
                }

                full_tracks.append(
                    track_output
                )

                if not in_react:
                    pending_tracks.append(
                        track_output
                    )

            except Exception as exc:
                summary["errors"] += 1

                log(
                    f"ERROR  : {exc}"
                )

        return (
            full_tracks,
            pending_tracks,
            summary,
        )

    finally:
        master_conn.close()

        if dj_conn is not None:
            dj_conn.close()


# ============================================================
# JSON OUTPUT
# ============================================================
def save_json_outputs(
    playlist_meta: Dict,
    full_tracks: List[Dict],
    pending_tracks: List[Dict],
    pending_playlist_id: Optional[str],
    pending_playlist_name: Optional[str],
    pending_playlist_url: Optional[str],
    summary: Dict,
):
    generated_at = time.strftime("%Y-%m-%dT%H:%M:%S")

    full_payload = {
        "schemaVersion": 4,
        "playlistName": PLAYLIST_NAME,
        "spotifyPlaylistId": SPOTIFY_PLAYLIST_ID,
        "spotifyPlaylistName": playlist_meta.get("name"),
        "spotifySnapshotId": playlist_meta.get("snapshot_id"),
        "pendingSpotifyPlaylistName": pending_playlist_name,
        "pendingSpotifyPlaylistId": pending_playlist_id,
        "pendingSpotifyPlaylistURL": pending_playlist_url,
        "pendingRule": "Spotify playlist MINUS final React playlist by SongID",
        "totalTracks": len(full_tracks),
        "completeTracks": summary["react_complete"],
        "pendingTracks": len(pending_tracks),
        "generatedAt": generated_at,
        "tracks": full_tracks,
    }

    pending_payload = {
        "schemaVersion": 2,
        "playlistName": PLAYLIST_NAME,
        "sourceSpotifyPlaylistId": SPOTIFY_PLAYLIST_ID,
        "pendingSpotifyPlaylistName": pending_playlist_name,
        "pendingSpotifyPlaylistId": pending_playlist_id,
        "pendingSpotifyPlaylistURL": pending_playlist_url,
        "pendingRule": "Spotify playlist MINUS final React playlist by SongID",
        "totalPlaylistTracks": len(full_tracks),
        "totalPending": len(pending_tracks),
        "generatedAt": generated_at,
        "tracks": pending_tracks,
    }

    OUTPUT_JSON_PATH.write_text(
        json.dumps(full_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    PENDING_JSON_PATH.write_text(
        json.dumps(pending_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

# ============================================================
# MAIN
# ============================================================
def main():
    validate_paths()
    previous = load_previous_playlist_json()
    react_json = load_react_playlist_json()

    token = get_spotify_access_token()
    playlist_meta = get_playlist_metadata(token)
    spotify_tracks = get_playlist_tracks(token)

    old_snapshot = previous.get("spotifySnapshotId")
    new_snapshot = playlist_meta.get("snapshot_id")
    react_ids = react_completed_song_ids(react_json)

    print()
    print("=" * 72)
    print("FLAMINGO DJ - SPOTIFY -> REACT DELTA SYNC")
    print("=" * 72)
    print(f"Playlist              : {PLAYLIST_NAME}")
    print(f"Spotify Playlist ID   : {SPOTIFY_PLAYLIST_ID}")
    print(f"Spotify tracks        : {len(spotify_tracks)}")
    print(f"React completed IDs   : {len(react_ids)}")
    print(f"React JSON            : {REACT_PLAYLIST_JSON_PATH}")
    print(f"Old snapshot          : {old_snapshot}")
    print(f"Current snapshot      : {new_snapshot}")
    print(
        "Spotify playlist diff : "
        + ("CHANGED" if old_snapshot != new_snapshot else "UNCHANGED")
    )

    full_tracks, pending_tracks, summary = process_tracks(
        spotify_tracks,
        previous,
        react_json,
    )

    (
        pending_playlist_id,
        pending_playlist_name,
        pending_playlist_url,
    ) = sync_pending_spotify_playlist(token, pending_tracks)

    save_json_outputs(
        playlist_meta,
        full_tracks,
        pending_tracks,
        pending_playlist_id,
        pending_playlist_name,
        pending_playlist_url,
        summary,
    )

    print()
    print("=" * 72)
    print("RESULTADO")
    print("=" * 72)
    print(f"Tracks Spotify          : {len(full_tracks)}")
    print(f"New to playlist         : {summary['new_to_playlist']}")
    print(f"MASTER existing         : {summary['master_found']}")
    print(f"MASTER new              : {summary['master_new']}")
    print(f"REACT COMPLETE / SKIP   : {summary['react_complete']}")
    print(f"PENDING FOR DEEZER/MIK  : {summary['pending']}")
    print(f"Errors                  : {summary['errors']}")

    print()
    print("PENDING RULE:")
    print("Spotify playlist - final React playlist (SongID primary match)")
    print()
    print(f"JSON COMPLETO:\n{OUTPUT_JSON_PATH}")
    print()
    print(f"JSON PENDING:\n{PENDING_JSON_PATH}")
    print()

    if pending_playlist_name:
        print("Usa en Deezer solamente la NUEVA playlist Spotify:")
        print(f'    "{pending_playlist_name}"')
        if pending_playlist_url:
            print(f"    {pending_playlist_url}")
    else:
        print("No se creó una nueva playlist Spotify.")

if __name__ == "__main__":
    main()
