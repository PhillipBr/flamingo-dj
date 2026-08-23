#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
REFINE_GENRE_GRAPH.py

Refina el grafo inicial de géneros de Flamingo DJ App.

Entrada
-------
    <PROJECT_ROOT>/data/genres/taxonomy/genre_graph.json

Salida
------
    <PROJECT_ROOT>/data/genres/refined/
        genre_graph_refined.json
        genre_alias_map.json
        genre_match_profiles.json
        genre_review_queue.csv
        removed_genres.csv
        refinement_summary.json

Objetivos
---------
- Corregir asignaciones demasiado amplias por coincidencia parcial.
- Separar reglas exactas, prefijos y sufijos.
- Añadir familias primarias/secundarias con peso y confianza.
- Eliminar basura residual.
- Construir perfiles iniciales para Same Style y Cross Style.
- Generar una cola de revisión priorizada.
- No modifica bases de datos.
- No escribe fuera del proyecto.
"""

from __future__ import annotations

import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


# =============================================================================
# PATHS
# =============================================================================

SCRIPT_PATH = Path(__file__).resolve()
SCRIPTS_DIR = SCRIPT_PATH.parent
PROJECT_ROOT = SCRIPTS_DIR.parent

INPUT_DIR = PROJECT_ROOT / "data" / "genres" / "taxonomy"
OUTPUT_DIR = PROJECT_ROOT / "data" / "genres" / "refined"

INPUT_GRAPH_FILE = INPUT_DIR / "genre_graph.json"

REFINED_GRAPH_FILE = OUTPUT_DIR / "genre_graph_refined.json"
ALIAS_MAP_FILE = OUTPUT_DIR / "genre_alias_map.json"
MATCH_PROFILES_FILE = OUTPUT_DIR / "genre_match_profiles.json"
REVIEW_QUEUE_FILE = OUTPUT_DIR / "genre_review_queue.csv"
REMOVED_GENRES_FILE = OUTPUT_DIR / "removed_genres.csv"
SUMMARY_FILE = OUTPUT_DIR / "refinement_summary.json"


# =============================================================================
# GENERAL CONFIGURATION
# =============================================================================

MAX_RELATED_STYLES = 12
MAX_TRANSITION_STYLES = 10
MAX_MATCH_RESULTS = 16

MIN_REVIEW_TRACK_COUNT = 20

CONFIDENCE_SCORES = {
    "manual": 1.00,
    "exact": 0.95,
    "parent": 0.90,
    "suffix": 0.80,
    "prefix": 0.78,
    "inferred": 0.65,
    "fallback": 0.45,
}

# Peso relativo para el cálculo del match por género.
SAME_STYLE_WEIGHTS = {
    "same_genre": 1.00,
    "same_parent": 0.93,
    "manual_related": 0.90,
    "shared_primary_family": 0.84,
    "shared_secondary_family": 0.72,
    "graph_related": 0.68,
}

CROSS_STYLE_WEIGHTS = {
    "manual_transition": 0.82,
    "graph_transition": 0.72,
    "family_bridge": 0.64,
    "shared_secondary_family": 0.56,
}


# =============================================================================
# NORMALIZATION
# =============================================================================

ALIAS_MAP: dict[str, str] = {
    "r & b": "r&b",
    "r and b": "r&b",
    "rhythm & blues": "r&b",
    "rhythm and blues": "r&b",
    "contemporary r & b": "contemporary r&b",
    "alternative r & b": "alternative r&b",
    "french r & b": "french r&b",
    "r & b francais": "r&b francais",
    "r & b en espanol": "r&b en espanol",
    "afro r & b": "afro r&b",
    "korean r & b": "korean r&b",
    "pinoy r & b": "pinoy r&b",
    "chinese r & b": "chinese r&b",
    "hip-hop": "hip hop",
    "hiphop": "hip hop",
    "synth-pop": "synth pop",
    "pop-rock": "pop rock",
    "country-pop": "country pop",
    "dance-rock": "dance rock",
    "post-rock": "post rock",
    "post-punk": "post punk",
    "post-grunge": "post grunge",
    "neo-psychedelia": "neo psychedelia",
    "lo-fi": "lofi",
    "lo-fi hip hop": "lofi hip hop",
    "lo-fi indie": "lofi indie",
    "nu-disco": "nu disco",
    "afro-beats": "afrobeats",
    "afro beats": "afrobeats",
    "drum & bass": "drum and bass",
    "dnb": "drum and bass",
    "rock & roll": "rock and roll",
    "rock n roll": "rock and roll",
    "música popular colombiana": "popular colombian music",
    "musica popular colombiana": "popular colombian music",
    "música mexicana": "música mexicana",
    "musica mexicana": "música mexicana",
}


# =============================================================================
# REMOVAL RULES
# =============================================================================

EXACT_REMOVE = {
    "",
    "unknown",
    "none",
    "null",
    "not electronic",
    "absolute reggae",
    "best rock",
    "pop star",
    "social media pop",
    "influential pop star",
    "pop culture",
    "queen of rap",
    "rap god",
    "mumble rapper",
    "rapping",
    "rap musicians",
    "rock musicians",
    "glam rock musicians",
    "glam rock music",
    "rock groups",
    "popular music",
    "pop music",
    "rock music",
    "country music",
    "traditional music",
    "western classical music",
    "electronic dance music",
    "rhythm and blues music",
    "swing music",
    "film score composer",
    "soundtrack composer",
    "gospel religious",
    "devotional buddhist chants",
    "hardcore band from virginia beach",
    "death by electrocution",
    "death by murder",
    "software company as artist",
    "academy award winner",
    "universal fire victim",
    "multiple ipi",
    "trainwreck",
    "trailer",
    "script-arab",
    "server name",
    "favorites",
    "favoritos",
    "cool",
    "not every artist",
    "not *every* artist",
    "various",
    "special purpose",
    "special purpose artist",
    "fix",
    "fixme",
    "mess",
    "make",
    "tags",
    "merge",
    "merge me",
    "mergeme",
    "cleanup",
    "dumping ground",
    "bogus",
    "bogus artist",
    "fuzzy artist",
    "author",
    "lyricist",
    "band",
    "boy group",
    "girl group",
    "boy band",
    "boysband",
    "male vocalists",
    "non-musician",
    "composers",
    "composer",
    "compositeur",
    "parolier",
    "chanteur",
    "va",
    "hp",
    "deu",
    "aln-sh",
    "http:",
}

REMOVE_CONTAINS = {
    "artist",
    "playlist",
    "collection",
    "compilation",
    "throwback",
    "billboard",
    "server",
    "software company",
    "needs to be removed",
    "test merging",
    "tags are fail",
    "various artist",
    "music for soccer moms",
    "has german audiobooks",
    "audiobook",
    "audio drama",
    "nursery rhymes",
    "kids songs",
    "kids hut",
    "wheels on the bus",
    "johny johny",
    "oldest artist",
    "put in brackets",
    "practically all these tags",
    "fix",
    "mess",
    "cleanup",
    "dumping ground",
    "academy award winner",
    "universal fire victim",
    "death by murder",
    "software company as artist",
    "hardcore band from",
    "foundational act of",
    "sharing stages with",
    "regarded as a cult",
    "record label",
    "soundtrack composer",
    "film score composer",
}

REMOVE_REGEXES = (
    re.compile(r"^https?:", re.I),
    re.compile(r"^www\.", re.I),
    re.compile(r"^[\d\s._#-]+$"),
    re.compile(r"^(?:19|20)?\d{2}s$"),
    re.compile(r"^(?:late|early)\s+\d{4}s$"),
    re.compile(r".*\b(?:vol|disc)\s*\d+\b.*", re.I),
    re.compile(r".*\b(?:hits|anthem|anthems)\b.*", re.I),
    re.compile(r".*\b(?:winner|victim)\b.*", re.I),
)


# =============================================================================
# FAMILY RULES
# =============================================================================

# Reglas exactas prioritarias. Estas reemplazan las familias generadas antes.
EXACT_FAMILY_RULES: dict[str, list[tuple[str, float, str]]] = {
    "dance": [
        ("electronic", 0.82, "manual"),
        ("pop", 0.58, "manual"),
    ],
    "reggaeton": [
        ("latin_urban", 1.00, "manual"),
        ("caribbean", 0.72, "manual"),
    ],
    "urbano latino": [
        ("latin_urban", 1.00, "manual"),
    ],
    "trap latino": [
        ("latin_urban", 1.00, "manual"),
        ("hip_hop", 0.86, "manual"),
    ],
    "dembow": [
        ("latin_urban", 1.00, "manual"),
        ("caribbean", 0.84, "manual"),
    ],
    "tropical house": [
        ("house", 1.00, "manual"),
        ("electronic", 0.82, "manual"),
    ],
    "garage rock": [
        ("rock", 1.00, "manual"),
    ],
    "garage punk": [
        ("rock", 1.00, "manual"),
    ],
    "uk garage": [
        ("bass_music", 1.00, "manual"),
        ("electronic", 0.84, "manual"),
    ],
    "garage": [
        ("bass_music", 0.92, "manual"),
        ("electronic", 0.78, "manual"),
    ],
    "garage house": [
        ("house", 1.00, "manual"),
        ("electronic", 0.80, "manual"),
    ],
    "hardcore hip hop": [
        ("hip_hop", 1.00, "manual"),
    ],
    "hardcore rap": [
        ("hip_hop", 1.00, "manual"),
    ],
    "hardcore techno": [
        ("techno", 1.00, "manual"),
        ("electronic", 0.82, "manual"),
    ],
    "hardcore punk": [
        ("rock", 1.00, "manual"),
    ],
    "afroswing": [
        ("african", 1.00, "manual"),
        ("hip_hop", 0.66, "manual"),
    ],
    "afro house": [
        ("house", 1.00, "manual"),
        ("african", 0.92, "manual"),
        ("electronic", 0.78, "manual"),
    ],
    "amapiano": [
        ("house", 0.94, "manual"),
        ("african", 1.00, "manual"),
        ("electronic", 0.74, "manual"),
    ],
    "afropiano": [
        ("house", 0.90, "manual"),
        ("african", 1.00, "manual"),
    ],
    "latin house": [
        ("house", 1.00, "manual"),
        ("latin_urban", 0.66, "manual"),
        ("latin_tropical", 0.56, "manual"),
    ],
    "latin pop": [
        ("pop", 1.00, "manual"),
        ("latin_tropical", 0.52, "manual"),
    ],
    "pop rap": [
        ("hip_hop", 0.94, "manual"),
        ("pop", 0.90, "manual"),
    ],
    "pop rock": [
        ("pop", 0.92, "manual"),
        ("rock", 0.92, "manual"),
    ],
    "electropop": [
        ("pop", 0.90, "manual"),
        ("electronic", 0.90, "manual"),
    ],
    "afropop": [
        ("african", 1.00, "manual"),
        ("pop", 0.72, "manual"),
    ],
    "latin afrobeats": [
        ("african", 0.84, "manual"),
        ("latin_urban", 0.72, "manual"),
    ],
    "electro corridos": [
        ("regional_mexican", 0.92, "manual"),
        ("electronic", 0.74, "manual"),
    ],
    "emo rap": [
        ("hip_hop", 0.94, "manual"),
        ("rock", 0.54, "manual"),
    ],
    "trap edm": [
        ("hip_hop", 0.72, "manual"),
        ("electronic", 0.92, "manual"),
    ],
    "afrobeat": [
        ("african", 1.00, "manual"),
    ],
    "afrobeats": [
        ("african", 1.00, "manual"),
    ],
    "r&b": [
        ("rnb_soul", 1.00, "manual"),
    ],
}

PREFIX_FAMILY_RULES: tuple[tuple[str, str, float], ...] = (
    ("reggaeton ", "latin_urban", 0.95),
    ("dembow ", "latin_urban", 0.95),
    ("cumbia ", "latin_tropical", 0.92),
    ("salsa ", "latin_tropical", 0.92),
    ("bachata ", "latin_tropical", 0.92),
    ("merengue ", "latin_tropical", 0.92),
    ("afro ", "african", 0.80),
    ("african ", "african", 0.88),
    ("brazilian ", "brazilian", 0.90),
    ("sertanejo ", "brazilian", 0.94),
    ("corridos ", "regional_mexican", 0.95),
    ("corrido ", "regional_mexican", 0.95),
    ("banda ", "regional_mexican", 0.90),
    ("k-pop ", "world_asian", 0.88),
    ("j-pop ", "world_asian", 0.88),
)

SUFFIX_FAMILY_RULES: tuple[tuple[str, str, float], ...] = (
    (" hip hop", "hip_hop", 0.95),
    (" rap", "hip_hop", 0.90),
    (" trap", "hip_hop", 0.88),
    (" drill", "hip_hop", 0.90),
    (" pop", "pop", 0.88),
    (" rock", "rock", 0.92),
    (" punk", "rock", 0.82),
    (" metal", "metal", 0.95),
    (" house", "house", 0.94),
    (" techno", "techno", 0.95),
    (" trance", "trance", 0.95),
    (" reggae", "caribbean", 0.90),
    (" dancehall", "caribbean", 0.95),
    (" cumbia", "latin_tropical", 0.92),
    (" salsa", "latin_tropical", 0.92),
    (" bachata", "latin_tropical", 0.92),
    (" gospel", "gospel_spiritual", 0.92),
    (" jazz", "jazz_blues", 0.92),
    (" blues", "jazz_blues", 0.92),
    (" classical", "classical", 0.94),
)

BASE_EXACT_FAMILIES: dict[str, list[tuple[str, float, str]]] = {
    "pop": [("pop", 1.00, "exact")],
    "hip hop": [("hip_hop", 1.00, "exact")],
    "rap": [("hip_hop", 1.00, "exact")],
    "trap": [("hip_hop", 1.00, "exact")],
    "drill": [("hip_hop", 1.00, "exact")],
    "rock": [("rock", 1.00, "exact")],
    "punk": [("rock", 1.00, "exact")],
    "metal": [("metal", 1.00, "exact")],
    "electronic": [("electronic", 1.00, "exact")],
    "electronica": [("electronic", 1.00, "exact")],
    "edm": [("electronic", 1.00, "exact")],
    "house": [("house", 1.00, "exact")],
    "techno": [("techno", 1.00, "exact")],
    "trance": [("trance", 1.00, "exact")],
    "reggae": [("caribbean", 1.00, "exact")],
    "dancehall": [("caribbean", 1.00, "exact")],
    "soca": [("caribbean", 1.00, "exact")],
    "cumbia": [("latin_tropical", 1.00, "exact")],
    "salsa": [("latin_tropical", 1.00, "exact")],
    "bachata": [("latin_tropical", 1.00, "exact")],
    "merengue": [("latin_tropical", 1.00, "exact")],
    "vallenato": [("latin_tropical", 1.00, "exact")],
    "mambo": [("latin_tropical", 1.00, "exact")],
    "corrido": [("regional_mexican", 1.00, "exact")],
    "banda": [("regional_mexican", 1.00, "exact")],
    "música mexicana": [("regional_mexican", 1.00, "exact")],
    "ranchera": [("regional_mexican", 1.00, "exact")],
    "sertanejo": [("brazilian", 1.00, "exact")],
    "forro": [("brazilian", 1.00, "exact")],
    "samba": [("brazilian", 1.00, "exact")],
    "jazz": [("jazz_blues", 1.00, "exact")],
    "blues": [("jazz_blues", 1.00, "exact")],
    "country": [("country_folk", 1.00, "exact")],
    "folk": [("country_folk", 1.00, "exact")],
    "classical": [("classical", 1.00, "exact")],
    "opera": [("classical", 1.00, "exact")],
    "gospel": [("gospel_spiritual", 1.00, "exact")],
    "k-pop": [("pop", 0.82, "exact"), ("world_asian", 1.00, "exact")],
    "j-pop": [("pop", 0.82, "exact"), ("world_asian", 1.00, "exact")],
    "mandopop": [("pop", 0.82, "exact"), ("world_asian", 1.00, "exact")],
}


# =============================================================================
# RELATION RULES
# =============================================================================

MANUAL_RELATED: dict[str, tuple[str, ...]] = {
    "reggaeton": (
        "urbano latino",
        "trap latino",
        "dembow",
        "latin pop",
        "reggaeton colombiano",
        "reggaeton chileno",
        "pop reggaeton",
        "dancehall",
    ),
    "urbano latino": (
        "reggaeton",
        "trap latino",
        "latin hip hop",
        "latin pop",
        "neoperreo",
        "dembow",
    ),
    "trap latino": (
        "reggaeton",
        "urbano latino",
        "latin hip hop",
        "trap argentino",
        "trap chileno",
        "trap boricua",
        "trap triste",
    ),
    "dembow": (
        "dembow dominicano",
        "reggaeton",
        "trap latino",
        "dancehall",
        "rap dominicano",
    ),
    "cumbia": (
        "cumbia pop",
        "cumbia sonidera",
        "cumbia nortena",
        "electrocumbia",
        "chicha",
        "cuarteto",
        "salsa",
    ),
    "bachata": (
        "merengue",
        "salsa",
        "latin pop",
        "kizomba",
        "bolero",
    ),
    "deep house": (
        "melodic house",
        "organic house",
        "tropical house",
        "progressive house",
        "afro house",
        "house",
    ),
    "house": (
        "deep house",
        "tech house",
        "progressive house",
        "future house",
        "electro house",
        "disco house",
        "funky house",
    ),
    "afro house": (
        "amapiano",
        "afro tech",
        "deep house",
        "tribal house",
        "latin house",
        "house",
    ),
    "amapiano": (
        "afropiano",
        "gqom",
        "3 step",
        "afro house",
        "private school piano",
        "bacardi",
    ),
    "hip hop": (
        "rap",
        "trap",
        "pop rap",
        "boom bap",
        "conscious hip hop",
        "old school hip hop",
    ),
    "trap": (
        "hip hop",
        "rap",
        "melodic rap",
        "drill",
        "cloud rap",
        "trap soul",
    ),
    "pop": (
        "dance pop",
        "pop rock",
        "electropop",
        "indie pop",
        "art pop",
        "synth pop",
    ),
    "rock": (
        "alternative rock",
        "classic rock",
        "indie rock",
        "hard rock",
        "pop rock",
        "modern rock",
    ),
    "afrobeats": (
        "afrobeat",
        "afropop",
        "afroswing",
        "nigerian pop",
        "amapiano",
        "dancehall",
    ),
    "dancehall": (
        "reggae",
        "soca",
        "ragga",
        "dembow",
        "afrobeats",
        "shatta",
    ),
}

MANUAL_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "reggaeton": (
        "dancehall",
        "dembow",
        "latin house",
        "afrobeats",
        "cumbia",
        "moombahton",
    ),
    "trap latino": (
        "reggaeton",
        "latin house",
        "hip hop",
        "afrobeats",
        "dembow",
    ),
    "cumbia": (
        "reggaeton",
        "latin house",
        "guaracha",
        "salsa",
        "merengue",
    ),
    "bachata": (
        "reggaeton",
        "latin pop",
        "salsa",
        "kizomba",
    ),
    "deep house": (
        "afro house",
        "latin house",
        "nu disco",
        "downtempo",
        "tropical house",
    ),
    "house": (
        "techno",
        "trance",
        "disco",
        "afro house",
        "latin house",
    ),
    "afro house": (
        "amapiano",
        "afrobeats",
        "latin house",
        "deep house",
        "tech house",
    ),
    "amapiano": (
        "afro house",
        "afrobeats",
        "gqom",
        "dancehall",
        "house",
    ),
    "hip hop": (
        "r&b",
        "pop rap",
        "afrobeats",
        "dancehall",
        "trap",
    ),
    "pop": (
        "dance pop",
        "house",
        "r&b",
        "pop rock",
        "latin pop",
    ),
    "dancehall": (
        "reggaeton",
        "afrobeats",
        "soca",
        "dembow",
        "amapiano",
    ),
}

FAMILY_BRIDGES: dict[str, tuple[str, ...]] = {
    "latin_urban": (
        "dancehall",
        "afrobeats",
        "latin house",
        "cumbia",
        "moombahton",
    ),
    "latin_tropical": (
        "reggaeton",
        "latin house",
        "guaracha",
        "dancehall",
    ),
    "house": (
        "afro house",
        "techno",
        "nu disco",
        "latin house",
    ),
    "hip_hop": (
        "r&b",
        "afrobeats",
        "dancehall",
        "pop rap",
    ),
    "pop": (
        "dance pop",
        "house",
        "r&b",
        "latin pop",
    ),
    "caribbean": (
        "reggaeton",
        "afrobeats",
        "amapiano",
        "soca",
    ),
    "african": (
        "afro house",
        "dancehall",
        "reggaeton",
        "amapiano",
    ),
    "rock": (
        "pop rock",
        "indie pop",
        "electronic rock",
    ),
}


# =============================================================================
# HELPERS
# =============================================================================

def safe_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_genre(value: Any) -> str:
    text = safe_text(value).lower()
    text = text.replace("’", "'").replace("–", "-").replace("—", "-")
    text = normalize_spaces(text)
    text = text.strip(" ,;|/[]{}()\"'`")
    return ALIAS_MAP.get(text, text)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.lower())
    plain = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    plain = re.sub(r"[^a-z0-9]+", "_", plain)
    return plain.strip("_")


def unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)

    return result


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def rounded(value: float) -> float:
    return round(clamp(value), 3)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)


def write_csv(
    path: Path,
    rows: Sequence[Mapping[str, Any]],
    fieldnames: Sequence[str],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(rows)


def should_remove(genre: str) -> str | None:
    if not genre:
        return "empty"

    if genre in EXACT_REMOVE:
        return "known_non_genre"

    for fragment in REMOVE_CONTAINS:
        if fragment in genre:
            return "metadata_or_editorial"

    for pattern in REMOVE_REGEXES:
        if pattern.fullmatch(genre) or pattern.match(genre):
            return "regex_non_genre"

    return None


# =============================================================================
# FAMILY REFINEMENT
# =============================================================================

def merge_family_assignment(
    target: dict[str, dict[str, Any]],
    family: str,
    weight: float,
    confidence: str,
    reason: str,
) -> None:
    current = target.get(family)

    candidate = {
        "name": family,
        "weight": rounded(weight),
        "confidence": confidence,
        "confidenceScore": CONFIDENCE_SCORES[confidence],
        "reason": reason,
    }

    if current is None:
        target[family] = candidate
        return

    if (
        candidate["weight"] > current["weight"]
        or candidate["confidenceScore"] > current["confidenceScore"]
    ):
        target[family] = candidate


def refine_families(
    genre: str,
    original_record: Mapping[str, Any],
) -> list[dict[str, Any]]:
    assignments: dict[str, dict[str, Any]] = {}

    for family, weight, confidence in BASE_EXACT_FAMILIES.get(genre, []):
        merge_family_assignment(
            assignments,
            family,
            weight,
            confidence,
            "base_exact_genre",
        )

    for family, weight, confidence in EXACT_FAMILY_RULES.get(genre, []):
        merge_family_assignment(
            assignments,
            family,
            weight,
            confidence,
            "manual_exact_rule",
        )

    for prefix, family, weight in PREFIX_FAMILY_RULES:
        if genre.startswith(prefix):
            merge_family_assignment(
                assignments,
                family,
                weight,
                "prefix",
                f"prefix:{prefix.strip()}",
            )

    for suffix, family, weight in SUFFIX_FAMILY_RULES:
        if genre.endswith(suffix):
            merge_family_assignment(
                assignments,
                family,
                weight,
                "suffix",
                f"suffix:{suffix.strip()}",
            )

    # Conserva familias anteriores solo como fallback y con menor peso.
    for original_family in original_record.get("families", []):
        merge_family_assignment(
            assignments,
            safe_text(original_family),
            0.45,
            "fallback",
            "original_graph_family",
        )

    ordered = sorted(
        assignments.values(),
        key=lambda item: (
            -float(item["weight"]),
            -float(item["confidenceScore"]),
            item["name"],
        ),
    )

    return ordered


def primary_family(families: Sequence[Mapping[str, Any]]) -> str | None:
    if not families:
        return None
    return safe_text(families[0].get("name")) or None


def secondary_families(
    families: Sequence[Mapping[str, Any]],
) -> list[str]:
    return [
        safe_text(item.get("name"))
        for item in families[1:]
        if safe_text(item.get("name"))
    ]


# =============================================================================
# RELATION REFINEMENT
# =============================================================================

def available_only(
    values: Iterable[str],
    available: set[str],
    self_genre: str,
) -> list[str]:
    return unique(
        normalize_genre(value)
        for value in values
        if normalize_genre(value) in available
        and normalize_genre(value) != self_genre
    )


def build_related_styles(
    genre: str,
    record: Mapping[str, Any],
    records: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    available = set(records)

    manual = available_only(
        MANUAL_RELATED.get(genre, ()),
        available,
        genre,
    )

    graph_related = available_only(
        record.get("relatedStyles", []),
        available,
        genre,
    )

    parent = safe_text(record.get("parent"))
    siblings: list[str] = []

    if parent:
        siblings = [
            other_genre
            for other_genre, other_record in records.items()
            if other_genre != genre
            and safe_text(other_record.get("parent")) == parent
        ]
        siblings.sort(
            key=lambda item: (
                -int(records[item].get("trackCount", 0)),
                item,
            )
        )

    own_primary = primary_family(record.get("familyAssignments", []))
    same_primary: list[str] = []

    if own_primary:
        for other_genre, other_record in records.items():
            if other_genre == genre:
                continue
            if primary_family(other_record.get("familyAssignments", [])) == own_primary:
                same_primary.append(other_genre)

        same_primary.sort(
            key=lambda item: (
                -int(records[item].get("trackCount", 0)),
                item,
            )
        )

    return unique(
        manual
        + siblings[:6]
        + graph_related[:6]
        + same_primary[:6]
    )[:MAX_RELATED_STYLES]


def build_transition_styles(
    genre: str,
    record: Mapping[str, Any],
    records: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    available = set(records)

    manual = available_only(
        MANUAL_TRANSITIONS.get(genre, ()),
        available,
        genre,
    )

    graph_transitions = available_only(
        record.get("transitionStyles", []),
        available,
        genre,
    )

    bridges: list[str] = []
    family_names = [
        safe_text(item.get("name"))
        for item in record.get("familyAssignments", [])
    ]

    for family in family_names:
        bridges.extend(FAMILY_BRIDGES.get(family, ()))

    bridge_values = available_only(bridges, available, genre)

    return unique(
        manual
        + graph_transitions[:5]
        + bridge_values
    )[:MAX_TRANSITION_STYLES]


# =============================================================================
# MATCH PROFILE
# =============================================================================

def family_weight_map(record: Mapping[str, Any]) -> dict[str, float]:
    return {
        safe_text(item.get("name")): float(item.get("weight", 0))
        for item in record.get("familyAssignments", [])
        if safe_text(item.get("name"))
    }


def relation_score(
    source_genre: str,
    target_genre: str,
    records: Mapping[str, Mapping[str, Any]],
    same_style: bool,
) -> float:
    if source_genre == target_genre:
        return 1.0

    source = records[source_genre]
    target = records[target_genre]

    source_parent = safe_text(source.get("parent"))
    target_parent = safe_text(target.get("parent"))

    if same_style and source_parent and source_parent == target_parent:
        return SAME_STYLE_WEIGHTS["same_parent"]

    if same_style and target_genre in MANUAL_RELATED.get(source_genre, ()):
        return SAME_STYLE_WEIGHTS["manual_related"]

    if (
        not same_style
        and target_genre in MANUAL_TRANSITIONS.get(source_genre, ())
    ):
        return CROSS_STYLE_WEIGHTS["manual_transition"]

    source_families = family_weight_map(source)
    target_families = family_weight_map(target)

    shared = set(source_families) & set(target_families)

    if shared:
        strongest_shared = max(
            min(source_families[family], target_families[family])
            for family in shared
        )

        source_primary = primary_family(source.get("familyAssignments", []))
        target_primary = primary_family(target.get("familyAssignments", []))

        if same_style and source_primary == target_primary:
            return rounded(
                SAME_STYLE_WEIGHTS["shared_primary_family"]
                * strongest_shared
            )

        if same_style:
            return rounded(
                SAME_STYLE_WEIGHTS["shared_secondary_family"]
                * strongest_shared
            )

        return rounded(
            CROSS_STYLE_WEIGHTS["shared_secondary_family"]
            * strongest_shared
        )

    if same_style and target_genre in source.get("relatedStyles", []):
        return SAME_STYLE_WEIGHTS["graph_related"]

    if not same_style and target_genre in source.get("transitionStyles", []):
        return CROSS_STYLE_WEIGHTS["graph_transition"]

    return 0.0


def build_match_profiles(
    records: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    profiles: dict[str, Any] = {}

    genres = list(records)

    for genre in genres:
        same_scores: list[tuple[float, str]] = []
        cross_scores: list[tuple[float, str]] = []

        candidate_pool = unique(
            [genre]
            + list(records[genre].get("relatedStyles", []))
            + list(records[genre].get("transitionStyles", []))
            + [
                other
                for other in genres
                if primary_family(
                    records[other].get("familyAssignments", [])
                )
                == primary_family(
                    records[genre].get("familyAssignments", [])
                )
            ][:40]
        )

        for candidate in candidate_pool:
            if candidate not in records:
                continue

            same_score = relation_score(
                genre,
                candidate,
                records,
                same_style=True,
            )
            cross_score = relation_score(
                genre,
                candidate,
                records,
                same_style=False,
            )

            if same_score > 0:
                same_scores.append((same_score, candidate))

            if cross_score > 0 and candidate != genre:
                cross_scores.append((cross_score, candidate))

        same_scores.sort(
            key=lambda item: (
                -item[0],
                -int(records[item[1]].get("trackCount", 0)),
                item[1],
            )
        )
        cross_scores.sort(
            key=lambda item: (
                -item[0],
                -int(records[item[1]].get("trackCount", 0)),
                item[1],
            )
        )

        profiles[genre] = {
            "primaryFamily": primary_family(
                records[genre].get("familyAssignments", [])
            ),
            "secondaryFamilies": secondary_families(
                records[genre].get("familyAssignments", [])
            ),
            "sameStyle": {
                candidate: rounded(score)
                for score, candidate in same_scores[:MAX_MATCH_RESULTS]
            },
            "crossStyle": {
                candidate: rounded(score)
                for score, candidate in cross_scores[:MAX_MATCH_RESULTS]
            },
        }

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "description": (
            "Perfiles de compatibilidad iniciales para Same Style "
            "y Cross Style."
        ),
        "profiles": profiles,
    }


# =============================================================================
# REVIEW QUEUE
# =============================================================================

def review_reasons(record: Mapping[str, Any]) -> list[str]:
    reasons: list[str] = []

    assignments = record.get("familyAssignments", [])

    if not assignments:
        reasons.append("no_family")

    if len(assignments) >= 3:
        reasons.append("many_families")

    if assignments:
        top_weight = float(assignments[0].get("weight", 0))
        top_confidence = safe_text(assignments[0].get("confidence"))

        if top_weight < 0.70:
            reasons.append("low_primary_weight")

        if top_confidence in {"fallback", "inferred"}:
            reasons.append("low_confidence")

    if not record.get("relatedStyles"):
        reasons.append("no_related_styles")

    if not record.get("transitionStyles"):
        reasons.append("no_transition_styles")

    genre = safe_text(record.get("label"))

    if any(
        token in genre
        for token in (
            "viral",
            "idol",
            "classic",
            "modern",
            "deep",
            "alternative",
            "experimental",
            "traditional",
        )
    ):
        reasons.append("broad_or_marketing_tag")

    return unique(reasons)


def review_priority(
    track_count: int,
    reasons: Sequence[str],
    family_assignments: Sequence[Mapping[str, Any]],
) -> float:
    uncertainty = 0.0

    uncertainty += 1.4 if "no_family" in reasons else 0.0
    uncertainty += 1.0 if "low_confidence" in reasons else 0.0
    uncertainty += 0.8 if "many_families" in reasons else 0.0
    uncertainty += 0.7 if "low_primary_weight" in reasons else 0.0
    uncertainty += 0.5 if "no_related_styles" in reasons else 0.0
    uncertainty += 0.4 if "no_transition_styles" in reasons else 0.0
    uncertainty += 0.5 if "broad_or_marketing_tag" in reasons else 0.0

    if family_assignments:
        uncertainty += max(
            0.0,
            1.0 - float(family_assignments[0].get("weight", 0))
        )

    return round(math.log10(max(track_count, 1) + 1) * uncertainty, 4)


def build_review_queue(
    records: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for genre, record in records.items():
        track_count = int(record.get("trackCount", 0))

        if track_count < MIN_REVIEW_TRACK_COUNT:
            continue

        reasons = review_reasons(record)

        if not reasons:
            continue

        assignments = record.get("familyAssignments", [])

        rows.append(
            {
                "Genre": genre,
                "TrackCount": track_count,
                "PrimaryFamily": primary_family(assignments) or "",
                "SecondaryFamilies": " | ".join(
                    secondary_families(assignments)
                ),
                "PrimaryWeight": (
                    assignments[0].get("weight", "")
                    if assignments
                    else ""
                ),
                "PrimaryConfidence": (
                    assignments[0].get("confidence", "")
                    if assignments
                    else ""
                ),
                "ReviewReasons": " | ".join(reasons),
                "PriorityScore": review_priority(
                    track_count,
                    reasons,
                    assignments,
                ),
            }
        )

    rows.sort(
        key=lambda row: (
            -float(row["PriorityScore"]),
            -int(row["TrackCount"]),
            str(row["Genre"]),
        )
    )

    return rows


# =============================================================================
# MAIN REFINEMENT
# =============================================================================

def refine_graph(
    source_graph: Mapping[str, Any],
) -> tuple[
    dict[str, dict[str, Any]],
    list[dict[str, Any]],
]:
    raw_genres = source_graph.get("genres", {})

    if not isinstance(raw_genres, dict):
        raise ValueError(
            "genre_graph.json no contiene un objeto válido en 'genres'."
        )

    removed_rows: list[dict[str, Any]] = []
    staged: dict[str, dict[str, Any]] = {}

    for raw_genre, raw_record in raw_genres.items():
        genre = normalize_genre(raw_genre)
        reason = should_remove(genre)

        if reason:
            removed_rows.append(
                {
                    "Genre": raw_genre,
                    "NormalizedGenre": genre,
                    "TrackCount": int(raw_record.get("trackCount", 0)),
                    "Reason": reason,
                }
            )
            continue

        record = dict(raw_record)
        record["label"] = genre
        record["id"] = slugify(genre)
        record["aliases"] = unique(
            [
                normalize_genre(alias)
                for alias in record.get("aliases", [])
            ]
            + [
                alias
                for alias, canonical in ALIAS_MAP.items()
                if canonical == genre and alias != genre
            ]
        )

        if genre in staged:
            existing = staged[genre]
            existing["trackCount"] = (
                int(existing.get("trackCount", 0))
                + int(record.get("trackCount", 0))
            )
            existing["tsOccurrenceCount"] = (
                int(existing.get("tsOccurrenceCount", 0))
                + int(record.get("tsOccurrenceCount", 0))
            )
            existing["artistOccurrenceCount"] = (
                int(existing.get("artistOccurrenceCount", 0))
                + int(record.get("artistOccurrenceCount", 0))
            )
            existing["aliases"] = unique(
                existing.get("aliases", [])
                + record.get("aliases", [])
                + [raw_genre]
            )
        else:
            staged[genre] = record

    # Refine family assignments.
    for genre, record in staged.items():
        assignments = refine_families(genre, record)
        record["familyAssignments"] = assignments
        record["primaryFamily"] = primary_family(assignments)
        record["secondaryFamilies"] = secondary_families(assignments)
        record["families"] = [
            item["name"]
            for item in assignments
        ]

    available = set(staged)

    # Clean parent references.
    for genre, record in staged.items():
        parent = normalize_genre(record.get("parent"))

        if parent not in available or parent == genre:
            parent = None

        record["parent"] = parent

    # Rebuild children.
    children_map: dict[str, list[str]] = defaultdict(list)

    for genre, record in staged.items():
        parent = record.get("parent")
        if parent:
            children_map[parent].append(genre)

    for genre, record in staged.items():
        record["children"] = sorted(
            children_map.get(genre, []),
            key=lambda child: (
                -int(staged[child].get("trackCount", 0)),
                child,
            ),
        )

    # Rebuild relationships.
    snapshot = {
        genre: dict(record)
        for genre, record in staged.items()
    }

    for genre, record in staged.items():
        record["relatedStyles"] = build_related_styles(
            genre,
            snapshot[genre],
            snapshot,
        )
        record["transitionStyles"] = build_transition_styles(
            genre,
            snapshot[genre],
            snapshot,
        )

    removed_rows.sort(
        key=lambda row: (
            -int(row["TrackCount"]),
            str(row["NormalizedGenre"]),
        )
    )

    return staged, removed_rows


def build_alias_payload(
    records: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    alias_to_canonical: dict[str, str] = {}

    for genre, record in records.items():
        for alias in record.get("aliases", []):
            normalized_alias = normalize_genre(alias)

            if normalized_alias and normalized_alias != genre:
                alias_to_canonical[normalized_alias] = genre

    for alias, canonical in ALIAS_MAP.items():
        if canonical in records and alias != canonical:
            alias_to_canonical[alias] = canonical

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "aliases": dict(
            sorted(alias_to_canonical.items())
        ),
    }


def build_summary(
    source_count: int,
    records: Mapping[str, Mapping[str, Any]],
    removed_rows: Sequence[Mapping[str, Any]],
    review_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    family_counts: Counter[str] = Counter()
    confidence_counts: Counter[str] = Counter()

    for record in records.values():
        for assignment in record.get("familyAssignments", []):
            family_counts[assignment["name"]] += 1
            confidence_counts[assignment["confidence"]] += 1

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "project_root": str(PROJECT_ROOT),
        "input_file": str(INPUT_GRAPH_FILE),
        "output_directory": str(OUTPUT_DIR),
        "statistics": {
            "source_genres": source_count,
            "refined_genres": len(records),
            "removed_genres": len(removed_rows),
            "genres_without_family": sum(
                1
                for record in records.values()
                if not record.get("familyAssignments")
            ),
            "genres_with_multiple_families": sum(
                1
                for record in records.values()
                if len(record.get("familyAssignments", [])) > 1
            ),
            "genres_with_parent": sum(
                1
                for record in records.values()
                if record.get("parent")
            ),
            "genres_with_related_styles": sum(
                1
                for record in records.values()
                if record.get("relatedStyles")
            ),
            "genres_with_transition_styles": sum(
                1
                for record in records.values()
                if record.get("transitionStyles")
            ),
            "review_queue_size": len(review_rows),
            "family_counts": dict(family_counts.most_common()),
            "confidence_counts": dict(
                confidence_counts.most_common()
            ),
        },
        "rules": {
            "minimum_review_track_count": MIN_REVIEW_TRACK_COUNT,
            "max_related_styles": MAX_RELATED_STYLES,
            "max_transition_styles": MAX_TRANSITION_STYLES,
            "max_match_results": MAX_MATCH_RESULTS,
        },
        "output_files": {
            "genre_graph_refined": str(REFINED_GRAPH_FILE),
            "genre_alias_map": str(ALIAS_MAP_FILE),
            "genre_match_profiles": str(MATCH_PROFILES_FILE),
            "genre_review_queue": str(REVIEW_QUEUE_FILE),
            "removed_genres": str(REMOVED_GENRES_FILE),
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


def main() -> int:
    print_header("FLAMINGO DJ APP - REFINE GENRE GRAPH")

    print(f"Proyecto detectado:\n  {PROJECT_ROOT}")
    print(f"Entrada:\n  {INPUT_GRAPH_FILE}")

    if not INPUT_GRAPH_FILE.exists():
        raise FileNotFoundError(
            "No se encontró genre_graph.json.\n"
            f"Ubicación esperada:\n  {INPUT_GRAPH_FILE}\n\n"
            "Ejecuta primero BUILD_GENRE.py."
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    source_graph = read_json(INPUT_GRAPH_FILE)
    source_genres = source_graph.get("genres", {})

    if not isinstance(source_genres, dict):
        raise ValueError(
            "El archivo genre_graph.json no tiene un campo 'genres' válido."
        )

    print(f"Géneros de entrada: {len(source_genres):,}")

    records, removed_rows = refine_graph(source_graph)

    refined_payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "description": (
            "Grafo refinado de géneros para Flamingo DJ App."
        ),
        "genres": records,
    }

    alias_payload = build_alias_payload(records)
    match_profiles = build_match_profiles(records)
    review_rows = build_review_queue(records)

    summary = build_summary(
        source_count=len(source_genres),
        records=records,
        removed_rows=removed_rows,
        review_rows=review_rows,
    )

    write_json(REFINED_GRAPH_FILE, refined_payload)
    write_json(ALIAS_MAP_FILE, alias_payload)
    write_json(MATCH_PROFILES_FILE, match_profiles)

    write_csv(
        REVIEW_QUEUE_FILE,
        review_rows,
        (
            "Genre",
            "TrackCount",
            "PrimaryFamily",
            "SecondaryFamilies",
            "PrimaryWeight",
            "PrimaryConfidence",
            "ReviewReasons",
            "PriorityScore",
        ),
    )

    write_csv(
        REMOVED_GENRES_FILE,
        removed_rows,
        (
            "Genre",
            "NormalizedGenre",
            "TrackCount",
            "Reason",
        ),
    )

    write_json(SUMMARY_FILE, summary)

    stats = summary["statistics"]

    print_header("RESULTADOS")
    print(f"Géneros refinados: {stats['refined_genres']:,}")
    print(f"Géneros removidos: {stats['removed_genres']:,}")
    print(
        "Géneros sin familia: "
        f"{stats['genres_without_family']:,}"
    )
    print(
        "Géneros con múltiples familias: "
        f"{stats['genres_with_multiple_families']:,}"
    )
    print(
        "Géneros con relatedStyles: "
        f"{stats['genres_with_related_styles']:,}"
    )
    print(
        "Géneros con transitionStyles: "
        f"{stats['genres_with_transition_styles']:,}"
    )
    print(
        "Cola de revisión: "
        f"{stats['review_queue_size']:,}"
    )

    print_header("ARCHIVOS GENERADOS")
    print(f"  OK: {REFINED_GRAPH_FILE}")
    print(f"  OK: {ALIAS_MAP_FILE}")
    print(f"  OK: {MATCH_PROFILES_FILE}")
    print(f"  OK: {REVIEW_QUEUE_FILE}")
    print(f"  OK: {REMOVED_GENRES_FILE}")
    print(f"  OK: {SUMMARY_FILE}")

    print_header("SIGUIENTE REVISIÓN")
    print(
        "Comparte estos archivos:\n"
        f"  - {SUMMARY_FILE.name}\n"
        f"  - {REVIEW_QUEUE_FILE.name}\n"
        f"  - {REMOVED_GENRES_FILE.name}\n"
        f"  - {MATCH_PROFILES_FILE.name}"
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nProceso cancelado.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as error:
        print_header("ERROR")
        print(
            f"{type(error).__name__}: {error}",
            file=sys.stderr,
        )
        raise SystemExit(1)
