#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CLEAN_GENRES.py

Limpia y normaliza los géneros detectados por la auditoría de Flamingo DJ App.

Entrada principal
-----------------
Busca automáticamente:

    <FLAMINGO_DJ_APP>/data/genres/audit/track_genre_assignments.csv

Si todavía no moviste los archivos de la auditoría al proyecto, intenta usar
como respaldo:

    C:/Users/fbrav/OneDrive/Desktop/__DB_FILES/GENRE_AUDIT/
    track_genre_assignments.csv

Salida
------
Guarda todo exclusivamente dentro del proyecto:

    <FLAMINGO_DJ_APP>/data/genres/cleaned/

Archivos generados:

    clean_track_genre_assignments.csv
    clean_genres.csv
    rejected_genres.csv
    genre_aliases_detected.csv
    genre_cleaning_summary.json
    genre_taxonomy_seed.json

Importante
----------
- No modifica TS.db, SI.db, ARTIST_FEATURES.db ni DJ.db.
- No escribe resultados nuevos en __DB_FILES.
- El proyecto se detecta desde la ubicación de este script:
      FLAMINGO_DJ_APP/scripts/CLEAN_GENRES.py
- Puede ejecutarse repetidamente sin duplicar resultados.
"""

from __future__ import annotations

import csv
import json
import re
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


# =============================================================================
# PROJECT PATHS
# =============================================================================

SCRIPT_PATH = Path(__file__).resolve()
SCRIPTS_DIR = SCRIPT_PATH.parent
PROJECT_ROOT = SCRIPTS_DIR.parent

AUDIT_DIR = PROJECT_ROOT / "data" / "genres" / "audit"
CLEANED_DIR = PROJECT_ROOT / "data" / "genres" / "cleaned"

PRIMARY_ASSIGNMENTS_FILE = (
    AUDIT_DIR / "track_genre_assignments.csv"
)

# Respaldo temporal para la auditoría ya creada anteriormente.
# Solo se usa como entrada. Los resultados jamás se guardan aquí.
LEGACY_AUDIT_DIR = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES\GENRE_AUDIT"
)
LEGACY_ASSIGNMENTS_FILE = (
    LEGACY_AUDIT_DIR / "track_genre_assignments.csv"
)

# Cuando True, copia los archivos de auditoría existentes desde la ubicación
# antigua hacia data/genres/audit del proyecto. No borra los originales.
COPY_LEGACY_AUDIT_TO_PROJECT = True


# =============================================================================
# OUTPUT FILES
# =============================================================================

CLEAN_ASSIGNMENTS_FILE = (
    CLEANED_DIR / "clean_track_genre_assignments.csv"
)
CLEAN_GENRES_FILE = (
    CLEANED_DIR / "clean_genres.csv"
)
REJECTED_GENRES_FILE = (
    CLEANED_DIR / "rejected_genres.csv"
)
ALIASES_FILE = (
    CLEANED_DIR / "genre_aliases_detected.csv"
)
SUMMARY_FILE = (
    CLEANED_DIR / "genre_cleaning_summary.json"
)
TAXONOMY_SEED_FILE = (
    CLEANED_DIR / "genre_taxonomy_seed.json"
)


# =============================================================================
# CLEANING CONFIGURATION
# =============================================================================

# Los campos generados por la auditoría separan grupos principales con " | ".
PIPE_SPLIT_RE = re.compile(r"\s*\|\s*")

# Dentro de cada grupo, Spotify y otras fuentes suelen separar géneros por coma.
COMMA_SPLIT_RE = re.compile(r"\s*,\s*")

# Separadores adicionales seguros.
SECONDARY_SPLIT_RE = re.compile(
    r"\s*(?:;|•|\u2022|\n|\r|\t)\s*"
)

URL_RE = re.compile(
    r"(?:https?://|www\.|\.com\b|\.net\b|\.org\b|\.html?\b)",
    flags=re.IGNORECASE,
)

FILE_RE = re.compile(
    r"\.(?:jpg|jpeg|png|gif|webp|mp3|wav|flac|m4a|aac|ogg|db|csv|json)\b",
    flags=re.IGNORECASE,
)

YEAR_RE = re.compile(r"^(?:19|20)\d{2}s?$")
ONLY_NUMBERS_RE = re.compile(r"^[\d\s._-]+$")
LONG_NUMBER_SEQUENCE_RE = re.compile(r"(?:\d[\s,;-]*){6,}")

# Alias exactos. Se pueden ampliar más adelante.
GENRE_ALIASES: dict[str, str] = {
    "hip-hop": "hip hop",
    "hiphop": "hip hop",
    "hip hop music": "hip hop",
    "rap music": "rap",
    "rnb": "r&b",
    "r and b": "r&b",
    "rhythm and blues": "r&b",
    "synth-pop": "synth pop",
    "synthpop": "synth pop",
    "pop-rock": "pop rock",
    "folk-pop": "folk pop",
    "dance-pop": "dance pop",
    "electro-pop": "electropop",
    "reggaetón": "reggaeton",
    "reggaeton music": "reggaeton",
    "latin urban": "urbano latino",
    "latin urbano": "urbano latino",
    "urban latin": "urbano latino",
    "latin trap": "trap latino",
    "trap latin": "trap latino",
    "kpop": "k-pop",
    "jpop": "j-pop",
    "cpop": "c-pop",
    "afro beat": "afrobeat",
    "afro beats": "afrobeats",
    "afro-beats": "afrobeats",
    "drum bass": "drum and bass",
    "dnb": "drum and bass",
    "rock n roll": "rock and roll",
    "rock & roll": "rock and roll",
    "electronica music": "electronica",
    "electronic music": "electronic",
    "musica mexicana": "música mexicana",
    "musica popular colombiana": "música popular colombiana",
}

# Etiquetas conocidas que no describen un género.
EXACT_REJECT_VALUES = {
    "",
    "-",
    "--",
    "n/a",
    "na",
    "none",
    "null",
    "unknown",
    "undefined",
    "cover",
    "artist",
    "artists",
    "various artist",
    "various artists",
    "[various artists]",
    "special purpose artist",
    "meta artist",
    "label as artist",
    "compilation",
    "release",
    "album",
    "single",
    "song",
    "track",
    "music",
    "musica",
    "popular",
    "seen live",
    "live",
    "remix",
    "soundtrack",
    "ost",
    "english",
    "spanish",
    "espanol",
    "spanisch",
    "englisch",
    "american",
    "british",
    "canadian",
    "artist of the decade",
    "grammy winner",
    "female vocals",
    "male vocals",
    "vocalist",
    "singer",
    "songwriter",
    "singer-songwriter",
    "producer",
    "composer",
    "pianist",
    "dancer",
    "actress",
    "director",
    "businesswoman",
    "philanthropist",
    "icon",
    "cultural icon",
    "talent show",
    "viral",
    "viral music",
    "top 40",
    "billboard",
    "christmas music",
    "movie tunes",
    "hollywood",
    "meme",
    "sped up",
    "previa",
}

# Fragmentos que indican comentarios, basura editorial o instrucciones.
REJECT_CONTAINS = {
    "fixme",
    "fix me",
    "fix tags",
    "fix your tags",
    "fail tags",
    "failtags",
    "mess mess",
    "messy tags",
    "tagmess",
    "tagsmess",
    "dont tag",
    "don't tag",
    "do not tag",
    "dont rate",
    "don't rate",
    "do not rate",
    "stop using this",
    "please rename",
    "please fix",
    "kindly fix",
    "various artist",
    "artist credits",
    "downvote",
    "voting down",
    "you should fix",
    "you *should* fix",
    "unable to comprehend",
    "look-up",
    "look up",
    "rowid",
    "candidate",
    "relic inn",
    "cotm",
    "liked this",
    "likes planes",
    "loves planes",
    "question for the culture",
    "make. ffs",
    "make. srsly",
    "faaaaaail",
    "tag spam",
    "this is a mess",
    "still a mess",
}

# Etiquetas que son atributos, opiniones, identidades, acusaciones, países o
# metadatos; no estilos musicales.
NON_GENRE_WORDS = {
    "abuser",
    "amazing",
    "anti vax",
    "antisemite",
    "artist",
    "awful",
    "blacklist",
    "businesswoman",
    "christian",
    "corean",
    "cultural",
    "dancer",
    "director",
    "english",
    "fascist",
    "female",
    "gay",
    "icon",
    "karen",
    "lesbian",
    "male",
    "misogynist",
    "nazi",
    "pedophilia",
    "philanthropist",
    "producer",
    "pro trump",
    "racist",
    "rapper",
    "remix",
    "singer",
    "songwriter",
    "spanish",
    "terrible",
    "tumblr",
    "vocalist",
    "wifebeater",
}

# Géneros válidos de una palabra que podrían confundirse con palabras generales.
# Esta lista ayuda a mantener estilos reales.
KNOWN_SINGLE_WORD_GENRES = {
    "afrobeat",
    "afrobeats",
    "afropop",
    "amapiano",
    "ambient",
    "anime",
    "arabesk",
    "bachata",
    "banda",
    "bhangra",
    "bluegrass",
    "blues",
    "bolero",
    "bollywood",
    "breakbeat",
    "britpop",
    "calypso",
    "candombe",
    "cantopop",
    "chalga",
    "chanson",
    "chicha",
    "classical",
    "concerto",
    "country",
    "corrido",
    "cuarteto",
    "cumbia",
    "dancehall",
    "dansktop",
    "dembow",
    "disco",
    "doom",
    "drill",
    "dub",
    "dubstep",
    "edm",
    "electropop",
    "electronica",
    "emo",
    "entehno",
    "eurodance",
    "europop",
    "filmi",
    "flamenco",
    "folk",
    "forro",
    "funk",
    "gospel",
    "gqom",
    "grime",
    "grupera",
    "guaracha",
    "hardstyle",
    "house",
    "hyperpop",
    "indie",
    "instrumental",
    "iskelma",
    "jazz",
    "kizomba",
    "kuduro",
    "laiko",
    "lounge",
    "mahraganat",
    "mambo",
    "mandopop",
    "manele",
    "maskandi",
    "merengue",
    "metal",
    "mizrahi",
    "moombahton",
    "nederpop",
    "neoperreo",
    "norteno",
    "opera",
    "pagode",
    "phonk",
    "piseiro",
    "pop",
    "punk",
    "rai",
    "ranchera",
    "rap",
    "reggae",
    "reggaeton",
    "riddim",
    "rkt",
    "rock",
    "salsa",
    "samba",
    "scandipop",
    "schlager",
    "sertanejo",
    "ska",
    "soca",
    "soul",
    "techno",
    "trance",
    "trap",
    "tropical",
    "turreo",
    "vallenato",
    "vinahouse",
    "zouk",
}

# Máximos conservadores después de separar por coma.
MAX_GENRE_LENGTH = 70
MAX_GENRE_WORDS = 7


# =============================================================================
# DATA TYPES
# =============================================================================

@dataclass(frozen=True)
class CleanDecision:
    raw_value: str
    normalized_value: str
    accepted: bool
    reason: str
    alias_applied: bool


# =============================================================================
# TEXT HELPERS
# =============================================================================

def safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        char
        for char in normalized
        if not unicodedata.combining(char)
    )


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_for_lookup(value: Any) -> str:
    text = safe_text(value)
    if not text:
        return ""

    text = text.replace("’", "'")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = text.replace("_", " ")
    text = strip_accents(text).lower()
    text = normalize_spaces(text)
    return text.strip(" ,;|/[]{}()\"'`")


def normalize_genre(value: Any) -> tuple[str, bool]:
    original = normalize_for_lookup(value)
    if not original:
        return "", False

    text = original

    # Normalización tipográfica segura.
    text = re.sub(r"\s*-\s*", "-", text)
    text = re.sub(r"\s*&\s*", " & ", text)
    text = normalize_spaces(text)

    alias_value = GENRE_ALIASES.get(text)
    if alias_value:
        return alias_value, alias_value != text

    return text, False


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)

    return result


# =============================================================================
# INPUT DISCOVERY
# =============================================================================

def ensure_directories() -> None:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    CLEANED_DIR.mkdir(parents=True, exist_ok=True)


def copy_legacy_audit_files() -> None:
    if not COPY_LEGACY_AUDIT_TO_PROJECT:
        return

    if not LEGACY_AUDIT_DIR.exists():
        return

    for source in LEGACY_AUDIT_DIR.iterdir():
        if not source.is_file():
            continue

        destination = AUDIT_DIR / source.name

        if destination.exists():
            continue

        shutil.copy2(source, destination)


def locate_assignments_file() -> Path:
    ensure_directories()
    copy_legacy_audit_files()

    candidates = (
        PRIMARY_ASSIGNMENTS_FILE,
        LEGACY_ASSIGNMENTS_FILE,
    )

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        "No se encontró track_genre_assignments.csv.\n\n"
        "Ubicación esperada:\n"
        f"  {PRIMARY_ASSIGNMENTS_FILE}\n\n"
        "También se revisó la ubicación anterior:\n"
        f"  {LEGACY_ASSIGNMENTS_FILE}\n\n"
        "Copia los archivos de auditoría a:\n"
        f"  {AUDIT_DIR}"
    )


# =============================================================================
# GENRE EXTRACTION
# =============================================================================

def split_genre_field(value: Any) -> list[str]:
    """
    Divide el campo de auditoría en géneros individuales.

    Orden:
    1. " | " usado por el auditor.
    2. punto y coma, viñetas y saltos de línea.
    3. coma usada por Spotify/MusicBrainz para listas de géneros.
    """
    text = safe_text(value)
    if not text:
        return []

    outer_groups = PIPE_SPLIT_RE.split(text)
    pieces: list[str] = []

    for group in outer_groups:
        for secondary in SECONDARY_SPLIT_RE.split(group):
            for comma_piece in COMMA_SPLIT_RE.split(secondary):
                candidate = safe_text(comma_piece)
                if candidate:
                    pieces.append(candidate)

    return pieces


def rejection_reason(
    raw_value: str,
    normalized_value: str,
) -> str | None:
    if not normalized_value:
        return "empty"

    if normalized_value in EXACT_REJECT_VALUES:
        return "known_non_genre"

    if URL_RE.search(raw_value) or URL_RE.search(normalized_value):
        return "url_or_domain"

    if FILE_RE.search(raw_value) or FILE_RE.search(normalized_value):
        return "file_reference"

    if ONLY_NUMBERS_RE.fullmatch(normalized_value):
        return "numeric_value"

    if YEAR_RE.fullmatch(normalized_value):
        return "year_tag"

    if LONG_NUMBER_SEQUENCE_RE.search(normalized_value):
        return "number_sequence"

    if len(normalized_value) > MAX_GENRE_LENGTH:
        return "too_long"

    words = normalized_value.split()
    if len(words) > MAX_GENRE_WORDS:
        return "too_many_words"

    for fragment in REJECT_CONTAINS:
        if fragment in normalized_value:
            return "editorial_or_comment_tag"

    # Frases completas o fragmentos descriptivos suelen contener estos signos.
    if any(symbol in normalized_value for symbol in ("!", "?", "://")):
        return "sentence_or_comment"

    # Si es una sola palabra, aceptamos explícitamente géneros conocidos.
    if len(words) == 1 and normalized_value in KNOWN_SINGLE_WORD_GENRES:
        return None

    # Rechaza atributos exactos.
    if normalized_value in NON_GENRE_WORDS:
        return "attribute_not_genre"

    # Rechaza valores compuestos únicamente por atributos conocidos.
    meaningful_words = [
        word
        for word in re.findall(r"[a-z0-9&+-]+", normalized_value)
        if word not in {"and", "the", "of", "de", "la", "el"}
    ]
    if meaningful_words and all(
        word in NON_GENRE_WORDS
        for word in meaningful_words
    ):
        return "attribute_not_genre"

    # Demasiada puntuación es una señal de texto contaminado.
    punctuation_count = sum(
        1
        for char in normalized_value
        if not char.isalnum()
        and not char.isspace()
        and char not in {"&", "-", "+", "'"}
    )
    if punctuation_count >= 3:
        return "excessive_punctuation"

    return None


def clean_genre_candidate(raw_value: str) -> CleanDecision:
    normalized_value, alias_applied = normalize_genre(raw_value)
    reason = rejection_reason(raw_value, normalized_value)

    return CleanDecision(
        raw_value=raw_value,
        normalized_value=normalized_value,
        accepted=reason is None,
        reason=reason or "accepted",
        alias_applied=alias_applied,
    )


# =============================================================================
# CSV READ / WRITE
# =============================================================================

def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as handle:
        return [
            dict(row)
            for row in csv.DictReader(handle)
        ]


def write_csv(
    path: Path,
    rows: Sequence[Mapping[str, Any]],
    fieldnames: Sequence[str],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

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


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

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


# =============================================================================
# CLEANING PIPELINE
# =============================================================================

def clean_source_field(
    field_value: str,
    source_label: str,
    song_id: str,
    title: str,
    artist: str,
    genre_counter: Counter[str],
    source_counter: dict[str, Counter[str]],
    rejected_counter: Counter[tuple[str, str]],
    rejected_examples: dict[tuple[str, str], dict[str, str]],
    alias_counter: Counter[tuple[str, str]],
) -> list[str]:
    cleaned: list[str] = []

    for raw_genre in split_genre_field(field_value):
        decision = clean_genre_candidate(raw_genre)

        if decision.accepted:
            cleaned.append(decision.normalized_value)
            genre_counter[decision.normalized_value] += 1
            source_counter[source_label][decision.normalized_value] += 1

            if decision.alias_applied:
                alias_counter[
                    (
                        normalize_for_lookup(decision.raw_value),
                        decision.normalized_value,
                    )
                ] += 1
        else:
            key = (
                decision.normalized_value or normalize_for_lookup(raw_genre),
                decision.reason,
            )
            rejected_counter[key] += 1

            if key not in rejected_examples:
                rejected_examples[key] = {
                    "RawExample": raw_genre,
                    "SongID": song_id,
                    "Title": title,
                    "Artist": artist,
                    "Source": source_label,
                }

    return unique_preserve_order(cleaned)


def clean_assignments(
    rows: Sequence[Mapping[str, str]],
) -> tuple[
    list[dict[str, str]],
    dict[str, Any],
]:
    cleaned_rows: list[dict[str, str]] = []

    genre_counter: Counter[str] = Counter()
    source_counter: dict[str, Counter[str]] = {
        "TS": Counter(),
        "ARTIST_FEATURES": Counter(),
        "RESOLVED": Counter(),
    }

    rejected_counter: Counter[tuple[str, str]] = Counter()
    rejected_examples: dict[
        tuple[str, str],
        dict[str, str],
    ] = {}

    alias_counter: Counter[tuple[str, str]] = Counter()

    source_result_counter: Counter[str] = Counter()
    tracks_with_clean_genres = 0
    tracks_without_clean_genres = 0

    for row in rows:
        song_id = safe_text(row.get("SongID"))
        title = safe_text(row.get("Title"))
        artist = safe_text(row.get("Artist"))

        ts_clean = clean_source_field(
            field_value=safe_text(row.get("TS_Genres")),
            source_label="TS",
            song_id=song_id,
            title=title,
            artist=artist,
            genre_counter=genre_counter,
            source_counter=source_counter,
            rejected_counter=rejected_counter,
            rejected_examples=rejected_examples,
            alias_counter=alias_counter,
        )

        artist_clean = clean_source_field(
            field_value=safe_text(row.get("Artist_Genres")),
            source_label="ARTIST_FEATURES",
            song_id=song_id,
            title=title,
            artist=artist,
            genre_counter=genre_counter,
            source_counter=source_counter,
            rejected_counter=rejected_counter,
            rejected_examples=rejected_examples,
            alias_counter=alias_counter,
        )

        # La prioridad se mantiene:
        # TS primero; ARTIST_FEATURES solo como fallback.
        if ts_clean:
            resolved_clean = ts_clean
            clean_source = "track"
        elif artist_clean:
            resolved_clean = artist_clean
            clean_source = "artist_fallback"
        else:
            resolved_clean = []
            clean_source = "unresolved"

        for genre in resolved_clean:
            source_counter["RESOLVED"][genre] += 1

        source_result_counter[clean_source] += 1

        if resolved_clean:
            tracks_with_clean_genres += 1
        else:
            tracks_without_clean_genres += 1

        cleaned_rows.append(
            {
                "SongID": song_id,
                "Title": title,
                "Artist": artist,
                "TS_Clean_Genres": " | ".join(ts_clean),
                "Artist_Clean_Genres": " | ".join(artist_clean),
                "CleanGenres": " | ".join(resolved_clean),
                "GenreSource": clean_source,
                "Original_Genre_Source": safe_text(
                    row.get("Genre_Source")
                ),
                "Artist_Match_Type": safe_text(
                    row.get("Artist_Match_Type")
                ),
                "Matched_Artists": safe_text(
                    row.get("Matched_Artists")
                ),
            }
        )

    statistics = {
        "total_rows": len(rows),
        "tracks_with_clean_genres": tracks_with_clean_genres,
        "tracks_without_clean_genres": tracks_without_clean_genres,
        "genre_sources": dict(source_result_counter),
        "unique_clean_genres": len(source_counter["RESOLVED"]),
        "total_rejected_occurrences": sum(rejected_counter.values()),
        "unique_rejected_values": len(rejected_counter),
        "total_alias_occurrences": sum(alias_counter.values()),
        "unique_alias_pairs": len(alias_counter),
        "genre_counter": genre_counter,
        "source_counter": source_counter,
        "rejected_counter": rejected_counter,
        "rejected_examples": rejected_examples,
        "alias_counter": alias_counter,
    }

    return cleaned_rows, statistics


# =============================================================================
# OUTPUT BUILDERS
# =============================================================================

def build_clean_genre_rows(
    statistics: Mapping[str, Any],
) -> list[dict[str, Any]]:
    resolved_counts: Counter[str] = statistics["source_counter"]["RESOLVED"]
    ts_counts: Counter[str] = statistics["source_counter"]["TS"]
    artist_counts: Counter[str] = statistics["source_counter"]["ARTIST_FEATURES"]

    genres = sorted(
        set(resolved_counts)
        | set(ts_counts)
        | set(artist_counts),
        key=lambda genre: (
            -resolved_counts[genre],
            -ts_counts[genre],
            -artist_counts[genre],
            genre,
        ),
    )

    return [
        {
            "Genre": genre,
            "ResolvedTrackCount": resolved_counts[genre],
            "TSOccurrenceCount": ts_counts[genre],
            "ArtistOccurrenceCount": artist_counts[genre],
        }
        for genre in genres
    ]


def build_rejected_rows(
    statistics: Mapping[str, Any],
) -> list[dict[str, Any]]:
    rejected_counter: Counter[tuple[str, str]] = statistics["rejected_counter"]
    examples: dict[tuple[str, str], dict[str, str]] = (
        statistics["rejected_examples"]
    )

    rows: list[dict[str, Any]] = []

    for (value, reason), count in rejected_counter.most_common():
        example = examples.get((value, reason), {})

        rows.append(
            {
                "RejectedValue": value,
                "Reason": reason,
                "OccurrenceCount": count,
                "RawExample": example.get("RawExample", ""),
                "Source": example.get("Source", ""),
                "SongIDExample": example.get("SongID", ""),
                "TitleExample": example.get("Title", ""),
                "ArtistExample": example.get("Artist", ""),
            }
        )

    return rows


def build_alias_rows(
    statistics: Mapping[str, Any],
) -> list[dict[str, Any]]:
    alias_counter: Counter[tuple[str, str]] = statistics["alias_counter"]

    return [
        {
            "OriginalValue": original,
            "CanonicalGenre": canonical,
            "OccurrenceCount": count,
        }
        for (original, canonical), count
        in alias_counter.most_common()
    ]


def build_taxonomy_seed(
    clean_genre_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "description": (
            "Base limpia para construir la taxonomía multi-label "
            "de Flamingo DJ App."
        ),
        "genres": {
            safe_text(row["Genre"]): {
                "label": safe_text(row["Genre"]),
                "trackCount": int(row["ResolvedTrackCount"]),
                "aliases": [],
                "families": [],
                "relatedStyles": [],
                "transitionStyles": [],
            }
            for row in clean_genre_rows
            if safe_text(row["Genre"])
        },
    }


def serializable_summary(
    input_file: Path,
    statistics: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "project_root": str(PROJECT_ROOT),
        "input_file": str(input_file),
        "output_directory": str(CLEANED_DIR),
        "statistics": {
            "total_rows": statistics["total_rows"],
            "tracks_with_clean_genres": statistics[
                "tracks_with_clean_genres"
            ],
            "tracks_without_clean_genres": statistics[
                "tracks_without_clean_genres"
            ],
            "genre_sources": statistics["genre_sources"],
            "unique_clean_genres": statistics["unique_clean_genres"],
            "total_rejected_occurrences": statistics[
                "total_rejected_occurrences"
            ],
            "unique_rejected_values": statistics[
                "unique_rejected_values"
            ],
            "total_alias_occurrences": statistics[
                "total_alias_occurrences"
            ],
            "unique_alias_pairs": statistics[
                "unique_alias_pairs"
            ],
        },
        "rules": {
            "max_genre_length": MAX_GENRE_LENGTH,
            "max_genre_words": MAX_GENRE_WORDS,
            "ts_has_priority": True,
            "artist_features_used_as_fallback": True,
        },
        "output_files": {
            "clean_track_genre_assignments": str(
                CLEAN_ASSIGNMENTS_FILE
            ),
            "clean_genres": str(CLEAN_GENRES_FILE),
            "rejected_genres": str(REJECTED_GENRES_FILE),
            "genre_aliases_detected": str(ALIASES_FILE),
            "genre_taxonomy_seed": str(TAXONOMY_SEED_FILE),
        },
    }


# =============================================================================
# CONSOLE
# =============================================================================

def print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def print_file(path: Path) -> None:
    print(f"  OK: {path}")


# =============================================================================
# MAIN
# =============================================================================

def main() -> int:
    print_header("FLAMINGO DJ APP - GENRE CLEANING ENGINE")

    print(f"Proyecto detectado:\n  {PROJECT_ROOT}")

    assignments_file = locate_assignments_file()

    print_header("ENTRADA")
    print(f"Archivo usado:\n  {assignments_file}")

    rows = read_csv_rows(assignments_file)

    if not rows:
        raise ValueError(
            "El archivo track_genre_assignments.csv está vacío."
        )

    required_columns = {
        "SongID",
        "Title",
        "Artist",
        "TS_Genres",
        "Artist_Genres",
    }

    missing_columns = required_columns - set(rows[0])

    if missing_columns:
        raise ValueError(
            "Faltan columnas requeridas en el CSV: "
            + ", ".join(sorted(missing_columns))
        )

    print(f"Filas cargadas: {len(rows):,}")

    print_header("LIMPIANDO GÉNEROS")

    cleaned_rows, statistics = clean_assignments(rows)

    clean_genre_rows = build_clean_genre_rows(statistics)
    rejected_rows = build_rejected_rows(statistics)
    alias_rows = build_alias_rows(statistics)

    assignment_fields = (
        "SongID",
        "Title",
        "Artist",
        "TS_Clean_Genres",
        "Artist_Clean_Genres",
        "CleanGenres",
        "GenreSource",
        "Original_Genre_Source",
        "Artist_Match_Type",
        "Matched_Artists",
    )

    write_csv(
        CLEAN_ASSIGNMENTS_FILE,
        cleaned_rows,
        assignment_fields,
    )

    write_csv(
        CLEAN_GENRES_FILE,
        clean_genre_rows,
        (
            "Genre",
            "ResolvedTrackCount",
            "TSOccurrenceCount",
            "ArtistOccurrenceCount",
        ),
    )

    write_csv(
        REJECTED_GENRES_FILE,
        rejected_rows,
        (
            "RejectedValue",
            "Reason",
            "OccurrenceCount",
            "RawExample",
            "Source",
            "SongIDExample",
            "TitleExample",
            "ArtistExample",
        ),
    )

    write_csv(
        ALIASES_FILE,
        alias_rows,
        (
            "OriginalValue",
            "CanonicalGenre",
            "OccurrenceCount",
        ),
    )

    write_json(
        TAXONOMY_SEED_FILE,
        build_taxonomy_seed(clean_genre_rows),
    )

    write_json(
        SUMMARY_FILE,
        serializable_summary(assignments_file, statistics),
    )

    print(f"Tracks procesados: {statistics['total_rows']:,}")
    print(
        "Tracks con géneros limpios: "
        f"{statistics['tracks_with_clean_genres']:,}"
    )
    print(
        "Tracks todavía sin género: "
        f"{statistics['tracks_without_clean_genres']:,}"
    )
    print(
        "Géneros limpios únicos: "
        f"{statistics['unique_clean_genres']:,}"
    )
    print(
        "Valores rechazados únicos: "
        f"{statistics['unique_rejected_values']:,}"
    )
    print(
        "Aliases aplicados: "
        f"{statistics['total_alias_occurrences']:,}"
    )

    print_header("ARCHIVOS GENERADOS")

    print_file(CLEAN_ASSIGNMENTS_FILE)
    print_file(CLEAN_GENRES_FILE)
    print_file(REJECTED_GENRES_FILE)
    print_file(ALIASES_FILE)
    print_file(SUMMARY_FILE)
    print_file(TAXONOMY_SEED_FILE)

    print_header("PROCESO COMPLETADO")

    print(
        "El siguiente archivo servirá para construir la taxonomía:\n"
        f"  {TAXONOMY_SEED_FILE}"
    )
    print(
        "\nRevisa también los rechazos antes de la siguiente etapa:\n"
        f"  {REJECTED_GENRES_FILE}"
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
        print_header("ERROR")
        print(
            f"{type(error).__name__}: {error}",
            file=sys.stderr,
        )
        raise SystemExit(1)
