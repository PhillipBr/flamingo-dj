# -*- coding: utf-8 -*-

"""
CREATE_JSON_PLAYLIST.py
============================================================

Crea playlists JSON compatibles con FlamingoApp DJ React.

UBICACIÓN RECOMENDADA DEL SCRIPT:

C:\\Users\\fbrav\\OneDrive\\Desktop\\__DB_FILES\\
FLAMINGOAPP_DJ_REACT\\scripts\\CREATE_JSON_PLAYLIST.py

SALIDA:

C:\\Users\\fbrav\\OneDrive\\Desktop\\__DB_FILES\\
FLAMINGOAPP_DJ_REACT\\src\\data\\<playlist>.json


FUENTES ACTUALES
------------------------------------------------------------

SI.db
    SongID
    Title
    Artist

TS.db
    Album
    Duration
    CoverImage
    Popularity
    ReleaseDate
    Genre

SP.db
    Spotify_URL

DJ.db
    Tempo
    Musical Key
    Cue Points
    Energy
    Overall Volume
    Folder
    Keywords
    Country
    Duration
    Cover Image
    Comments
    Date Added
    Rating

ARTIST_FEATURES.db
    Información ampliada del artista cuando las columnas
    correspondientes existen.


IMPORTANTE
------------------------------------------------------------

- Este script NO modifica ninguna base de datos.
- Solo lee información.
- Crea directamente el JSON dentro del proyecto React.
- Puedes crear distintas playlists cambiando únicamente CONFIG.
"""

import json
import os
import re
import sqlite3

from datetime import datetime
from typing import (
    Any,
    Dict,
    Iterable,
    List,
    Optional,
    Sequence,
    Set,
)


# ============================================================
# CONFIGURACIÓN GENERAL
# ============================================================

BASE_DB = r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"

PROJECT_ROOT = os.path.join(
    BASE_DB,
    "FLAMINGOAPP_DJ_REACT",
)

SCRIPTS_DIR = os.path.join(
    PROJECT_ROOT,
    "scripts",
)

OUTPUT_JSON_DIR = os.path.join(
    PROJECT_ROOT,
    "src",
    "data",
    "JSON",
    "playlists"
)


# ============================================================
# BASES DE DATOS
# ============================================================

SI_DB_PATH = os.path.join(
    BASE_DB,
    "SI.db",
)

TS_DB_PATH = os.path.join(
    BASE_DB,
    "TS.db",
)

SP_DB_PATH = os.path.join(
    BASE_DB,
    "SP.db",
)

DJ_DB_PATH = os.path.join(
    BASE_DB,
    "DJ.db",
)

ARTIST_DB_PATH = os.path.join(
    BASE_DB,
    "ARTIST_FEATURES.db",
)


# ============================================================
# CONFIGURACIÓN DE LA PLAYLIST
#
# CAMBIA PRINCIPALMENTE ESTA SECCIÓN PARA CREAR OTRA PLAYLIST
# ============================================================

PLAYLIST_ID = "Reggaeton"

PLAYLIST_NAME = "Reggaeton"

PLAYLIST_DESCRIPTION = (
    "Playlist de Reggaeton creada desde las bases de datos "
    "actuales de FlamingoApp."
)

OUTPUT_JSON_NAME = "Reggaeton.json"


# ============================================================
# FILTROS
#
# Usa None o [] para desactivar un filtro.
#
# genres_any:
#     OR entre los valores.
#
# popularity_min:
#     Popularidad mínima Spotify.
#
# release_date_from:
#     Fecha mínima YYYY-MM-DD.
#
# keywords_any:
#     Busca keywords individuales en DJ.db.
# ============================================================

FILTERS = {
    "genres_any": [
        "reggaeton",
    ],

    "genres_exclude": [],

    "popularity_min": 30,

    "popularity_max": None,

    "release_date_from": None,

    "release_date_to": None,

    "artists_any": [],

    "title_contains_any": [],

    "keywords_any": [],

    "countries_any": [],

    # Cuando está activo, solo exporta canciones completas.
    "require_complete_track": True,
}


# ============================================================
# CAMPOS OBLIGATORIOS
#
# Una canción queda fuera del JSON si cualquiera de estos
# campos es NULL, vacío o inválido.
#
# Comments, Date Added, Rating y artistDetails NO se exigen,
# porque pueden ser opcionales y no afectan la tabla DJ.
# ============================================================

REQUIRED_TRACK_FIELDS = [
    "title",
    "artist",
    "album",
    "artworkUrl",
    "durationSeconds",
    "releaseDate",
    "genre",
    "country",
    "spotifyPopularity",
    "spotifyUrl",
    "tempo",
    "musicalKey",
    "energy",
    "overallVolume",
    "cuePoints",
    "keywords",
    "folder",
]


# ============================================================
# ORDEN
#
# Campos permitidos:
#
# popularity
# releaseDate
# title
# artist
# tempo
# energy
# ============================================================

SORT_BY = "popularity"

SORT_DESCENDING = True


# ============================================================
# LÍMITE
#
# None = exportar todos.
# 100 = exportar los primeros 100 después de ordenar.
# ============================================================

MAX_TRACKS = None


# ============================================================
# OPCIONES DE EXPORTACIÓN
# ============================================================

INCLUDE_ARTIST_DETAILS = True

