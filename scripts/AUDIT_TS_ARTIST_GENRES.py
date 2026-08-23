#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
01_AUDIT_TS_ARTIST_GENRES.py

Objetivo
--------
1. Leer todos los géneros disponibles en TS.db.
2. Usar SI.db para resolver SongID -> Title / Artist.
3. Usar ARTIST_FEATURES.db como fuente secundaria de géneros cuando TS.Genre
   esté vacío, sea NULL o no contenga información útil.
4. Generar archivos de auditoría para construir posteriormente:
   - una taxonomía multi-label de estilos;
   - relaciones "same style";
   - relaciones "cross style";
   - futuras smart playlists;
   - el motor Match Songs de FlamingoApp DJ.

Este script:
- NO modifica ninguna base de datos.
- Inspecciona automáticamente tablas y columnas.
- Prioriza siempre el género de TS.db.
- Solo usa ARTIST_FEATURES.db como fallback cuando TS no tiene género.
- Conserva por separado los géneros del track y del artista.
- Soporta canciones con varios artistas mediante:
  1) búsqueda del nombre completo;
  2) división controlada solo cuando no existe coincidencia completa.
- Produce CSV y JSON en una carpeta GENRE_AUDIT.

Configuración
-------------
Modifica únicamente las rutas de la sección CONFIGURATION si tus bases
no están en la carpeta indicada.
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence


# =============================================================================
# CONFIGURATION
# =============================================================================

DB_ROOT = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
)

TS_DB_PATH = DB_ROOT / "TS.db"
SI_DB_PATH = DB_ROOT / "SI.db"
ARTIST_FEATURES_DB_PATH = (
    DB_ROOT / "ARTIST_FEATURES.db"
)

OUTPUT_DIR = DB_ROOT / "GENRE_AUDIT"

# Si ya sabes los nombres exactos, puedes fijarlos aquí.
# Deja None para que el script los detecte automáticamente.
TS_TABLE_OVERRIDE: str | None = None
SI_TABLE_OVERRIDE: str | None = None
ARTIST_TABLE_OVERRIDE: str | None = None

TS_SONG_ID_OVERRIDE: str | None = None
TS_GENRE_OVERRIDE: str | None = None

SI_SONG_ID_OVERRIDE: str | None = None
SI_TITLE_OVERRIDE: str | None = None
SI_ARTIST_OVERRIDE: str | None = None

ARTIST_NAME_OVERRIDE: str | None = None
ARTIST_GENRE_OVERRIDE: str | None = None
ARTIST_ID_OVERRIDE: str | None = None

# Cuando True, también incorpora Artist_Genres en Resolved_Genres aunque
# el track ya tenga género en TS.
#
# Recomendación inicial: False.
# Así el campo resolved representa estrictamente:
# TS primero, artista solo como fallback.
INCLUDE_ARTIST_GENRES_WHEN_TS_EXISTS = False

# Separadores utilizados para campos que contienen múltiples géneros.
GENRE_SPLIT_PATTERN = re.compile(
    r"\s*(?:\||;|/|•|\u2022|\n|\r|\t)\s*"
)

# Algunas columnas guardan listas JSON:
# ["pop", "rock"] o {"genres": ["pop", "rock"]}
JSON_GENRE_KEYS = (
    "genres",
    "genre",
    "styles",
    "style",
    "tags",
)

# Palabras que no deben tratarse como géneros válidos.
EMPTY_GENRE_VALUES = {
    "",
    "none",
    "null",
    "n/a",
    "na",
    "unknown",
    "undefined",
    "not available",
    "sin genero",
    "sin género",
    "no genre",
    "-",
    "--",
}

# Columnas candidatas. La detección no distingue mayúsculas.
SONG_ID_CANDIDATES = (
    "songid",
    "song_id",
    "trackid",
    "track_id",
    "id_song",
)

TITLE_CANDIDATES = (
    "title",
    "track",
    "track_name",
    "song",
    "song_name",
    "name",
)

TRACK_ARTIST_CANDIDATES = (
    "artist",
    "artists",
    "artist_name",
    "artistname",
    "performer",
)

GENRE_CANDIDATES = (
    "genre",
    "genres",
    "artist_genres",
    "spotify_genres",
    "musicbrainz_genres",
    "style",
    "styles",
    "tags",
)

ARTIST_NAME_CANDIDATES = (
    "artist",
    "artist_name",
    "artistname",
    "name",
    "canonical_name",
    "spotify_name",
    "musicbrainz_name",
)

ARTIST_ID_CANDIDATES = (
    "artistid",
    "artist_id",
    "spotify_artist_id",
    "musicbrainz_artist_id",
    "id",
)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass(frozen=True)
class TableSchema:
    database: Path
    table: str
    columns: tuple[str, ...]


