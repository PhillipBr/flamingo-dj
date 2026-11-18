
import os
import re
import sqlite3
import time
from pathlib import Path
from typing import Optional, List, Dict, Tuple

import spotipy
from dotenv import load_dotenv
from spotipy.oauth2 import SpotifyOAuth
from spotipy.exceptions import SpotifyException


# ============================================================
# CONFIG
# ============================================================

DB_ROOT = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
)

BASE_DIR = DB_ROOT / "_FLAMINGO - MASTER"

MASTER_DB_PATH = BASE_DIR / "MASTER_CLEAN.db"

ENV_PATH = BASE_DIR / ".env"

SPOTIFY_TOKEN_CACHE = (
    BASE_DIR / ".spotify_master_playlist_creator_cache"
)

PLAYLIST_PUBLIC = False

SPOTIFY_SCOPE = (
    "playlist-modify-private "
    "playlist-modify-public"
)

# Spotify acepta hasta 100 tracks por request.
SPOTIFY_BATCH_SIZE = 100


# ============================================================
# LOG
# ============================================================

def log(message: str):
    print(
        f"[{time.strftime('%H:%M:%S')}] {message}",
        flush=True,
    )


# ============================================================
# TEXT HELPERS
# ============================================================

def normalize_text(value) -> str:

    if value is None:
        return ""

    value = str(value).strip().lower()

    value = re.sub(
        r"\s+",
        " ",
        value,
    )

    return value


def is_empty(value) -> bool:

    if value is None:
        return True

    return str(value).strip() == ""


def spotify_url_to_uri(
    spotify_url: Optional[str],
) -> Optional[str]:

    if not spotify_url:
        return None

    value = str(spotify_url).strip()

    # URL normal:
    # https://open.spotify.com/track/xxxxxxxx

    match = re.search(
        r"open\.spotify\.com/track/([A-Za-z0-9]+)",
        value,
    )

    if match:
        return f"spotify:track:{match.group(1)}"

    # Ya viene como URI.

    match = re.search(
        r"spotify:track:([A-Za-z0-9]+)",
        value,
    )

    if match:
        return f"spotify:track:{match.group(1)}"

    return None


# ============================================================
# VALIDATION
# ============================================================

def validate_paths():

    if not MASTER_DB_PATH.exists():

        raise FileNotFoundError(
            "No existe MASTER_CLEAN.db:\n"
            f"{MASTER_DB_PATH}"
        )

    if not ENV_PATH.exists():

        raise FileNotFoundError(
            "No existe .env:\n"
            f"{ENV_PATH}"
        )


# ============================================================
# DATABASE HELPERS
# ============================================================

def get_connection() -> sqlite3.Connection:

    conn = sqlite3.connect(
        MASTER_DB_PATH,
        timeout=60,
    )

    conn.row_factory = sqlite3.Row

    conn.execute(
        "PRAGMA busy_timeout=60000"
    )

    return conn