INCLUDE_EXPORT_METADATA = True

JSON_INDENT = 2


# ============================================================
# LOG
# ============================================================

def log(message: str) -> None:
    print(message, flush=True)


# ============================================================
# HELPERS GENERALES
# ============================================================

def normalize_text(value: Any) -> str:
    if value is None:
        return ""

    text = str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)

    return text


def normalize_column_name(value: Any) -> str:
    return re.sub(
        r"[^a-z0-9]+",
        "",
        str(value or "").lower(),
    )


def is_empty(value: Any) -> bool:
    if value is None:
        return True

    return str(value).strip() == ""


def safe_str(value: Any) -> Optional[str]:
    if is_empty(value):
        return None

    text = str(value).strip()

    return text if text else None


def safe_int(value: Any) -> Optional[int]:
    if is_empty(value):
        return None

    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def safe_float(value: Any) -> Optional[float]:
    if is_empty(value):
        return None

    text = str(value).strip()

    match = re.search(
        r"-?\d+(?:\.\d+)?",
        text,
    )

    if not match:
        return None

    try:
        return float(match.group(0))
    except (TypeError, ValueError):
        return None


def first_not_empty(*values: Any) -> Any:
    for value in values:
        if not is_empty(value):
            return value

    return None


def normalize_string_list(
    values: Optional[Sequence[Any]],
) -> List[str]:
    if not values:
        return []

    output: List[str] = []
    seen: Set[str] = set()

    for value in values:
        normalized = normalize_text(value)

        if not normalized:
            continue

        if normalized in seen:
            continue

        seen.add(normalized)
        output.append(normalized)

    return output


def split_text_list(value: Any) -> List[str]:
    if is_empty(value):
        return []

    output: List[str] = []
    seen: Set[str] = set()

    for item in str(value).split(","):
        cleaned = item.strip()
        normalized = normalize_text(cleaned)

        if not normalized:
            continue

        if normalized in seen:
            continue

        seen.add(normalized)
        output.append(cleaned)

    return output


def normalize_date(value: Any) -> Optional[str]:
    text = safe_str(value)

    if not text:
        return None

    match = re.match(
        r"^(\d{4}-\d{2}-\d{2})",
        text,
    )

    if match:
        return match.group(1)

    match = re.match(
        r"^(\d{4}-\d{2})$",
        text,
    )

    if match:
        return match.group(1)

    match = re.match(
        r"^(\d{4})$",
        text,
    )

    if match:
        return match.group(1)

    return text


def parse_duration_to_seconds(
    value: Any,
) -> Optional[int]:
    """
    Convierte:

    03:51
    3:51
    01:03:20
    231

    a segundos.
    """

    if is_empty(value):
        return None

    text = str(value).strip()

    if re.fullmatch(r"\d+", text):
        try:
            return int(text)
        except ValueError:
            return None

    parts = text.split(":")

    try:
        numbers = [
            int(part)
            for part in parts
        ]
    except ValueError:
        return None

    if len(numbers) == 2:
        minutes, seconds = numbers

        return (
            minutes * 60
            + seconds
        )

    if len(numbers) == 3:
        hours, minutes, seconds = numbers

        return (
            hours * 3600
            + minutes * 60
            + seconds
        )

    return None


def format_duration(
    seconds: Optional[int],
) -> Optional[str]:
    if seconds is None:
        return None

    if seconds < 0:
        return None

    hours = seconds // 3600
    remainder = seconds % 3600
    minutes = remainder // 60
    remaining_seconds = remainder % 60

    if hours > 0:
        return (
            f"{hours:02d}:"
            f"{minutes:02d}:"
            f"{remaining_seconds:02d}"
        )

    return (
        f"{minutes:02d}:"
        f"{remaining_seconds:02d}"
    )


def value_contains_any(
    value: Any,
    accepted_values: Sequence[str],
) -> bool:
    accepted = normalize_string_list(
        accepted_values,
    )

    if not accepted:
        return True

    normalized_value = normalize_text(
        value,
    )

    if not normalized_value:
        return False

    return any(
        accepted_value in normalized_value
        for accepted_value in accepted
    )


def value_contains_none(
    value: Any,
    excluded_values: Sequence[str],
) -> bool:
    excluded = normalize_string_list(
        excluded_values,
    )

    if not excluded:
        return True

    normalized_value = normalize_text(
        value,
    )

    return not any(
        excluded_value in normalized_value
        for excluded_value in excluded
    )


# ============================================================
# SQLITE HELPERS
# ============================================================

def get_connection(
    db_path: str,
) -> sqlite3.Connection:
    connection = sqlite3.connect(
        db_path,
    )

    connection.row_factory = sqlite3.Row

    return connection


def validate_file(
    file_path: str,
    required: bool = True,
) -> bool:
    exists = os.path.isfile(
        file_path,
    )

    if required and not exists:
        raise FileNotFoundError(
            "No se encontró el archivo requerido:\n"
            f"{file_path}"
        )

    return exists