@dataclass(frozen=True)
class TsSchema:
    table: str
    song_id: str
    genre: str


@dataclass(frozen=True)
class SiSchema:
    table: str
    song_id: str
    title: str
    artist: str


@dataclass(frozen=True)
class ArtistSchema:
    table: str
    artist_name: str
    genre: str
    artist_id: str | None


@dataclass
class ArtistGenreRecord:
    artist_name: str
    normalized_artist: str
    artist_id: str
    genres: list[str]


# =============================================================================
# TEXT NORMALIZATION
# =============================================================================

def safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize(
        "NFKD",
        value,
    )
    return "".join(
        char
        for char in normalized
        if not unicodedata.combining(char)
    )


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_lookup_text(value: Any) -> str:
    """
    Normalización para buscar nombres de artistas.

    No elimina completamente conectores como '&' porque primero intentamos
    encontrar el nombre completo. Sí elimina puntuación no significativa.
    """
    text = safe_text(value)
    if not text:
        return ""

    text = strip_accents(text).lower()
    text = text.replace("’", "'")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = re.sub(
        r"\b(featuring|feat\.?|ft\.?)\b",
        " feat ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"[^\w&+,' -]+", " ", text)
    text = normalize_spaces(text)
    return text


def normalize_genre_label(value: Any) -> str:
    """
    Conserva un label legible, pero normaliza:
    - espacios;
    - acentos;
    - mayúsculas;
    - guiones;
    - puntuación exterior.
    """
    text = safe_text(value)
    if not text:
        return ""

    text = strip_accents(text).lower()
    text = text.replace("_", " ")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = re.sub(r"\s*-\s*", "-", text)
    text = re.sub(r"[\"'`]+", "", text)
    text = normalize_spaces(text)
    text = text.strip(" ,;|/[]{}()")

    if text in EMPTY_GENRE_VALUES:
        return ""

    return text


def unique_preserve_order(
    values: Iterable[str],
) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for value in values:
        normalized = normalize_genre_label(value)
        if not normalized:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)

    return result


# =============================================================================
# GENRE PARSING
# =============================================================================

def extract_genres_from_json(
    value: Any,
) -> list[str]:
    result: list[str] = []

    if isinstance(value, str):
        result.append(value)
        return result

    if isinstance(value, Sequence) and not isinstance(
        value,
        (bytes, bytearray),
    ):
        for item in value:
            result.extend(
                extract_genres_from_json(item)
            )
        return result

    if isinstance(value, Mapping):
        found_named_key = False

        for key in JSON_GENRE_KEYS:
            if key in value:
                found_named_key = True
                result.extend(
                    extract_genres_from_json(
                        value[key],
                    )
                )

        if not found_named_key:
            for nested in value.values():
                if isinstance(
                    nested,
                    (list, tuple, set),
                ):
                    result.extend(
                        extract_genres_from_json(
                            nested,
                        )
                    )

    return result


def parse_genres(value: Any) -> list[str]:
    """
    Convierte distintos formatos a una lista normalizada.

    Soporta:
    - NULL;
    - string único;
    - strings separados por | ; / o saltos de línea;
    - listas JSON;
    - diccionarios JSON.

    No divide automáticamente por coma porque géneros o etiquetas pueden
    contener comas. Una lista JSON con comas sí se interpreta correctamente.
    """
    text = safe_text(value)
    if not text:
        return []

    parsed_json: Any = None

    if (
        text.startswith("[")
        or text.startswith("{")
    ):
        try:
            parsed_json = json.loads(text)
        except json.JSONDecodeError:
            parsed_json = None

    if parsed_json is not None:
        return unique_preserve_order(
            extract_genres_from_json(
                parsed_json,
            )
        )

    pieces = GENRE_SPLIT_PATTERN.split(text)

    if len(pieces) == 1:
        pieces = [text]

    return unique_preserve_order(pieces)


# =============================================================================
# SQLITE INTROSPECTION
# =============================================================================

def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def open_readonly_database(
    path: Path,
) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(
            f"No se encontró la base de datos: {path}"
        )

    uri = f"{path.resolve().as_uri()}?mode=ro"

    connection = sqlite3.connect(
        uri,
        uri=True,
    )
    connection.row_factory = sqlite3.Row
    return connection


def list_tables(
    connection: sqlite3.Connection,
) -> list[str]:
    query = """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """
    return [
        safe_text(row["name"])
        for row in connection.execute(query)
    ]


def table_columns(
    connection: sqlite3.Connection,
    table: str,
) -> list[str]:
    query = (
        f"PRAGMA table_info("
        f"{quote_identifier(table)}"
        f")"
    )
    return [
        safe_text(row["name"])
        for row in connection.execute(query)
    ]


def inspect_database(
    path: Path,
) -> list[TableSchema]:
    with open_readonly_database(path) as connection:
        return [
            TableSchema(
                database=path,
                table=table,
                columns=tuple(
                    table_columns(
                        connection,
                        table,
                    )
                ),
            )
            for table in list_tables(connection)
        ]


def lower_column_map(
    columns: Sequence[str],
) -> dict[str, str]:
    return {
        column.lower(): column
        for column in columns
    }


def find_candidate_column(
    columns: Sequence[str],
    candidates: Sequence[str],
    override: str | None = None,
) -> str | None:
    column_map = lower_column_map(columns)

    if override:
        exact = column_map.get(
            override.lower(),
        )
        if not exact:
            raise ValueError(
                f"La columna configurada '{override}' "
                f"no existe. Disponibles: "
                f"{', '.join(columns)}"
            )
        return exact

    for candidate in candidates:
        match = column_map.get(
            candidate.lower(),
        )
        if match:
            return match

    return None


def choose_table(
    schemas: Sequence[TableSchema],
    required_groups: Sequence[
        Sequence[str]
    ],
    override: str | None = None,
) -> TableSchema:
    if override:
        for schema in schemas:
            if (
                schema.table.lower()
                == override.lower()
            ):
                return schema

        available = ", ".join(
            schema.table
            for schema in schemas
        )
        raise ValueError(
            f"La tabla configurada '{override}' "
            f"no existe. Disponibles: {available}"
        )

    scored: list[
        tuple[int, int, TableSchema]
    ] = []

    for schema in schemas:
        columns_lower = {
            column.lower()
            for column in schema.columns
        }

        matched_groups = 0

        for group in required_groups:
            if any(
                candidate.lower()
                in columns_lower
                for candidate in group
            ):
                matched_groups += 1

        scored.append(
            (
                matched_groups,
                len(schema.columns),
                schema,
            )
        )

    scored.sort(
        key=lambda item: (
            item[0],
            item[1],
        ),
        reverse=True,
    )

    if (
        not scored
        or scored[0][0]
        < len(required_groups)
    ):
        details = "\n".join(
            f"  - {schema.table}: "
            f"{', '.join(schema.columns)}"
            for schema in schemas
        )
        raise ValueError(
            "No se encontró una tabla con todas "
            "las columnas requeridas.\n"
            f"Tablas inspeccionadas:\n{details}"
        )

    return scored[0][2]


def detect_ts_schema(
    path: Path,
) -> TsSchema:
    schemas = inspect_database(path)

    table = choose_table(
        schemas,
        (
            SONG_ID_CANDIDATES,
            GENRE_CANDIDATES,
        ),
        TS_TABLE_OVERRIDE,
    )

    song_id = find_candidate_column(
        table.columns,
        SONG_ID_CANDIDATES,
        TS_SONG_ID_OVERRIDE,
    )
    genre = find_candidate_column(
        table.columns,
        GENRE_CANDIDATES,
        TS_GENRE_OVERRIDE,
    )

    if not song_id or not genre:
        raise ValueError(
            "No fue posible detectar el esquema "
            "de TS.db."
        )

    return TsSchema(
        table=table.table,
        song_id=song_id,
        genre=genre,
    )


def detect_si_schema(
    path: Path,
) -> SiSchema:
    schemas = inspect_database(path)

    table = choose_table(
        schemas,
        (
            SONG_ID_CANDIDATES,
            TITLE_CANDIDATES,
            TRACK_ARTIST_CANDIDATES,
        ),
        SI_TABLE_OVERRIDE,
    )

    song_id = find_candidate_column(
        table.columns,
        SONG_ID_CANDIDATES,
        SI_SONG_ID_OVERRIDE,
    )
    title = find_candidate_column(
        table.columns,
        TITLE_CANDIDATES,
        SI_TITLE_OVERRIDE,
    )
    artist = find_candidate_column(
        table.columns,
        TRACK_ARTIST_CANDIDATES,
        SI_ARTIST_OVERRIDE,
    )

    if not song_id or not title or not artist:
        raise ValueError(
            "No fue posible detectar el esquema "
            "de SI.db."
        )

    return SiSchema(
        table=table.table,
        song_id=song_id,
        title=title,
        artist=artist,
    )


def detect_artist_schema(
    path: Path,
) -> ArtistSchema:
    schemas = inspect_database(path)

    table = choose_table(
        schemas,
        (
            ARTIST_NAME_CANDIDATES,
            GENRE_CANDIDATES,
        ),
        ARTIST_TABLE_OVERRIDE,
    )

    artist_name = find_candidate_column(
        table.columns,
        ARTIST_NAME_CANDIDATES,
        ARTIST_NAME_OVERRIDE,
    )
    genre = find_candidate_column(
        table.columns,
        GENRE_CANDIDATES,
        ARTIST_GENRE_OVERRIDE,
    )
    artist_id = find_candidate_column(
        table.columns,
        ARTIST_ID_CANDIDATES,
        ARTIST_ID_OVERRIDE,
    )

    if not artist_name or not genre:
        raise ValueError(
            "No fue posible detectar el esquema "
            "de ARTIST_FEATURES.db."
        )

    return ArtistSchema(
        table=table.table,
        artist_name=artist_name,
        genre=genre,
        artist_id=artist_id,
    )


# =============================================================================
# DATABASE LOADERS
# =============================================================================

def load_si_tracks(
    path: Path,
    schema: SiSchema,
) -> dict[str, dict[str, str]]:
    query = f"""
        SELECT
            {quote_identifier(schema.song_id)}
                AS song_id,
            {quote_identifier(schema.title)}
                AS title,
            {quote_identifier(schema.artist)}
                AS artist
        FROM {quote_identifier(schema.table)}
    """

    tracks: dict[
        str,
        dict[str, str],
    ] = {}

    with open_readonly_database(path) as connection:
        for row in connection.execute(query):
            song_id = safe_text(row["song_id"])
            if not song_id:
                continue

            tracks[song_id] = {
                "song_id": song_id,
                "title": safe_text(
                    row["title"],
                ),
                "artist": safe_text(
                    row["artist"],
                ),
            }

    return tracks


def load_ts_genres(
    path: Path,
    schema: TsSchema,
) -> dict[str, list[str]]:
    query = f"""
        SELECT
            {quote_identifier(schema.song_id)}
                AS song_id,
            {quote_identifier(schema.genre)}
                AS genre
        FROM {quote_identifier(schema.table)}
    """

    genres_by_song: dict[
        str,
        list[str],
    ] = defaultdict(list)

    with open_readonly_database(path) as connection:
        for row in connection.execute(query):
            song_id = safe_text(row["song_id"])
            if not song_id:
                continue

            genres_by_song[
                song_id
            ].extend(
                parse_genres(
                    row["genre"],
                )
            )

    return {
        song_id: unique_preserve_order(
            genres,
        )
        for song_id, genres
        in genres_by_song.items()
    }


def load_artist_features(
    path: Path,
    schema: ArtistSchema,
) -> list[ArtistGenreRecord]:
    artist_id_sql = (
        quote_identifier(
            schema.artist_id,
        )
        if schema.artist_id
        else "NULL"
    )

    query = f"""
        SELECT
            {quote_identifier(schema.artist_name)}
                AS artist_name,
            {quote_identifier(schema.genre)}
                AS genre,
            {artist_id_sql}
                AS artist_id
        FROM {quote_identifier(schema.table)}
    """

    records: list[
        ArtistGenreRecord
    ] = []

    with open_readonly_database(path) as connection:
        for row in connection.execute(query):
            artist_name = safe_text(
                row["artist_name"],
            )
            normalized_artist = (
                normalize_lookup_text(
                    artist_name,
                )
            )

            if not normalized_artist:
                continue

            genres = parse_genres(
                row["genre"],
            )

            if not genres:
                continue

            records.append(
                ArtistGenreRecord(
                    artist_name=artist_name,
                    normalized_artist=(
                        normalized_artist
                    ),
                    artist_id=safe_text(
                        row["artist_id"],
                    ),
                    genres=genres,
                )
            )

    return records


def build_artist_index(
    records: Sequence[
        ArtistGenreRecord
    ],
) -> dict[
    str,
    list[ArtistGenreRecord],
]:
    index: dict[
        str,
        list[ArtistGenreRecord],
    ] = defaultdict(list)

    for record in records:
        index[
            record.normalized_artist
        ].append(record)

    return dict(index)


# =============================================================================
# ARTIST RESOLUTION
# =============================================================================

FEAT_SPLIT_RE = re.compile(
    r"\s+\b(?:feat(?:uring)?\.?|ft\.?)\b\s+",
    flags=re.IGNORECASE,
)

AMPERSAND_SPLIT_RE = re.compile(
    r"\s+(?:&|\+|x)\s+",
    flags=re.IGNORECASE,
)

COMMA_SPLIT_RE = re.compile(
    r"\s*,\s*"
)


def split_artist_candidates(
    artist_text: str,
) -> list[str]:
    """
    División conservadora.

    La función solo se usa después de que el nombre completo no haya
    coincidido en ARTIST_FEATURES.

    Orden:
    - feat / featuring / ft;
    - ampersand, + o x con espacios;
    - coma.

    Ejemplos preservados si existe match completo:
    - Earth, Wind & Fire
    - Tyler, The Creator
    """
    value = normalize_spaces(
        safe_text(artist_text)
    )

    if not value:
        return []

    parts = [value]

    splitters = (
        FEAT_SPLIT_RE,
        AMPERSAND_SPLIT_RE,
        COMMA_SPLIT_RE,
    )

    for splitter in splitters:
        expanded: list[str] = []

        for part in parts:
            matches = splitter.split(
                part,
            )
            expanded.extend(
                match
                for match in matches
                if safe_text(match)
            )

        parts = expanded

    return list(
        dict.fromkeys(
            normalize_spaces(part)
            for part in parts
            if normalize_spaces(part)
        )
    )


def collect_genres_from_records(
    records: Sequence[
        ArtistGenreRecord
    ],
) -> tuple[
    list[str],
    list[str],
    list[str],
]:
    genres: list[str] = []
    matched_names: list[str] = []
    matched_ids: list[str] = []

    for record in records:
        genres.extend(record.genres)
        matched_names.append(
            record.artist_name,
        )
        if record.artist_id:
            matched_ids.append(
                record.artist_id,
            )

    return (
        unique_preserve_order(genres),
        list(
            dict.fromkeys(
                matched_names,
            )
        ),
        list(
            dict.fromkeys(
                matched_ids,
            )
        ),
    )


def resolve_artist_genres(
    raw_artist: str,
    artist_index: Mapping[
        str,
        Sequence[ArtistGenreRecord],
    ],
) -> dict[str, Any]:
    normalized_full = normalize_lookup_text(
        raw_artist,
    )

    if not normalized_full:
        return {
            "genres": [],
            "match_type": "empty_artist",
            "matched_artists": [],
            "matched_artist_ids": [],
            "artist_parts": [],
        }

    full_records = artist_index.get(
        normalized_full,
        (),
    )

    if full_records:
        (
            genres,
            matched_artists,
            matched_artist_ids,
        ) = collect_genres_from_records(
            full_records,
        )

        return {
            "genres": genres,
            "match_type": "full_artist",
            "matched_artists": (
                matched_artists
            ),
            "matched_artist_ids": (
                matched_artist_ids
            ),
            "artist_parts": [
                raw_artist,
            ],
        }

    parts = split_artist_candidates(
        raw_artist,
    )

    if len(parts) <= 1:
        return {
            "genres": [],
            "match_type": "unmatched",
            "matched_artists": [],
            "matched_artist_ids": [],
            "artist_parts": parts,
        }

    all_records: list[
        ArtistGenreRecord
    ] = []
    matched_parts: list[str] = []
    unmatched_parts: list[str] = []

    for part in parts:
        normalized_part = (
            normalize_lookup_text(part)
        )
        records = artist_index.get(
            normalized_part,
            (),
        )

        if records:
            all_records.extend(records)
            matched_parts.append(part)
        else:
            unmatched_parts.append(part)

    if not all_records:
        return {
            "genres": [],
            "match_type": "split_unmatched",
            "matched_artists": [],
            "matched_artist_ids": [],
            "artist_parts": parts,
            "matched_parts": [],
            "unmatched_parts": (
                unmatched_parts
            ),
        }

    (
        genres,
        matched_artists,
        matched_artist_ids,
    ) = collect_genres_from_records(
        all_records,
    )

    match_type = (
        "split_all"
        if not unmatched_parts
        else "split_partial"
    )

    return {
        "genres": genres,
        "match_type": match_type,
        "matched_artists": (
            matched_artists
        ),
        "matched_artist_ids": (
            matched_artist_ids
        ),
        "artist_parts": parts,
        "matched_parts": matched_parts,
        "unmatched_parts": (
            unmatched_parts
        ),
    }


# =============================================================================
# AUDIT CREATION
# =============================================================================

def join_values(
    values: Iterable[str],
) -> str:
    return " | ".join(
        value
        for value in values
        if safe_text(value)
    )


def make_assignment_rows(
    si_tracks: Mapping[
        str,
        Mapping[str, str],
    ],
    ts_genres: Mapping[
        str,
        Sequence[str],
    ],
    artist_index: Mapping[
        str,
        Sequence[ArtistGenreRecord],
    ],
) -> tuple[
    list[dict[str, Any]],
    dict[str, Any],
]:
    all_song_ids = sorted(
        set(si_tracks)
        | set(ts_genres),
        key=lambda value: (
            not value.isdigit(),
            int(value)
            if value.isdigit()
            else value,
        ),
    )

    rows: list[dict[str, Any]] = []

    source_counter: Counter[str] = (
        Counter()
    )
    artist_match_counter: Counter[str] = (
        Counter()
    )

    ts_genre_counter: Counter[str] = (
        Counter()
    )
    artist_genre_counter: Counter[str] = (
        Counter()
    )
    resolved_genre_counter: Counter[str] = (
        Counter()
    )

    combination_counter: Counter[
        tuple[str, ...]
    ] = Counter()

    unresolved_artists: Counter[str] = (
        Counter()
    )

    for song_id in all_song_ids:
        si_record = si_tracks.get(
            song_id,
            {},
        )

        title = safe_text(
            si_record.get(
                "title",
                "",
            )
        )
        artist = safe_text(
            si_record.get(
                "artist",
                "",
            )
        )

        track_genres = list(
            ts_genres.get(
                song_id,
                (),
            )
        )

        artist_resolution = (
            resolve_artist_genres(
                artist,
                artist_index,
            )
        )

        artist_genres = list(
            artist_resolution[
                "genres"
            ]
        )

        if track_genres:
            if (
                INCLUDE_ARTIST_GENRES_WHEN_TS_EXISTS
            ):
                resolved_genres = (
                    unique_preserve_order(
                        track_genres
                        + artist_genres
                    )
                )
                genre_source = (
                    "track_plus_artist"
                    if artist_genres
                    else "track"
                )
            else:
                resolved_genres = (
                    unique_preserve_order(
                        track_genres,
                    )
                )
                genre_source = "track"
        elif artist_genres:
            resolved_genres = (
                unique_preserve_order(
                    artist_genres,
                )
            )
            genre_source = (
                "artist_fallback"
            )
        else:
            resolved_genres = []
            genre_source = "unresolved"

        source_counter[
            genre_source
        ] += 1

        match_type = safe_text(
            artist_resolution.get(
                "match_type",
                "",
            )
        )
        artist_match_counter[
            match_type
        ] += 1

        for genre in track_genres:
            ts_genre_counter[
                genre
            ] += 1

        for genre in artist_genres:
            artist_genre_counter[
                genre
            ] += 1

        for genre in resolved_genres:
            resolved_genre_counter[
                genre
            ] += 1

        if resolved_genres:
            combination_counter[
                tuple(
                    sorted(
                        resolved_genres,
                    )
                )
            ] += 1

        if (
            genre_source == "unresolved"
            and artist
        ):
            unresolved_artists[
                artist
            ] += 1

        rows.append(
            {
                "SongID": song_id,
                "Title": title,
                "Artist": artist,
                "TS_Genres": join_values(
                    track_genres,
                ),
                "Artist_Genres": (
                    join_values(
                        artist_genres,
                    )
                ),
                "Resolved_Genres": (
                    join_values(
                        resolved_genres,
                    )
                ),
                "Genre_Source": (
                    genre_source
                ),
                "Artist_Match_Type": (
                    match_type
                ),
                "Matched_Artists": (
                    join_values(
                        artist_resolution.get(
                            "matched_artists",
                            [],
                        )
                    )
                ),
                "Matched_Artist_IDs": (
                    join_values(
                        artist_resolution.get(
                            "matched_artist_ids",
                            [],
                        )
                    )
                ),
                "Artist_Parts": (
                    join_values(
                        artist_resolution.get(
                            "artist_parts",
                            [],
                        )
                    )
                ),
                "Matched_Parts": (
                    join_values(
                        artist_resolution.get(
                            "matched_parts",
                            [],
                        )
                    )
                ),
                "Unmatched_Parts": (
                    join_values(
                        artist_resolution.get(
                            "unmatched_parts",
                            [],
                        )
                    )
                ),
            }
        )

    statistics = {
        "total_song_ids": len(
            all_song_ids,
        ),
        "genre_sources": dict(
            source_counter,
        ),
        "artist_match_types": dict(
            artist_match_counter,
        ),
        "ts_genre_counts": dict(
            ts_genre_counter.most_common(),
        ),
        "artist_genre_counts": dict(
            artist_genre_counter.most_common(),
        ),
        "resolved_genre_counts": dict(
            resolved_genre_counter.most_common(),
        ),
        "genre_combinations": [
            {
                "genres": list(
                    combination,
                ),
                "track_count": count,
            }
            for combination, count
            in combination_counter.most_common()
        ],
        "unresolved_artists": dict(
            unresolved_artists.most_common(),
        ),
    }

    return rows, statistics


# =============================================================================
# OUTPUT WRITERS
# =============================================================================

def ensure_output_directory(
    path: Path,
) -> None:
    path.mkdir(
        parents=True,
        exist_ok=True,
    )


def write_csv(
    path: Path,
    rows: Sequence[
        Mapping[str, Any]
    ],
    fieldnames: Sequence[str],
) -> None:
    with path.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(rows)


def write_json(
    path: Path,
    data: Any,
) -> None:
    with path.open(
        "w",
        encoding="utf-8",
    ) as handle:
        json.dump(
            data,
            handle,
            ensure_ascii=False,
            indent=2,
        )


def counter_rows(
    counts: Mapping[str, int],
    label_name: str,
) -> list[dict[str, Any]]:
    return [
        {
            label_name: label,
            "TrackCount": count,
        }
        for label, count
        in counts.items()
    ]


def build_taxonomy_candidates(
    statistics: Mapping[str, Any],
) -> dict[str, Any]:
    resolved_counts = (
        statistics.get(
            "resolved_genre_counts",
            {},
        )
    )

    return {
        "generated_at": (
            datetime.now().isoformat(
                timespec="seconds",
            )
        ),
        "notes": [
            (
                "Archivo preliminar. No representa "
                "todavía relaciones definitivas."
            ),
            (
                "Cada género puede pertenecer a "
                "más de una familia."
            ),
            (
                "Ejemplo: pop rock puede usar "
                "families ['pop', 'rock']."
            ),
            (
                "Completar aliases, families, "
                "relatedStyles y transitionStyles "
                "después de revisar los resultados."
            ),
        ],
        "genres": {
            genre: {
                "label": genre,
                "trackCount": count,
                "aliases": [],
                "families": [],
                "relatedStyles": [],
                "transitionStyles": [],
            }
            for genre, count
            in resolved_counts.items()
        },
    }


def write_outputs(
    output_dir: Path,
    assignments: Sequence[
        Mapping[str, Any]
    ],
    statistics: Mapping[str, Any],
    schemas: Mapping[str, Any],
) -> None:
    ensure_output_directory(
        output_dir,
    )

    assignment_fields = (
        "SongID",
        "Title",
        "Artist",
        "TS_Genres",
        "Artist_Genres",
        "Resolved_Genres",
        "Genre_Source",
        "Artist_Match_Type",
        "Matched_Artists",
        "Matched_Artist_IDs",
        "Artist_Parts",
        "Matched_Parts",
        "Unmatched_Parts",
    )

    write_csv(
        output_dir
        / "track_genre_assignments.csv",
        assignments,
        assignment_fields,
    )

    write_csv(
        output_dir
        / "genres_from_ts.csv",
        counter_rows(
            statistics[
                "ts_genre_counts"
            ],
            "Genre",
        ),
        (
            "Genre",
            "TrackCount",
        ),
    )

    write_csv(
        output_dir
        / "genres_from_artists.csv",
        counter_rows(
            statistics[
                "artist_genre_counts"
            ],
            "Genre",
        ),
        (
            "Genre",
            "TrackCount",
        ),
    )

    write_csv(
        output_dir
        / "genres_resolved.csv",
        counter_rows(
            statistics[
                "resolved_genre_counts"
            ],
            "Genre",
        ),
        (
            "Genre",
            "TrackCount",
        ),
    )

    combination_rows = [
        {
            "Genres": join_values(
                item["genres"],
            ),
            "GenreCount": len(
                item["genres"],
            ),
            "TrackCount": item[
                "track_count"
            ],
        }
        for item in statistics[
            "genre_combinations"
        ]
    ]

    write_csv(
        output_dir
        / "genre_combinations.csv",
        combination_rows,
        (
            "Genres",
            "GenreCount",
            "TrackCount",
        ),
    )

    unresolved_rows = [
        {
            "Artist": artist,
            "TrackCount": count,
        }
        for artist, count
        in statistics[
            "unresolved_artists"
        ].items()
    ]

    write_csv(
        output_dir
        / "unresolved_artists.csv",
        unresolved_rows,
        (
            "Artist",
            "TrackCount",
        ),
    )

    unresolved_tracks = [
        row
        for row in assignments
        if (
            row.get(
                "Genre_Source",
            )
            == "unresolved"
        )
    ]

    write_csv(
        output_dir
        / "unresolved_track_genres.csv",
        unresolved_tracks,
        assignment_fields,
    )

    audit_summary = {
        "generated_at": (
            datetime.now().isoformat(
                timespec="seconds",
            )
        ),
        "configuration": {
            "include_artist_genres_when_ts_exists": (
                INCLUDE_ARTIST_GENRES_WHEN_TS_EXISTS
            ),
            "ts_db": str(
                TS_DB_PATH,
            ),
            "si_db": str(
                SI_DB_PATH,
            ),
            "artist_features_db": str(
                ARTIST_FEATURES_DB_PATH,
            ),
            "output_dir": str(
                output_dir,
            ),
        },
        "detected_schemas": schemas,
        "statistics": statistics,
    }

    write_json(
        output_dir
        / "genre_audit_summary.json",
        audit_summary,
    )

    write_json(
        output_dir
        / "genre_taxonomy_candidates.json",
        build_taxonomy_candidates(
            statistics,
        ),
    )


# =============================================================================
# CONSOLE
# =============================================================================

def print_header(
    title: str,
) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def print_detected_schema(
    label: str,
    schema: Any,
) -> None:
    print(f"{label}:")
    for field_name, value in vars(
        schema,
    ).items():
        print(
            f"  {field_name}: {value}"
        )


def validate_paths() -> None:
    missing = [
        path
        for path in (
            TS_DB_PATH,
            SI_DB_PATH,
            ARTIST_FEATURES_DB_PATH,
        )
        if not path.exists()
    ]

    if missing:
        formatted = "\n".join(
            f"  - {path}"
            for path in missing
        )
        raise FileNotFoundError(
            "Faltan bases de datos:\n"
            f"{formatted}\n\n"
            "Modifica DB_ROOT o las rutas "
            "individuales al inicio del script."
        )


# =============================================================================
# MAIN
# =============================================================================

def main() -> int:
    print_header(
        "FLAMINGOAPP DJ - AUDITORÍA DE GÉNEROS"
    )

    validate_paths()

    print("Bases de datos encontradas:")
    print(f"  OK: {TS_DB_PATH}")
    print(f"  OK: {SI_DB_PATH}")
    print(
        f"  OK: {ARTIST_FEATURES_DB_PATH}"
    )

    print_header(
        "1. DETECTANDO ESQUEMAS"
    )

    ts_schema = detect_ts_schema(
        TS_DB_PATH,
    )
    si_schema = detect_si_schema(
        SI_DB_PATH,
    )
    artist_schema = (
        detect_artist_schema(
            ARTIST_FEATURES_DB_PATH,
        )
    )

    print_detected_schema(
        "TS.db",
        ts_schema,
    )
    print()
    print_detected_schema(
        "SI.db",
        si_schema,
    )
    print()
    print_detected_schema(
        "ARTIST_FEATURES.db",
        artist_schema,
    )

    print_header(
        "2. CARGANDO DATOS"
    )

    si_tracks = load_si_tracks(
        SI_DB_PATH,
        si_schema,
    )
    print(
        "Canciones cargadas desde SI.db: "
        f"{len(si_tracks):,}"
    )

    ts_genres = load_ts_genres(
        TS_DB_PATH,
        ts_schema,
    )
    print(
        "SongID leídos desde TS.db: "
        f"{len(ts_genres):,}"
    )

    ts_with_genres = sum(
        1
        for genres in ts_genres.values()
        if genres
    )
    print(
        "SongID con género válido en TS.db: "
        f"{ts_with_genres:,}"
    )

    artist_records = (
        load_artist_features(
            ARTIST_FEATURES_DB_PATH,
            artist_schema,
        )
    )
    print(
        "Filas de artista con géneros válidos: "
        f"{len(artist_records):,}"
    )

    artist_index = build_artist_index(
        artist_records,
    )
    print(
        "Nombres normalizados en índice: "
        f"{len(artist_index):,}"
    )

    print_header(
        "3. RESOLVIENDO GÉNEROS"
    )

    (
        assignments,
        statistics,
    ) = make_assignment_rows(
        si_tracks,
        ts_genres,
        artist_index,
    )

    print(
        "Canciones procesadas: "
        f"{len(assignments):,}"
    )

    for source, count in (
        statistics[
            "genre_sources"
        ].items()
    ):
        print(
            f"  {source}: {count:,}"
        )

    print_header(
        "4. ESCRIBIENDO RESULTADOS"
    )

    schemas_json = {
        "TS": vars(ts_schema),
        "SI": vars(si_schema),
        "ARTIST_FEATURES": vars(
            artist_schema,
        ),
    }

    write_outputs(
        OUTPUT_DIR,
        assignments,
        statistics,
        schemas_json,
    )

    generated_files = (
        "track_genre_assignments.csv",
        "genres_from_ts.csv",
        "genres_from_artists.csv",
        "genres_resolved.csv",
        "genre_combinations.csv",
        "unresolved_artists.csv",
        "unresolved_track_genres.csv",
        "genre_audit_summary.json",
        "genre_taxonomy_candidates.json",
    )

    print(
        f"Carpeta de salida:\n  {OUTPUT_DIR}"
    )
    print("\nArchivos generados:")

    for filename in generated_files:
        print(f"  OK: {filename}")

    print_header(
        "AUDITORÍA COMPLETADA"
    )

    print(
        "Comparte principalmente estos archivos "
        "para construir la taxonomía:"
    )
    print(
        "  - genres_from_ts.csv"
    )
    print(
        "  - genres_from_artists.csv"
    )
    print(
        "  - genres_resolved.csv"
    )
    print(
        "  - genre_combinations.csv"
    )
    print(
        "  - genre_taxonomy_candidates.json"
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print(
            "\nProceso cancelado por el usuario.",
            file=sys.stderr,
        )
        raise SystemExit(130)
    except Exception as error:
        print_header(
            "ERROR"
        )
        print(
            f"{type(error).__name__}: "
            f"{error}",
            file=sys.stderr,
        )
        raise SystemExit(1)