def table_exists(
    conn: sqlite3.Connection,
    table: str,
) -> bool:

    row = conn.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type='table'
          AND LOWER(name)=LOWER(?)
        LIMIT 1
        """,
        (table,),
    ).fetchone()

    return row is not None


def get_columns(
    conn: sqlite3.Connection,
    table: str,
) -> Dict[str, str]:

    result = {}

    for row in conn.execute(
        f'PRAGMA table_info("{table}")'
    ):

        actual = str(row["name"])

        result[
            actual.lower()
        ] = actual

    return result


def require_table(
    conn: sqlite3.Connection,
    table: str,
):

    if not table_exists(
        conn,
        table,
    ):

        raise RuntimeError(
            f"MASTER_CLEAN.db no tiene "
            f"la tabla requerida: {table}"
        )


# ============================================================
# CHECK MASTER SCHEMA
# ============================================================

def validate_master_schema(
    conn: sqlite3.Connection,
):

    required_tables = [
        "Songs",
        "TrackMetadata",
        "SpotifyLinks",
    ]

    for table in required_tables:
        require_table(
            conn,
            table,
        )

    print()
    print("=" * 72)
    print("MASTER_CLEAN.db")
    print("=" * 72)

    for table in [
        "Songs",
        "TrackMetadata",
        "SpotifyLinks",
        "Artists",
        "SongArtists",
    ]:

        if table_exists(
            conn,
            table,
        ):

            columns = get_columns(
                conn,
                table,
            )

            print(
                f"{table:<20}: "
                f"{', '.join(columns.values())}"
            )

        else:

            print(
                f"{table:<20}: NOT FOUND"
            )


# ============================================================
# ARTIST SCHEMA DETECTION
# ============================================================

def detect_artist_schema(
    conn: sqlite3.Connection,
) -> Optional[Dict[str, str]]:
    """
    Detecta automáticamente:

        Artists
        SongArtists

    y las columnas necesarias para el fallback
    de género del artista.

    Devuelve None si no puede utilizar Artist Genre.
    """

    if not table_exists(
        conn,
        "Artists",
    ):

        log(
            "WARNING: tabla Artists no existe. "
            "No habrá fallback por Artist Genre."
        )

        return None

    if not table_exists(
        conn,
        "SongArtists",
    ):

        log(
            "WARNING: tabla SongArtists no existe. "
            "No habrá fallback por Artist Genre."
        )

        return None

    artist_cols = get_columns(
        conn,
        "Artists",
    )

    song_artist_cols = get_columns(
        conn,
        "SongArtists",
    )

    # ---------------------------------------------
    # ArtistID
    # ---------------------------------------------

    artist_id_col = (
        artist_cols.get("artistid")
        or artist_cols.get("artist_id")
        or artist_cols.get("id")
    )

    # ---------------------------------------------
    # Genres
    # ---------------------------------------------

    artist_genres_col = (
        artist_cols.get("genres")
        or artist_cols.get("genre")
    )

    # ---------------------------------------------
    # SongArtists SongID
    # ---------------------------------------------

    sa_song_id_col = (
        song_artist_cols.get("songid")
        or song_artist_cols.get("song_id")
    )

    # ---------------------------------------------
    # SongArtists ArtistID
    # ---------------------------------------------

    sa_artist_id_col = (
        song_artist_cols.get("artistid")
        or song_artist_cols.get("artist_id")
    )

    if not all(
        [
            artist_id_col,
            artist_genres_col,
            sa_song_id_col,
            sa_artist_id_col,
        ]
    ):

        log(
            "WARNING: no pude determinar las "
            "columnas Artists/SongArtists."
        )

        return None

    return {
        "artist_id": artist_id_col,
        "genres": artist_genres_col,
        "sa_song_id": sa_song_id_col,
        "sa_artist_id": sa_artist_id_col,
    }


# ============================================================
# FILTER QUERY
# ============================================================

def build_query(
    conn: sqlite3.Connection,
    keyword: str,
    year_start: int,
    year_end: int,
    popularity_min: int,
    popularity_max: int,
) -> Tuple[str, Dict]:

    artist_schema = detect_artist_schema(
        conn
    )

    params = {
        "genre_keyword": (
            f"%{keyword.lower()}%"
        ),
        "year_start": year_start,
        "year_end": year_end,
        "popularity_min": popularity_min,
        "popularity_max": popularity_max,
    }

    # ========================================================
    # ARTIST FALLBACK
    # ========================================================

    if artist_schema:

        artist_id = artist_schema[
            "artist_id"
        ]

        artist_genres = artist_schema[
            "genres"
        ]

        sa_song_id = artist_schema[
            "sa_song_id"
        ]

        sa_artist_id = artist_schema[
            "sa_artist_id"
        ]

        artist_genre_fallback = f"""
        EXISTS (
            SELECT 1
            FROM SongArtists SA
            INNER JOIN Artists A
                ON A."{artist_id}"
                 = SA."{sa_artist_id}"
            WHERE
                SA."{sa_song_id}" = S.SongID

                AND LOWER(
                    COALESCE(
                        A."{artist_genres}",
                        ''
                    )
                ) LIKE :genre_keyword
        )
        """

    else:

        artist_genre_fallback = "0"

    # ========================================================
    # MAIN QUERY
    # ========================================================

    query = f"""
    SELECT
        S.SongID,
        S.Title,
        S.Artist,

        TM.Popularity,
        TM.ReleaseDate,
        TM.Genre,
        TM.Album,
        TM.Duration,
        TM.CoverImage,

        SL.Spotify_URL,

        CASE

            WHEN LOWER(
                COALESCE(
                    TM.Genre,
                    ''
                )
            ) LIKE :genre_keyword

            THEN 'TRACK_GENRE'

            WHEN (
                TRIM(
                    COALESCE(
                        TM.Genre,
                        ''
                    )
                ) = ''

                AND (
                    {artist_genre_fallback}
                )
            )

            THEN 'ARTIST_GENRE'

            ELSE NULL

        END AS GenreMatchSource

    FROM Songs S

    INNER JOIN TrackMetadata TM
        ON TM.SongID = S.SongID

    INNER JOIN SpotifyLinks SL
        ON SL.SongID = S.SongID

    WHERE

        -------------------------------------------------------
        -- POPULARITY
        -------------------------------------------------------

        CAST(
            COALESCE(
                TM.Popularity,
                -1
            )
            AS INTEGER
        )
        BETWEEN
            :popularity_min
            AND
            :popularity_max


        -------------------------------------------------------
        -- RELEASE YEAR
        -------------------------------------------------------

        AND CAST(
            SUBSTR(
                TRIM(TM.ReleaseDate),
                1,
                4
            )
            AS INTEGER
        )
        BETWEEN
            :year_start
            AND
            :year_end


        -------------------------------------------------------
        -- SPOTIFY URL
        -------------------------------------------------------

        AND SL.Spotify_URL IS NOT NULL

        AND TRIM(
            SL.Spotify_URL
        ) <> ''


        -------------------------------------------------------
        -- GENRE
        -------------------------------------------------------

        AND (

            -----------------------------------------------
            -- Track Genre
            -----------------------------------------------

            LOWER(
                COALESCE(
                    TM.Genre,
                    ''
                )
            ) LIKE :genre_keyword


            OR


            -----------------------------------------------
            -- Artist Genre fallback
            --
            -- SOLO si Track Genre está vacío.
            -----------------------------------------------

            (

                TRIM(
                    COALESCE(
                        TM.Genre,
                        ''
                    )
                ) = ''

                AND (

                    {artist_genre_fallback}

                )

            )

        )


    ORDER BY

        CAST(
            SUBSTR(
                TM.ReleaseDate,
                1,
                4
            )
            AS INTEGER
        ) DESC,

        TM.Popularity DESC,

        S.Artist ASC,

        S.Title ASC
    """

    return query, params


# ============================================================
# FETCH TRACKS
# ============================================================

def fetch_tracks(
    keyword: str,
    year_start: int,
    year_end: int,
    popularity_min: int,
    popularity_max: int,
) -> List[Dict]:

    conn = get_connection()

    try:

        validate_master_schema(
            conn
        )

        query, params = build_query(
            conn=conn,
            keyword=keyword,
            year_start=year_start,
            year_end=year_end,
            popularity_min=popularity_min,
            popularity_max=popularity_max,
        )

        log(
            "Ejecutando búsqueda en MASTER..."
        )

        start = time.perf_counter()

        rows = conn.execute(
            query,
            params,
        ).fetchall()

        elapsed = (
            time.perf_counter()
            - start
        )

        log(
            f"SQL terminado en "
            f"{elapsed:.2f}s"
        )

        tracks = [
            dict(row)
            for row in rows
        ]

        return tracks

    finally:

        conn.close()


# ============================================================
# FINAL DEDUPE
# ============================================================

def dedupe_tracks(
    tracks: List[Dict],
) -> List[Dict]:

    unique = []

    seen_song_ids = set()
    seen_spotify_uris = set()
    seen_title_artist = set()

    duplicate_count = 0
    invalid_spotify = 0

    for track in tracks:

        song_id = str(
            track.get(
                "SongID",
                "",
            )
        ).strip()

        title = normalize_text(
            track.get("Title")
        )

        artist = normalize_text(
            track.get("Artist")
        )

        title_artist = (
            title,
            artist,
        )

        uri = spotify_url_to_uri(
            track.get(
                "Spotify_URL"
            )
        )

        if not uri:

            invalid_spotify += 1
            continue

        # ---------------------------------------------
        # Primary dedupe = SongID
        # ---------------------------------------------

        if song_id in seen_song_ids:

            duplicate_count += 1
            continue

        # ---------------------------------------------
        # Extra protection = URI
        # ---------------------------------------------

        if uri in seen_spotify_uris:

            duplicate_count += 1
            continue

        # ---------------------------------------------
        # Extra protection = Title + Artist
        # ---------------------------------------------

        if title_artist in seen_title_artist:

            duplicate_count += 1
            continue

        seen_song_ids.add(
            song_id
        )

        seen_spotify_uris.add(
            uri
        )

        seen_title_artist.add(
            title_artist
        )

        track["SpotifyURI"] = uri

        unique.append(
            track
        )

    print()
    print("=" * 72)
    print("DEDUP")
    print("=" * 72)

    print(
        f"SQL results        : {len(tracks)}"
    )

    print(
        f"Unique tracks      : {len(unique)}"
    )

    print(
        f"Duplicates removed : {duplicate_count}"
    )

    print(
        f"Invalid Spotify URL: {invalid_spotify}"
    )

    return unique


# ============================================================
# SPOTIFY AUTH
# ============================================================

def load_spotify_environment():

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

    if not all(
        [
            client_id,
            client_secret,
            redirect_uri,
        ]
    ):

        raise RuntimeError(
            "Faltan datos en .env:\n\n"
            "SPOTIFY_CLIENT_ID\n"
            "SPOTIFY_CLIENT_SECRET\n"
            "SPOTIFY_REDIRECT_URI"
        )

    return (
        client_id,
        client_secret,
        redirect_uri,
    )


def get_spotify_client():

    (
        client_id,
        client_secret,
        redirect_uri,
    ) = load_spotify_environment()

    auth_manager = SpotifyOAuth(

        client_id=client_id,

        client_secret=client_secret,

        redirect_uri=redirect_uri,

        scope=SPOTIFY_SCOPE,

        cache_path=str(
            SPOTIFY_TOKEN_CACHE
        ),

        open_browser=True,
    )

    return spotipy.Spotify(
        auth_manager=auth_manager
    )


# ============================================================
# SPOTIFY RETRY
# ============================================================

def spotify_call_with_retry(
    fn,
    *args,
    retries=6,
    **kwargs,
):

    last_error = None

    for attempt in range(
        1,
        retries + 1,
    ):

        try:

            return fn(
                *args,
                **kwargs,
            )

        except SpotifyException as exc:

            last_error = exc

            if getattr(
                exc,
                "http_status",
                None,
            ) == 429:

                headers = (
                    getattr(
                        exc,
                        "headers",
                        None,
                    )
                    or {}
                )

                wait = 5

                try:

                    wait = int(
                        headers.get(
                            "Retry-After",
                            5,
                        )
                    )

                except Exception:
                    pass

                log(
                    f"Spotify rate limit. "
                    f"Esperando {wait}s..."
                )

                time.sleep(
                    wait + 1
                )

                continue

            raise

        except Exception as exc:

            last_error = exc

            if attempt >= retries:
                raise

            log(
                f"Error temporal Spotify: "
                f"{exc}"
            )

            time.sleep(
                min(
                    attempt * 2,
                    10,
                )
            )

    if last_error:
        raise last_error


# ============================================================
# CREATE SPOTIFY PLAYLIST
# ============================================================

def create_spotify_playlist(
    sp,
    playlist_name: str,
    description: str,
) -> Dict:

    me = spotify_call_with_retry(
        sp.current_user
    )

    user_id = me["id"]

    log(
        f"Spotify user: {user_id}"
    )

    playlist = spotify_call_with_retry(

        sp.user_playlist_create,

        user=user_id,

        name=playlist_name,

        public=PLAYLIST_PUBLIC,

        description=description,
    )

    return playlist


# ============================================================
# ADD TRACKS
# ============================================================

def add_tracks_to_playlist(
    sp,
    playlist_id: str,
    tracks: List[Dict],
):

    uris = [
        track["SpotifyURI"]
        for track in tracks
        if track.get(
            "SpotifyURI"
        )
    ]

    total = len(
        uris
    )

    total_batches = (
        total
        + SPOTIFY_BATCH_SIZE
        - 1
    ) // SPOTIFY_BATCH_SIZE

    for batch_number, start in enumerate(

        range(
            0,
            total,
            SPOTIFY_BATCH_SIZE,
        ),

        start=1,
    ):

        batch = uris[
            start:
            start + SPOTIFY_BATCH_SIZE
        ]

        end = (
            start
            + len(batch)
        )

        log(
            f"Spotify batch "
            f"{batch_number}/{total_batches} "
            f"| tracks "
            f"{start + 1}-{end}/{total}"
        )

        spotify_call_with_retry(

            sp.playlist_add_items,

            playlist_id=playlist_id,

            items=batch,
        )


# ============================================================
# INPUT HELPERS
# ============================================================

def ask_integer(
    message: str,
    minimum: int,
    maximum: int,
) -> int:

    while True:

        value = input(
            message
        ).strip()

        try:

            number = int(
                value
            )

        except ValueError:

            print(
                "Ingresa un número válido."
            )

            continue

        if not (
            minimum
            <= number
            <= maximum
        ):

            print(
                f"Debe estar entre "
                f"{minimum} y {maximum}."
            )

            continue

        return number


def ask_filters():

    print()
    print("=" * 72)
    print("FLAMINGO - MASTER TO SPOTIFY PLAYLIST")
    print("=" * 72)

    keyword = input(
        "\nGenre keyword: "
    ).strip()

    if not keyword:

        raise ValueError(
            "Genre keyword no puede estar vacío."
        )

    print()
    print("RELEASE YEAR")
    print("-" * 30)

    year_start = ask_integer(
        "Desde año: ",
        1900,
        2100,
    )

    year_end = ask_integer(
        "Hasta año: ",
        1900,
        2100,
    )

    if year_start > year_end:

        raise ValueError(
            "El año inicial no puede "
            "ser mayor al año final."
        )

    print()
    print("SPOTIFY POPULARITY")
    print("-" * 30)

    popularity_min = ask_integer(
        "Popularity mínima [0-100]: ",
        0,
        100,
    )

    popularity_max = ask_integer(
        "Popularity máxima [0-100]: ",
        0,
        100,
    )

    if (
        popularity_min
        > popularity_max
    ):

        raise ValueError(
            "Popularity mínima no puede "
            "ser mayor que máxima."
        )

    default_playlist_name = (
        f"{keyword.upper()} "
        f"{year_start}-{year_end} "
        f"POP {popularity_min}-{popularity_max}"
    )

    print()
    print(
        "Nombre por defecto:"
    )

    print(
        default_playlist_name
    )

    custom_name = input(
        "\nNombre playlist "
        "[ENTER = usar default]: "
    ).strip()

    playlist_name = (
        custom_name
        or default_playlist_name
    )

    return {
        "keyword": keyword,
        "year_start": year_start,
        "year_end": year_end,
        "popularity_min": popularity_min,
        "popularity_max": popularity_max,
        "playlist_name": playlist_name,
    }


# ============================================================
# PREVIEW
# ============================================================

def print_preview(
    tracks: List[Dict],
    limit: int = 50,
):

    print()
    print("=" * 72)
    print("TRACKS ENCONTRADOS")
    print("=" * 72)

    track_genre_count = sum(
        1
        for track in tracks
        if track.get(
            "GenreMatchSource"
        ) == "TRACK_GENRE"
    )

    artist_genre_count = sum(
        1
        for track in tracks
        if track.get(
            "GenreMatchSource"
        ) == "ARTIST_GENRE"
    )

    print(
        f"Total              : {len(tracks)}"
    )

    print(
        f"Track Genre        : {track_genre_count}"
    )

    print(
        f"Artist Genre       : {artist_genre_count}"
    )

    print()

    for index, track in enumerate(
        tracks[:limit],
        start=1,
    ):

        print(
            f"[{index}] "
            f"SongID={track['SongID']} | "
            f"{track['Artist']} - "
            f"{track['Title']} | "
            f"Pop={track['Popularity']} | "
            f"Release={track['ReleaseDate']} | "
            f"{track['GenreMatchSource']}"
        )

    if len(tracks) > limit:

        print()
        print(
            f"... +{len(tracks) - limit} "
            f"tracks más"
        )


# ============================================================
# MAIN
# ============================================================

def main():

    total_start = (
        time.perf_counter()
    )

    validate_paths()

    filters = ask_filters()

    print()
    print("=" * 72)
    print("FILTERS")
    print("=" * 72)

    print(
        f"Keyword        : "
        f"{filters['keyword']}"
    )

    print(
        f"Release        : "
        f"{filters['year_start']} - "
        f"{filters['year_end']}"
    )

    print(
        f"Popularity     : "
        f"{filters['popularity_min']} - "
        f"{filters['popularity_max']}"
    )

    print(
        f"Playlist       : "
        f"{filters['playlist_name']}"
    )

    # ========================================================
    # MASTER QUERY
    # ========================================================

    tracks = fetch_tracks(

        keyword=filters[
            "keyword"
        ],

        year_start=filters[
            "year_start"
        ],

        year_end=filters[
            "year_end"
        ],

        popularity_min=filters[
            "popularity_min"
        ],

        popularity_max=filters[
            "popularity_max"
        ],
    )

    # ========================================================
    # DEDUP
    # ========================================================

    tracks = dedupe_tracks(
        tracks
    )

    if not tracks:

        print()
        print(
            "No encontré canciones "
            "con esos filtros."
        )

        return

    # ========================================================
    # PREVIEW
    # ========================================================

    print_preview(
        tracks
    )

    # ========================================================
    # CONFIRM
    # ========================================================

    print()
    answer = input(
        f"¿Crear playlist Spotify con "
        f"{len(tracks)} canciones? [S/N]: "
    ).strip().lower()

    if answer not in {
        "s",
        "si",
        "sí",
        "y",
        "yes",
    }:

        print(
            "Playlist cancelada."
        )

        return

    # ========================================================
    # SPOTIFY
    # ========================================================

    log(
        "Autenticando Spotify..."
    )

    sp = get_spotify_client()

    description = (

        "Flamingo DJ | "
        f"Genre: {filters['keyword']} | "
        f"Release: "
        f"{filters['year_start']}-"
        f"{filters['year_end']} | "
        f"Popularity: "
        f"{filters['popularity_min']}-"
        f"{filters['popularity_max']}"

    )

    playlist = create_spotify_playlist(

        sp=sp,

        playlist_name=filters[
            "playlist_name"
        ],

        description=description,
    )

    playlist_id = playlist[
        "id"
    ]

    playlist_url = (
        playlist
        .get(
            "external_urls",
            {}
        )
        .get(
            "spotify"
        )
    )

    print()
    print("=" * 72)
    print("SPOTIFY PLAYLIST CREATED")
    print("=" * 72)

    print(
        f"Name   : "
        f"{filters['playlist_name']}"
    )

    print(
        f"ID     : "
        f"{playlist_id}"
    )

    print(
        f"Tracks : "
        f"{len(tracks)}"
    )

    print(
        f"URL    : "
        f"{playlist_url}"
    )

    # ========================================================
    # ADD TRACKS
    # ========================================================

    add_tracks_to_playlist(

        sp=sp,

        playlist_id=playlist_id,

        tracks=tracks,
    )

    # ========================================================
    # FINAL RESULT
    # ========================================================

    track_genre_count = sum(

        1

        for track in tracks

        if track.get(
            "GenreMatchSource"
        ) == "TRACK_GENRE"
    )

    artist_genre_count = sum(

        1

        for track in tracks

        if track.get(
            "GenreMatchSource"
        ) == "ARTIST_GENRE"
    )

    elapsed = (
        time.perf_counter()
        - total_start
    )

    print()
    print("=" * 72)
    print("RESULTADO")
    print("=" * 72)

    print(
        f"Genre keyword       : "
        f"{filters['keyword']}"
    )

    print(
        f"Release range       : "
        f"{filters['year_start']} - "
        f"{filters['year_end']}"
    )

    print(
        f"Popularity range    : "
        f"{filters['popularity_min']} - "
        f"{filters['popularity_max']}"
    )

    print(
        f"Track Genre matches : "
        f"{track_genre_count}"
    )

    print(
        f"Artist Genre fallback: "
        f"{artist_genre_count}"
    )

    print(
        f"TOTAL PLAYLIST      : "
        f"{len(tracks)}"
    )

    print(
        f"Spotify URL         : "
        f"{playlist_url}"
    )

    print(
        f"Tiempo total        : "
        f"{elapsed:.2f}s"
    )


if __name__ == "__main__":
    main()