def get_table_names(
    connection: sqlite3.Connection,
) -> List[str]:
    cursor = connection.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
    """)

    return [
        str(row["name"])
        for row in cursor.fetchall()
    ]


def get_real_table_name(
    connection: sqlite3.Connection,
    expected_name: str,
) -> Optional[str]:
    expected_normalized = expected_name.lower()

    for table_name in get_table_names(
        connection,
    ):
        if table_name.lower() == expected_normalized:
            return table_name

    return None


def get_table_columns(
    connection: sqlite3.Connection,
    table_name: str,
) -> List[str]:
    escaped_table = table_name.replace(
        '"',
        '""',
    )

    cursor = connection.execute(
        f'PRAGMA table_info("{escaped_table}")'
    )

    return [
        str(row["name"])
        for row in cursor.fetchall()
    ]


def find_real_column(
    columns: Iterable[str],
    aliases: Sequence[str],
) -> Optional[str]:
    column_map = {
        normalize_column_name(column): column
        for column in columns
    }

    for alias in aliases:
        normalized_alias = normalize_column_name(
            alias,
        )

        if normalized_alias in column_map:
            return column_map[
                normalized_alias
            ]

    return None


def quote_identifier(identifier: str) -> str:
    escaped = identifier.replace(
        '"',
        '""',
    )

    return f'"{escaped}"'


def build_dynamic_select(
    real_columns: Dict[str, Optional[str]],
) -> str:
    select_items: List[str] = []

    for internal_name, real_column in real_columns.items():
        if real_column:
            select_items.append(
                f"{quote_identifier(real_column)} "
                f"AS {quote_identifier(internal_name)}"
            )
        else:
            select_items.append(
                f"NULL AS "
                f"{quote_identifier(internal_name)}"
            )

    return ", ".join(select_items)


# ============================================================
# CARGAR SI.DB
# ============================================================

def load_si_catalog() -> Dict[int, Dict[str, Any]]:
    validate_file(
        SI_DB_PATH,
        required=True,
    )

    connection = get_connection(
        SI_DB_PATH,
    )

    try:
        table_name = get_real_table_name(
            connection,
            "SI",
        )

        if not table_name:
            raise RuntimeError(
                "No se encontró la tabla SI en:\n"
                f"{SI_DB_PATH}"
            )

        columns = get_table_columns(
            connection,
            table_name,
        )

        song_id_column = find_real_column(
            columns,
            [
                "SongID",
                "Song ID",
                "song_id",
            ],
        )

        title_column = find_real_column(
            columns,
            [
                "Title",
                "Track",
                "Track Title",
            ],
        )

        artist_column = find_real_column(
            columns,
            [
                "Artist",
                "Artists",
            ],
        )

        if not song_id_column:
            raise RuntimeError(
                "La tabla SI no contiene SongID."
            )

        if not title_column:
            raise RuntimeError(
                "La tabla SI no contiene Title."
            )

        if not artist_column:
            raise RuntimeError(
                "La tabla SI no contiene Artist."
            )

        query = f"""
            SELECT
                {quote_identifier(song_id_column)}
                    AS song_id,

                {quote_identifier(title_column)}
                    AS title,

                {quote_identifier(artist_column)}
                    AS artist

            FROM {quote_identifier(table_name)}
        """

        output: Dict[int, Dict[str, Any]] = {}

        for row in connection.execute(
            query,
        ):
            song_id = safe_int(
                row["song_id"],
            )

            if song_id is None:
                continue

            output[song_id] = {
                "song_id": song_id,
                "title": safe_str(
                    row["title"],
                ),
                "artist": safe_str(
                    row["artist"],
                ),
            }

        return output

    finally:
        connection.close()


# ============================================================
# CARGAR TS.DB
# ============================================================

def load_ts_catalog() -> Dict[int, Dict[str, Any]]:
    validate_file(
        TS_DB_PATH,
        required=True,
    )

    connection = get_connection(
        TS_DB_PATH,
    )

    try:
        table_name = get_real_table_name(
            connection,
            "TS",
        )

        if not table_name:
            raise RuntimeError(
                "No se encontró la tabla TS en:\n"
                f"{TS_DB_PATH}"
            )

        columns = get_table_columns(
            connection,
            table_name,
        )

        aliases = {
            "song_id": [
                "SongID",
                "Song ID",
                "song_id",
            ],

            "album": [
                "Album",
            ],

            "duration": [
                "Duration",
                "Track Duration",
            ],

            "cover_image": [
                "CoverImage",
                "Cover Image",
                "Artwork",
                "ArtworkURL",
                "Artwork URL",
            ],

            "popularity": [
                "Popularity",
                "Spotify Popularity",
            ],

            "release_date": [
                "ReleaseDate",
                "Release Date",
            ],

            "genre": [
                "Genre",
                "Genres",
            ],
        }

        real_columns = {
            internal_name: find_real_column(
                columns,
                column_aliases,
            )
            for internal_name, column_aliases
            in aliases.items()
        }

        if not real_columns["song_id"]:
            raise RuntimeError(
                "La tabla TS no contiene SongID."
            )

        select_clause = build_dynamic_select(
            real_columns,
        )

        query = f"""
            SELECT
                {select_clause}
            FROM {quote_identifier(table_name)}
        """

        output: Dict[int, Dict[str, Any]] = {}

        for row in connection.execute(
            query,
        ):
            song_id = safe_int(
                row["song_id"],
            )

            if song_id is None:
                continue

            output[song_id] = {
                "album": safe_str(
                    row["album"],
                ),

                "duration": safe_str(
                    row["duration"],
                ),

                "cover_image": safe_str(
                    row["cover_image"],
                ),

                "popularity": safe_int(
                    row["popularity"],
                ),

                "release_date": normalize_date(
                    row["release_date"],
                ),

                "genre": safe_str(
                    row["genre"],
                ),
            }

        return output

    finally:
        connection.close()


# ============================================================
# CARGAR SP.DB
# ============================================================

def load_spotify_catalog() -> Dict[int, Optional[str]]:
    if not validate_file(
        SP_DB_PATH,
        required=False,
    ):
        log(
            f"SP.db no encontrado: {SP_DB_PATH}"
        )

        return {}

    connection = get_connection(
        SP_DB_PATH,
    )

    try:
        table_name = get_real_table_name(
            connection,
            "SP",
        )

        if not table_name:
            log(
                "No se encontró la tabla SP."
            )

            return {}

        columns = get_table_columns(
            connection,
            table_name,
        )

        song_id_column = find_real_column(
            columns,
            [
                "SongID",
                "Song ID",
                "song_id",
            ],
        )

        spotify_url_column = find_real_column(
            columns,
            [
                "Spotify_URL",
                "Spotify URL",
                "SpotifyURL",
            ],
        )

        if not song_id_column:
            log(
                "La tabla SP no contiene SongID."
            )

            return {}

        if not spotify_url_column:
            log(
                "La tabla SP no contiene Spotify_URL."
            )

            return {}

        query = f"""
            SELECT
                {quote_identifier(song_id_column)}
                    AS song_id,

                {quote_identifier(spotify_url_column)}
                    AS spotify_url

            FROM {quote_identifier(table_name)}
        """

        output: Dict[int, Optional[str]] = {}

        for row in connection.execute(
            query,
        ):
            song_id = safe_int(
                row["song_id"],
            )

            if song_id is None:
                continue

            output[song_id] = safe_str(
                row["spotify_url"],
            )

        return output

    finally:
        connection.close()


# ============================================================
# CARGAR DJ.DB
# ============================================================

def load_dj_catalog() -> Dict[int, Dict[str, Any]]:
    if not validate_file(
        DJ_DB_PATH,
        required=False,
    ):
        log(
            f"DJ.db no encontrado: {DJ_DB_PATH}"
        )

        return {}

    connection = get_connection(
        DJ_DB_PATH,
    )

    try:
        table_name = get_real_table_name(
            connection,
            "tracks",
        )

        if not table_name:
            log(
                "No se encontró la tabla tracks en DJ.db."
            )

            return {}

        columns = get_table_columns(
            connection,
            table_name,
        )

        aliases = {
            "song_id": [
                "song_id",
                "SongID",
            ],

            "title": [
                "title",
                "Title",
            ],

            "artist": [
                "artist",
                "Artist",
            ],

            "popularity": [
                "popularity",
                "Popularity",
            ],

            "release_date": [
                "release_date",
                "ReleaseDate",
                "Release Date",
            ],

            "genre": [
                "genre",
                "Genre",
            ],

            "album": [
                "album",
                "Album",
            ],

            "spotify_url": [
                "spotify_url",
                "Spotify_URL",
                "Spotify URL",
            ],

            "tempo": [
                "tempo",
                "Tempo",
                "BPM",
            ],

            "musical_key": [
                "musical_key",
                "MusicalKey",
                "Musical Key",
                "Key",
            ],

            "cue_points": [
                "cue_points",
                "CuePoints",
                "Cue Points",
            ],

            "energy": [
                "energy",
                "Energy",
            ],

            "overall_volume": [
                "overall_vol",
                "OverallVolume",
                "Overall Volume",
                "Overall Vol",
            ],

            "folder": [
                "folder",
                "Folder",
                "Location",
                "File Path",
            ],

            "keywords": [
                "keywords",
                "Keywords",
            ],

            "country": [
                "Country",
                "country",
            ],

            "duration": [
                "duration",
                "Duration",
            ],

            "cover_image": [
                "cover_image",
                "CoverImage",
                "Cover Image",
            ],

            "comments": [
                "comments",
                "Comments",
                "Comment",
            ],

            "date_added": [
                "date_added",
                "DateAdded",
                "Date Added",
            ],

            "rating": [
                "rating",
                "Rating",
            ],
        }

        real_columns = {
            internal_name: find_real_column(
                columns,
                column_aliases,
            )
            for internal_name, column_aliases
            in aliases.items()
        }

        if not real_columns["song_id"]:
            log(
                "DJ.db no contiene song_id."
            )

            return {}

        select_clause = build_dynamic_select(
            real_columns,
        )

        query = f"""
            SELECT
                {select_clause}
            FROM {quote_identifier(table_name)}
        """

        output: Dict[int, Dict[str, Any]] = {}

        for row in connection.execute(
            query,
        ):
            song_id = safe_int(
                row["song_id"],
            )

            if song_id is None:
                continue

            output[song_id] = {
                "title": safe_str(
                    row["title"],
                ),

                "artist": safe_str(
                    row["artist"],
                ),

                "popularity": safe_int(
                    row["popularity"],
                ),

                "release_date": normalize_date(
                    row["release_date"],
                ),

                "genre": safe_str(
                    row["genre"],
                ),

                "album": safe_str(
                    row["album"],
                ),

                "spotify_url": safe_str(
                    row["spotify_url"],
                ),

                "tempo": safe_float(
                    row["tempo"],
                ),

                "musical_key": safe_str(
                    row["musical_key"],
                ),

                "cue_points": safe_str(
                    row["cue_points"],
                ),

                "energy": safe_float(
                    row["energy"],
                ),

                "overall_volume": safe_float(
                    row["overall_volume"],
                ),

                "folder": safe_str(
                    row["folder"],
                ),

                "keywords": split_text_list(
                    row["keywords"],
                ),

                "country": safe_str(
                    row["country"],
                ),

                "duration": safe_str(
                    row["duration"],
                ),

                "cover_image": safe_str(
                    row["cover_image"],
                ),

                "comments": safe_str(
                    row["comments"],
                ),

                "date_added": normalize_date(
                    row["date_added"],
                ),

                "rating": safe_int(
                    row["rating"],
                ),
            }

        return output

    finally:
        connection.close()


# ============================================================
# CARGAR ARTIST_FEATURES.DB
# ============================================================

def load_artist_catalog() -> Dict[str, Dict[str, Any]]:
    if not INCLUDE_ARTIST_DETAILS:
        return {}

    if not validate_file(
        ARTIST_DB_PATH,
        required=False,
    ):
        log(
            "ARTIST_FEATURES.db no encontrado. "
            "artistDetails será null."
        )

        return {}

    connection = get_connection(
        ARTIST_DB_PATH,
    )

    try:
        table_name = get_real_table_name(
            connection,
            "Artist",
        )

        if not table_name:
            log(
                "No se encontró la tabla Artist "
                "en ARTIST_FEATURES.db."
            )

            return {}

        columns = get_table_columns(
            connection,
            table_name,
        )

        aliases = {
            "artist_id": [
                "ArtistID",
                "Artist ID",
                "artist_id",
            ],

            "artist": [
                "Artist",
                "Name",
                "ArtistName",
                "Artist Name",
            ],

            "alias": [
                "Alias",
                "Aliases",
            ],

            "image_url": [
                "ImageURL",
                "Image URL",
                "SpotifyImage",
                "Spotify Image",
                "ArtistImage",
                "Artist Image",
                "Image",
            ],

            "genres": [
                "Genres",
                "Genre",
                "SpotifyGenres",
                "Spotify Genres",
            ],

            "country": [
                "Country",
            ],

            "spotify_url": [
                "SpotifyURL",
                "Spotify URL",
                "Spotify_URL",
            ],

            "musicbrainz_id": [
                "MusicBrainzID",
                "MusicBrainz ID",
                "MBID",
            ],

            "popularity": [
                "Popularity",
                "SpotifyPopularity",
                "Spotify Popularity",
            ],

            "followers": [
                "Followers",
                "SpotifyFollowers",
                "Spotify Followers",
            ],
        }

        real_columns = {
            internal_name: find_real_column(
                columns,
                column_aliases,
            )
            for internal_name, column_aliases
            in aliases.items()
        }

        if not real_columns["artist"]:
            log(
                "La tabla Artist no contiene "
                "una columna de nombre de artista reconocible."
            )

            return {}

        select_clause = build_dynamic_select(
            real_columns,
        )

        query = f"""
            SELECT
                {select_clause}
            FROM {quote_identifier(table_name)}
        """

        output: Dict[str, Dict[str, Any]] = {}

        for row in connection.execute(
            query,
        ):
            artist_name = safe_str(
                row["artist"],
            )

            if not artist_name:
                continue

            details = {
                "artistId": (
                    str(row["artist_id"])
                    if not is_empty(
                        row["artist_id"],
                    )
                    else None
                ),

                "imageUrl": safe_str(
                    row["image_url"],
                ),

                "genres": split_text_list(
                    row["genres"],
                ),

                "country": safe_str(
                    row["country"],
                ),

                "spotifyUrl": safe_str(
                    row["spotify_url"],
                ),

                "musicBrainzId": safe_str(
                    row["musicbrainz_id"],
                ),

                "popularity": safe_int(
                    row["popularity"],
                ),

                "followers": safe_int(
                    row["followers"],
                ),
            }

            artist_names = [
                artist_name,
                *split_text_list(
                    row["alias"],
                ),
            ]

            for name in artist_names:
                normalized_name = normalize_text(
                    name,
                )

                if (
                    normalized_name
                    and normalized_name not in output
                ):
                    output[normalized_name] = details

        return output

    finally:
        connection.close()


def get_main_artist_name(
    artist_text: Optional[str],
) -> Optional[str]:
    if not artist_text:
        return None

    return artist_text.split(",")[0].strip()


def find_artist_details(
    artist_text: Optional[str],
    artist_catalog: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    main_artist = get_main_artist_name(
        artist_text,
    )

    if not main_artist:
        return None

    return artist_catalog.get(
        normalize_text(
            main_artist,
        ),
    )


# ============================================================
# CONSTRUIR EL TRACK FINAL
# ============================================================

def build_track(
    song_id: int,
    si_row: Dict[str, Any],
    ts_row: Optional[Dict[str, Any]],
    spotify_url_from_sp: Optional[str],
    dj_row: Optional[Dict[str, Any]],
    artist_catalog: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:

    ts_row = ts_row or {}
    dj_row = dj_row or {}

    title = safe_str(
        first_not_empty(
            si_row.get("title"),
            dj_row.get("title"),
        )
    )

    artist = safe_str(
        first_not_empty(
            si_row.get("artist"),
            dj_row.get("artist"),
        )
    )

    album = safe_str(
        first_not_empty(
            ts_row.get("album"),
            dj_row.get("album"),
        )
    )

    artwork_url = safe_str(
        first_not_empty(
            ts_row.get("cover_image"),
            dj_row.get("cover_image"),
        )
    )

    duration_raw = first_not_empty(
        ts_row.get("duration"),
        dj_row.get("duration"),
    )

    duration_seconds = parse_duration_to_seconds(
        duration_raw,
    )

    popularity = safe_int(
        first_not_empty(
            ts_row.get("popularity"),
            dj_row.get("popularity"),
        )
    )

    release_date = normalize_date(
        first_not_empty(
            ts_row.get("release_date"),
            dj_row.get("release_date"),
        )
    )

    genre = safe_str(
        first_not_empty(
            ts_row.get("genre"),
            dj_row.get("genre"),
        )
    )

    spotify_url = safe_str(
        first_not_empty(
            spotify_url_from_sp,
            dj_row.get("spotify_url"),
        )
    )

    artist_details = find_artist_details(
        artist,
        artist_catalog,
    )

    artist_country = None

    if artist_details:
        artist_country = artist_details.get(
            "country",
        )

    country = safe_str(
        first_not_empty(
            dj_row.get("country"),
            artist_country,
        )
    )

    return {
        "id": str(song_id),

        "externalSongId": str(song_id),

        "title": (
            title
            or "Unknown title"
        ),

        "artist": (
            artist
            or "Unknown artist"
        ),

        "album": album,

        "artworkUrl": artwork_url,

        "durationSeconds": duration_seconds,

        "durationDisplay": (
            format_duration(
                duration_seconds,
            )
            if duration_seconds is not None
            else safe_str(
                duration_raw,
            )
        ),

        "releaseDate": release_date,

        "genre": genre,

        "country": country,

        "spotifyPopularity": popularity,

        "spotifyUrl": spotify_url,

        "tempo": safe_float(
            dj_row.get("tempo"),
        ),

        "musicalKey": safe_str(
            dj_row.get("musical_key"),
        ),

        "energy": safe_float(
            dj_row.get("energy"),
        ),

        "overallVolume": safe_float(
            dj_row.get("overall_volume"),
        ),

        "cuePoints": safe_str(
            dj_row.get("cue_points"),
        ),

        "keywords": list(
            dj_row.get(
                "keywords",
                [],
            )
        ),

        "comments": safe_str(
            dj_row.get("comments"),
        ),

        "folder": safe_str(
            dj_row.get("folder"),
        ),

        "dateAdded": normalize_date(
            dj_row.get("date_added"),
        ),

        "rating": safe_int(
            dj_row.get("rating"),
        ),

        "artistDetails": (
            dict(artist_details)
            if artist_details
            else None
        ),
    }


# ============================================================
# VALIDACIÓN DE DATOS COMPLETOS
# ============================================================

def has_meaningful_value(
    value: Any,
) -> bool:
    """
    Devuelve True cuando el valor contiene información útil.

    Rechaza:
    - None
    - strings vacíos
    - "null", "none", "nan", "n/a", "na"
    - listas, sets, tuples o diccionarios vacíos

    Acepta números, incluyendo 0 y valores negativos.
    """

    if value is None:
        return False

    if isinstance(value, str):
        normalized = value.strip().lower()

        return normalized not in {
            "",
            "null",
            "none",
            "nan",
            "n/a",
            "na",
        }

    if isinstance(value, (int, float)):
        return True

    if isinstance(value, (list, tuple, set, dict)):
        return len(value) > 0

    return True


def get_missing_required_fields(
    track: Dict[str, Any],
) -> List[str]:
    """
    Retorna los campos obligatorios que faltan en una canción.
    También valida que BPM y duración sean mayores que cero.
    """

    missing_fields = [
        field_name
        for field_name in REQUIRED_TRACK_FIELDS
        if not has_meaningful_value(
            track.get(field_name),
        )
    ]

    tempo = safe_float(
        track.get("tempo"),
    )

    if (
        "tempo" not in missing_fields
        and (
            tempo is None
            or tempo <= 0
        )
    ):
        missing_fields.append(
            "tempo",
        )

    duration_seconds = safe_int(
        track.get("durationSeconds"),
    )

    if (
        "durationSeconds" not in missing_fields
        and (
            duration_seconds is None
            or duration_seconds <= 0
        )
    ):
        missing_fields.append(
            "durationSeconds",
        )

    return missing_fields


def track_has_complete_data(
    track: Dict[str, Any],
) -> bool:
    return not get_missing_required_fields(
        track,
    )


# ============================================================
# FILTROS
# ============================================================

def track_matches_filters(
    track: Dict[str, Any],
) -> bool:

    if FILTERS.get(
        "require_complete_track",
        False,
    ):
        if not track_has_complete_data(
            track,
        ):
            return False

    genres_any = FILTERS.get(
        "genres_any",
        [],
    )

    if (
        genres_any
        and not value_contains_any(
            track.get("genre"),
            genres_any,
        )
    ):
        return False

    genres_exclude = FILTERS.get(
        "genres_exclude",
        [],
    )

    if not value_contains_none(
        track.get("genre"),
        genres_exclude,
    ):
        return False

    popularity = safe_int(
        track.get(
            "spotifyPopularity",
        )
    )

    popularity_min = safe_int(
        FILTERS.get(
            "popularity_min",
        )
    )

    popularity_max = safe_int(
        FILTERS.get(
            "popularity_max",
        )
    )

    if popularity_min is not None:
        if (
            popularity is None
            or popularity < popularity_min
        ):
            return False

    if popularity_max is not None:
        if (
            popularity is None
            or popularity > popularity_max
        ):
            return False

    release_date = safe_str(
        track.get("releaseDate"),
    )

    release_date_from = safe_str(
        FILTERS.get(
            "release_date_from",
        )
    )

    release_date_to = safe_str(
        FILTERS.get(
            "release_date_to",
        )
    )

    if release_date_from:
        if (
            not release_date
            or release_date < release_date_from
        ):
            return False

    if release_date_to:
        if (
            not release_date
            or release_date > release_date_to
        ):
            return False

    artists_any = FILTERS.get(
        "artists_any",
        [],
    )

    if (
        artists_any
        and not value_contains_any(
            track.get("artist"),
            artists_any,
        )
    ):
        return False

    title_contains_any = FILTERS.get(
        "title_contains_any",
        [],
    )

    if (
        title_contains_any
        and not value_contains_any(
            track.get("title"),
            title_contains_any,
        )
    ):
        return False

    keywords_any = normalize_string_list(
        FILTERS.get(
            "keywords_any",
            [],
        )
    )

    if keywords_any:
        track_keywords = {
            normalize_text(keyword)
            for keyword in track.get(
                "keywords",
                [],
            )
        }

        has_allowed_keyword = any(
            keyword in track_keywords
            for keyword in keywords_any
        )

        if not has_allowed_keyword:
            return False

    countries_any = normalize_string_list(
        FILTERS.get(
            "countries_any",
            [],
        )
    )

    if countries_any:
        country = normalize_text(
            track.get("country"),
        )

        if country not in countries_any:
            return False

    return True


# ============================================================
# ORDEN
# ============================================================

SORT_FIELD_MAP = {
    "popularity": "spotifyPopularity",
    "releaseDate": "releaseDate",
    "title": "title",
    "artist": "artist",
    "tempo": "tempo",
    "energy": "energy",
}


def sort_tracks(
    tracks: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Ordena usando:

    1. El campo seleccionado en SORT_BY.
    2. Spotify Popularity DESC como criterio secundario.
    3. Title ASC.
    4. Artist ASC.

    Ejemplo:
        SORT_BY = "tempo"
        SORT_DESCENDING = True

    Resultado:
        Tempo DESC -> Popularity DESC -> Title ASC -> Artist ASC

    Python usa un sort estable. Primero se prepara el orden
    secundario y luego se aplica el orden principal.
    """

    primary_field = SORT_FIELD_MAP.get(
        SORT_BY,
        "spotifyPopularity",
    )

    ordered_tracks = list(
        tracks,
    )

    # Desempate final alfabético.
    ordered_tracks.sort(
        key=lambda track: (
            normalize_text(
                track.get("title"),
            ),
            normalize_text(
                track.get("artist"),
            ),
        )
    )

    # Popularity siempre queda como segundo criterio,
    # en orden descendente.
    ordered_tracks.sort(
        key=lambda track: (
            safe_int(
                track.get(
                    "spotifyPopularity",
                )
            )
            if safe_int(
                track.get(
                    "spotifyPopularity",
                )
            ) is not None
            else -1
        ),
        reverse=True,
    )

    # Si Popularity es el criterio principal, no hace falta
    # aplicar otro sort, salvo que se pida ascendente.
    if primary_field == "spotifyPopularity":
        if not SORT_DESCENDING:
            ordered_tracks.sort(
                key=lambda track: (
                    safe_int(
                        track.get(
                            "spotifyPopularity",
                        )
                    )
                    if safe_int(
                        track.get(
                            "spotifyPopularity",
                        )
                    ) is not None
                    else float("inf")
                )
            )

        return ordered_tracks

    numeric_fields = {
        "tempo",
        "energy",
    }

    if primary_field in numeric_fields:
        ordered_tracks.sort(
            key=lambda track: (
                safe_float(
                    track.get(
                        primary_field,
                    )
                )
                if safe_float(
                    track.get(
                        primary_field,
                    )
                ) is not None
                else (
                    float("-inf")
                    if SORT_DESCENDING
                    else float("inf")
                )
            ),
            reverse=SORT_DESCENDING,
        )

        return ordered_tracks

    ordered_tracks.sort(
        key=lambda track: normalize_text(
            track.get(
                primary_field,
            )
        ),
        reverse=SORT_DESCENDING,
    )

    return ordered_tracks


# ============================================================
# CREAR PLAYLIST
# ============================================================

def create_playlist_json() -> Dict[str, Any]:

    log("============================================")
    log("FLAMINGOAPP DJ - JSON PLAYLIST CREATOR")
    log("============================================")

    log("")
    log(f"Proyecto React: {PROJECT_ROOT}")
    log(f"Salida JSON: {OUTPUT_JSON_DIR}")

    log("")
    log("Cargando SI.db...")
    si_catalog = load_si_catalog()
    log(f"SI tracks: {len(si_catalog)}")

    log("")
    log("Cargando TS.db...")
    ts_catalog = load_ts_catalog()
    log(f"TS tracks: {len(ts_catalog)}")

    log("")
    log("Cargando SP.db...")
    spotify_catalog = load_spotify_catalog()
    log(f"SP tracks: {len(spotify_catalog)}")

    log("")
    log("Cargando DJ.db...")
    dj_catalog = load_dj_catalog()
    log(f"DJ tracks: {len(dj_catalog)}")

    log("")
    log("Cargando ARTIST_FEATURES.db...")
    artist_catalog = load_artist_catalog()
    log(f"Artistas disponibles: {len(artist_catalog)}")

    tracks: List[Dict[str, Any]] = []

    total_processed = 0
    total_filtered_out = 0

    missing_fields_count: Dict[str, int] = {
        field_name: 0
        for field_name in REQUIRED_TRACK_FIELDS
    }

    log("")
    log("Construyendo y filtrando tracks...")

    for song_id, si_row in si_catalog.items():
        total_processed += 1

        track = build_track(
            song_id=song_id,

            si_row=si_row,

            ts_row=ts_catalog.get(
                song_id,
            ),

            spotify_url_from_sp=spotify_catalog.get(
                song_id,
            ),

            dj_row=dj_catalog.get(
                song_id,
            ),

            artist_catalog=artist_catalog,
        )

        missing_fields = get_missing_required_fields(
            track,
        )

        for field_name in missing_fields:
            missing_fields_count[
                field_name
            ] += 1

        if not track_matches_filters(
            track,
        ):
            total_filtered_out += 1
            continue

        tracks.append(
            track,
        )

    log("")
    log("Campos obligatorios faltantes antes del filtro:")

    for field_name in REQUIRED_TRACK_FIELDS:
        log(
            f"  {field_name}: "
            f"{missing_fields_count[field_name]}"
        )

    tracks = sort_tracks(
        tracks,
    )

    if MAX_TRACKS is not None:
        tracks = tracks[
            :MAX_TRACKS
        ]

    generated_at = (
        datetime
        .now()
        .astimezone()
        .isoformat(
            timespec="seconds",
        )
    )

    playlist: Dict[str, Any] = {
        "schemaVersion": 1,

        "playlistId": PLAYLIST_ID,

        "playlistName": PLAYLIST_NAME,

        "description": PLAYLIST_DESCRIPTION,

        "totalTracks": len(tracks),

        "generatedAt": generated_at,

        "filters": FILTERS,

        "sort": {
            "field": SORT_BY,
            "descending": SORT_DESCENDING,
            "secondaryField": "popularity",
            "secondaryDescending": True,
        },

        "tracks": tracks,
    }

    if INCLUDE_EXPORT_METADATA:
        playlist["source"] = {
            "catalogDatabase": os.path.basename(
                SI_DB_PATH,
            ),

            "metadataDatabase": os.path.basename(
                TS_DB_PATH,
            ),

            "spotifyDatabase": os.path.basename(
                SP_DB_PATH,
            ),

            "djDatabase": os.path.basename(
                DJ_DB_PATH,
            ),

            "artistDatabase": os.path.basename(
                ARTIST_DB_PATH,
            ),

            "processedTracks": total_processed,

            "filteredOutTracks": total_filtered_out,

            "requiredTrackFields": REQUIRED_TRACK_FIELDS,

            "missingFieldsCount": missing_fields_count,

            "outputDirectory": OUTPUT_JSON_DIR,
        }

    return playlist


# ============================================================
# GUARDAR PLAYLIST
# ============================================================

def save_playlist_json(
    playlist: Dict[str, Any],
) -> str:

    os.makedirs(
        OUTPUT_JSON_DIR,
        exist_ok=True,
    )

    output_path = os.path.join(
        OUTPUT_JSON_DIR,
        OUTPUT_JSON_NAME,
    )

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            playlist,
            file,
            ensure_ascii=False,
            indent=JSON_INDENT,
        )

    return output_path


# ============================================================
# VALIDAR RUTAS
# ============================================================

def validate_project_paths() -> None:

    if not os.path.isdir(
        PROJECT_ROOT,
    ):
        raise FileNotFoundError(
            "No se encontró la carpeta del proyecto React:\n"
            f"{PROJECT_ROOT}"
        )

    src_dir = os.path.join(
        PROJECT_ROOT,
        "src",
    )

    if not os.path.isdir(
        src_dir,
    ):
        raise FileNotFoundError(
            "No se encontró la carpeta src del proyecto:\n"
            f"{src_dir}"
        )

    os.makedirs(
        OUTPUT_JSON_DIR,
        exist_ok=True,
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    validate_project_paths()

    playlist = create_playlist_json()

    output_path = save_playlist_json(
        playlist,
    )

    log("")
    log("============================================")
    log("JSON CREADO CORRECTAMENTE")
    log("============================================")
    log(f"Playlist: {PLAYLIST_NAME}")
    log(f"Tracks: {playlist['totalTracks']}")
    log(f"Archivo: {output_path}")
    log("============================================")


if __name__ == "__main__":
    main()