#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
BUILD_GENRE.py

Construye el grafo inicial de géneros de Flamingo DJ App a partir de:

    <PROJECT_ROOT>/data/genres/cleaned/clean_genres.csv

Salida:

    <PROJECT_ROOT>/data/genres/taxonomy/
        genre_graph.json
        genre_families.json
        genre_relations.json
        unmapped_genres.csv
        rejected_taxonomy_genres.csv
        taxonomy_summary.json

Características
---------------
- Detecta automáticamente la raíz del proyecto desde la ubicación del script.
- No modifica las bases de datos.
- No escribe fuera de FLAMINGOAPP_DJ_REACT.
- Consolida aliases comunes.
- Descarta basura residual que sobrevivió a la primera limpieza.
- Asigna una o más familias a cada género.
- Genera relaciones básicas:
    parent
    families
    relatedStyles
    transitionStyles
- Usa reglas determinísticas, reproducibles y editables.
- Puede ejecutarse varias veces sin duplicar datos.
"""

from __future__ import annotations

import csv
import json
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

INPUT_DIR = PROJECT_ROOT / "data" / "genres" / "cleaned"
OUTPUT_DIR = PROJECT_ROOT / "data" / "genres" / "taxonomy"

INPUT_FILE = INPUT_DIR / "clean_genres.csv"

GENRE_GRAPH_FILE = OUTPUT_DIR / "genre_graph.json"
GENRE_FAMILIES_FILE = OUTPUT_DIR / "genre_families.json"
GENRE_RELATIONS_FILE = OUTPUT_DIR / "genre_relations.json"
UNMAPPED_FILE = OUTPUT_DIR / "unmapped_genres.csv"
REJECTED_FILE = OUTPUT_DIR / "rejected_taxonomy_genres.csv"
SUMMARY_FILE = OUTPUT_DIR / "taxonomy_summary.json"


# =============================================================================
# CONFIGURATION
# =============================================================================

MIN_TRACK_COUNT = 5
MAX_GENRE_LENGTH = 70
MAX_GENRE_WORDS = 8

# Alias exactos adicionales para consolidar resultados.
ALIASES: dict[str, str] = {
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
    "country-pop": "country pop",
    "dance-rock": "dance rock",
    "post-rock": "post rock",
    "post-punk": "post punk",
    "post-grunge": "post grunge",
    "neo-psychedelia": "neo psychedelia",
    "lo-fi": "lofi",
    "lo-fi hip hop": "lofi hip hop",
    "lo-fi indie": "lofi indie",
    "pop and chart": "pop",
    "rock and indie": "indie rock",
    "classic pop and rock": "classic rock",
    "hip hop rnb and dance hall": "hip hop",
    "dance and electronica": "electronic",
    "tropical music": "tropical",
    "uk": "uk music",
    "us": "us music",
    "usa": "us music",
    "united states": "us music",
    "estados unidos": "us music",
    "united kingdom": "uk music",
    "reino unido": "uk music",
}

# Valores que no representan géneros.
EXACT_REJECT = {
    "",
    "unknown",
    "none",
    "null",
    "fix",
    "fixme",
    "fix‌me",
    "mess",
    "m‌ess",
    "make",
    "tags",
    "various",
    "special purpose",
    "special purpose artist",
    "bogus",
    "bogus artist",
    "fuzzy artist",
    "merge",
    "merge me",
    "mergeme",
    "cleanup",
    "dumping ground",
    "author",
    "lyricist",
    "band",
    "girl group",
    "boy group",
    "boy band",
    "boysband",
    "male vocalists",
    "film composer",
    "british composer",
    "composer",
    "composers",
    "compositeur",
    "parolier",
    "chanteur",
    "non-musician",
    "software company as artist",
    "server name",
    "academy award winner",
    "2008 universal fire victim",
    "queer",
    "queerphobe",
    "transphobe",
    "terf",
    "criminal",
    "nepo baby",
    "death by murder",
    "re-recording",
    "multiple ipi",
    "favorites",
    "favoritos",
    "cool",
    "hp",
    "nuno",
    "deu",
    "aln-sh",
    "http:",
    "va",
}

REJECT_CONTAINS = {
    "artist",
    "album",
    "playlist",
    "collection",
    "hits",
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
    "not every artist",
    "not *every* artist",
    "practically all these tags",
    "fix",
    "mess",
    "cleanup",
    "dumping ground",
    "academy award winner",
    "universal fire victim",
    "death by murder",
    "software company as artist",
}

COUNTRY_ONLY = {
    "american",
    "americain",
    "britannique",
    "british",
    "canadian",
    "columbia",
    "england",
    "european",
    "france",
    "french",
    "german",
    "hungarian",
    "hungary",
    "italian",
    "japan",
    "korean",
    "kolumbien",
    "lithuania",
    "lithuanian",
    "magyar",
    "reino unido",
    "russian",
    "scotland",
    "scottish",
    "turkish",
    "uk music",
    "us music",
    "united kingdom",
    "united states",
    "virginia",
}

DECADE_ONLY_RE = re.compile(r"^(?:\d{2}s|(?:19|20)\d{2}s?|late \d{4}s)$")
URL_RE = re.compile(r"(?:https?://|www\.|\.com\b|\.net\b|\.org\b)", re.I)
NUMBER_GARBAGE_RE = re.compile(r"^[\d\s._#-]+$")


# =============================================================================
# TAXONOMY FAMILIES
# =============================================================================

FAMILY_RULES: dict[str, tuple[str, ...]] = {
    "pop": (
        "pop",
        "adult contemporary",
        "ballad",
        "boy band",
        "girl group",
        "idol",
        "viral pop",
        "teen pop",
        "europop",
        "scandipop",
    ),
    "hip_hop": (
        "hip hop",
        "rap",
        "trap",
        "drill",
        "grime",
        "boom bap",
        "g-funk",
        "phonk",
        "rage",
    ),
    "rnb_soul": (
        "r&b",
        "soul",
        "motown",
        "new jack swing",
        "quiet storm",
        "urban contemporary",
    ),
    "rock": (
        "rock",
        "grunge",
        "britpop",
        "shoegaze",
        "emo",
        "aor",
        "punk",
        "new wave",
    ),
    "metal": (
        "metal",
        "metalcore",
        "death metal",
        "black metal",
        "doom",
        "djent",
        "hardcore",
    ),
    "electronic": (
        "electronic",
        "electronica",
        "edm",
        "electro",
        "indietronica",
        "downtempo",
        "ambient",
        "chillwave",
        "idm",
    ),
    "house": (
        "house",
        "amapiano",
        "afropiano",
        "gqom",
        "3 step",
        "bacardi",
    ),
    "techno": (
        "techno",
        "tekno",
        "hypertechno",
    ),
    "trance": (
        "trance",
        "psytrance",
    ),
    "bass_music": (
        "drum and bass",
        "jungle",
        "dubstep",
        "brostep",
        "riddim",
        "future bass",
        "uk garage",
        "garage",
        "breakbeat",
    ),
    "latin_urban": (
        "reggaeton",
        "urbano latino",
        "trap latino",
        "latin hip hop",
        "latin rap",
        "dembow",
        "neoperreo",
        "rkt",
        "turreo",
        "mambo chileno",
        "chilean mambo",
        "techengue",
    ),
    "latin_tropical": (
        "bachata",
        "salsa",
        "merengue",
        "cumbia",
        "vallenato",
        "mambo",
        "tropical",
        "bolero",
        "guaracha",
        "candombe",
        "cuarteto",
        "chicha",
        "electrocumbia",
    ),
    "regional_mexican": (
        "corrido",
        "banda",
        "música mexicana",
        "regional mexicano",
        "ranchera",
        "norteno",
        "sierreno",
        "grupera",
        "mariachi",
        "tejano",
    ),
    "caribbean": (
        "reggae",
        "dancehall",
        "soca",
        "calypso",
        "ragga",
        "zouk",
        "kompa",
        "kizomba",
        "kuduro",
        "shatta",
    ),
    "african": (
        "afrobeat",
        "afrobeats",
        "afropop",
        "afro house",
        "afro tech",
        "afroswing",
        "highlife",
        "hiplife",
        "azonto",
        "azontobeats",
        "amapiano",
        "gqom",
        "ndombolo",
        "rumba congolaise",
        "coupe decale",
        "bongo flava",
        "maskandi",
    ),
    "brazilian": (
        "brazilian",
        "funk carioca",
        "funk paulista",
        "funk rj",
        "funk mtg",
        "brega",
        "pagode",
        "samba",
        "sertanejo",
        "forro",
        "piseiro",
        "mpb",
        "arrocha",
        "agronejo",
    ),
    "country_folk": (
        "country",
        "folk",
        "americana",
        "bluegrass",
        "singer-songwriter",
        "roots",
    ),
    "jazz_blues": (
        "jazz",
        "blues",
        "swing",
        "bossa nova",
        "big band",
    ),
    "classical": (
        "classical",
        "opera",
        "orchestral",
        "concerto",
        "baroque",
        "choral",
        "film score",
    ),
    "world_asian": (
        "k-pop",
        "j-pop",
        "c-pop",
        "mandopop",
        "cantopop",
        "v-pop",
        "t-pop",
        "bollywood",
        "filmi",
        "desi",
        "punjabi",
        "hindi",
        "tamil",
        "tollywood",
        "kollywood",
        "opm",
    ),
    "middle_eastern": (
        "arab",
        "khaleeji",
        "khaliji",
        "mizrahi",
        "laiko",
        "entehno",
        "rai",
        "manele",
        "chalga",
        "mahraganat",
        "shaabi",
        "sufi",
        "qawwali",
    ),
    "gospel_spiritual": (
        "gospel",
        "worship",
        "christian",
        "devotional",
        "sholawat",
    ),
    "soundtrack_stage": (
        "soundtrack",
        "film score",
        "musical",
        "vgm",
        "anime",
    ),
}


# Relaciones manuales principales. El script solo conservará géneros presentes.
RELATED_STYLE_RULES: dict[str, tuple[str, ...]] = {
    "reggaeton": (
        "urbano latino",
        "trap latino",
        "dembow",
        "latin pop",
        "reggaeton colombiano",
        "reggaeton chileno",
        "reggaeton flow",
        "pop reggaeton",
    ),
    "urbano latino": (
        "reggaeton",
        "trap latino",
        "latin hip hop",
        "latin pop",
        "pop urbano",
        "neoperreo",
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
        "rap dominicano",
        "reggaeton",
        "trap latino",
        "dancehall",
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
    "salsa": (
        "merengue",
        "bachata",
        "cumbia",
        "mambo",
        "tropical",
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

TRANSITION_STYLE_RULES: dict[str, tuple[str, ...]] = {
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


PARENT_RULES: dict[str, str] = {
    "deep house": "house",
    "tech house": "house",
    "progressive house": "house",
    "future house": "house",
    "electro house": "house",
    "disco house": "house",
    "funky house": "house",
    "tropical house": "house",
    "afro house": "house",
    "latin house": "house",
    "tribal house": "house",
    "melodic house": "house",
    "hard techno": "techno",
    "acid techno": "techno",
    "melodic techno": "techno",
    "hypertechno": "techno",
    "progressive trance": "trance",
    "trap latino": "urbano latino",
    "reggaeton chileno": "reggaeton",
    "reggaeton colombiano": "reggaeton",
    "reggaeton flow": "reggaeton",
    "dembow dominicano": "dembow",
    "cumbia pop": "cumbia",
    "cumbia sonidera": "cumbia",
    "cumbia nortena": "cumbia",
    "electrocumbia": "cumbia",
    "corridos tumbados": "corrido",
    "corridos belicos": "corrido",
    "corrido tumbado": "corrido",
    "sad sierreno": "sierreno",
    "pop rock": "pop",
    "dance pop": "pop",
    "indie pop": "pop",
    "art pop": "pop",
    "synth pop": "pop",
    "latin pop": "pop",
    "alternative rock": "rock",
    "indie rock": "rock",
    "classic rock": "rock",
    "hard rock": "rock",
    "progressive rock": "rock",
    "punk rock": "punk",
    "pop punk": "punk",
    "melodic rap": "rap",
    "pop rap": "rap",
    "gangsta rap": "rap",
    "conscious hip hop": "hip hop",
    "old school hip hop": "hip hop",
    "cloud rap": "rap",
    "emo rap": "rap",
    "drill": "hip hop",
    "uk drill": "drill",
    "german drill": "drill",
    "greek drill": "drill",
    "swedish drill": "drill",
    "afrobeat": "african",
    "afrobeats": "african",
    "afropop": "african",
    "afroswing": "african",
}


# =============================================================================
# HELPERS
# =============================================================================

def safe_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        char for char in normalized if not unicodedata.combining(char)
    )


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_genre(value: Any) -> str:
    text = safe_text(value).lower()
    text = text.replace("’", "'").replace("–", "-").replace("—", "-")
    text = normalize_spaces(text)
    text = text.strip(" ,;|/[]{}()\"'`")
    text = ALIASES.get(text, text)
    return text


def unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)

    return result


def slugify(value: str) -> str:
    text = strip_accents(value.lower())
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


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


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)


def parse_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(safe_text(value)))
    except (TypeError, ValueError):
        return default


# =============================================================================
# VALIDATION
# =============================================================================

def reject_reason(genre: str, track_count: int) -> str | None:
    if not genre:
        return "empty"

    if track_count < MIN_TRACK_COUNT:
        return "below_min_track_count"

    if genre in EXACT_REJECT:
        return "known_non_genre"

    if genre in COUNTRY_ONLY:
        return "country_or_location_only"

    if DECADE_ONLY_RE.fullmatch(genre):
        return "decade_tag"

    if URL_RE.search(genre):
        return "url_or_domain"

    if NUMBER_GARBAGE_RE.fullmatch(genre):
        return "numeric_or_code"

    if len(genre) > MAX_GENRE_LENGTH:
        return "too_long"

    if len(genre.split()) > MAX_GENRE_WORDS:
        return "too_many_words"

    for fragment in REJECT_CONTAINS:
        if fragment in genre:
            return "editorial_or_metadata"

    return None


# =============================================================================
# TAXONOMY LOGIC
# =============================================================================

def assign_families(genre: str) -> list[str]:
    families: list[str] = []

    for family, tokens in FAMILY_RULES.items():
        if any(token in genre for token in tokens):
            families.append(family)

    # Reglas especiales para evitar resultados demasiado genéricos.
    if genre == "latin":
        families.append("latin_tropical")

    if genre == "world":
        families.append("world_asian")

    if genre in {"instrumental", "experimental", "alternative"}:
        families.append("electronic")

    return unique(families)


def infer_parent(genre: str, available_genres: set[str]) -> str | None:
    parent = PARENT_RULES.get(genre)
    if parent and parent in available_genres:
        return parent

    # Inferencias simples basadas en sufijos/patrones.
    candidates: list[str] = []

    if genre.endswith(" hip hop"):
        candidates.append("hip hop")
    if genre.endswith(" rap"):
        candidates.append("rap")
    if genre.endswith(" trap"):
        candidates.append("trap")
    if genre.endswith(" pop"):
        candidates.append("pop")
    if genre.endswith(" rock"):
        candidates.append("rock")
    if genre.endswith(" house"):
        candidates.append("house")
    if genre.endswith(" techno"):
        candidates.append("techno")
    if genre.endswith(" trance"):
        candidates.append("trance")
    if genre.endswith(" metal"):
        candidates.append("metal")
    if genre.endswith(" reggae"):
        candidates.append("reggae")
    if genre.endswith(" cumbia"):
        candidates.append("cumbia")
    if genre.startswith("cumbia "):
        candidates.append("cumbia")
    if genre.startswith("reggaeton "):
        candidates.append("reggaeton")
    if genre.startswith("afro "):
        candidates.append("african")

    for candidate in candidates:
        if candidate != genre and candidate in available_genres:
            return candidate

    return None


def dynamic_related_styles(
    genre: str,
    families: Sequence[str],
    genre_records: Mapping[str, Mapping[str, Any]],
    max_results: int = 10,
) -> list[str]:
    manual = list(RELATED_STYLE_RULES.get(genre, ()))

    same_family_candidates: list[tuple[int, str]] = []

    family_set = set(families)

    for other_genre, record in genre_records.items():
        if other_genre == genre:
            continue

        other_families = set(record["families"])
        overlap = family_set & other_families

        if not overlap:
            continue

        same_family_candidates.append(
            (int(record["trackCount"]), other_genre)
        )

    same_family_candidates.sort(
        key=lambda item: (-item[0], item[1])
    )

    dynamic = [
        candidate
        for _, candidate in same_family_candidates[:max_results]
    ]

    return unique(manual + dynamic)[:max_results]


def dynamic_transition_styles(
    genre: str,
    families: Sequence[str],
    available_genres: set[str],
    max_results: int = 8,
) -> list[str]:
    manual = [
        candidate
        for candidate in TRANSITION_STYLE_RULES.get(genre, ())
        if candidate in available_genres
    ]

    # Puentes básicos entre familias.
    family_bridges: dict[str, tuple[str, ...]] = {
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

    bridged: list[str] = []

    for family in families:
        for candidate in family_bridges.get(family, ()):
            if candidate in available_genres and candidate != genre:
                bridged.append(candidate)

    return unique(manual + bridged)[:max_results]


# =============================================================================
# MAIN BUILD
# =============================================================================

def build_taxonomy(
    rows: Sequence[Mapping[str, str]],
) -> tuple[
    dict[str, dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    accepted_counts: Counter[str] = Counter()
    source_counts: dict[str, Counter[str]] = defaultdict(Counter)

    rejected_rows: list[dict[str, Any]] = []

    for row in rows:
        raw_genre = safe_text(row.get("Genre"))
        genre = normalize_genre(raw_genre)

        resolved_count = parse_int(row.get("ResolvedTrackCount"))
        ts_count = parse_int(row.get("TSOccurrenceCount"))
        artist_count = parse_int(row.get("ArtistOccurrenceCount"))

        reason = reject_reason(genre, resolved_count)

        if reason:
            rejected_rows.append(
                {
                    "RawGenre": raw_genre,
                    "NormalizedGenre": genre,
                    "Reason": reason,
                    "ResolvedTrackCount": resolved_count,
                    "TSOccurrenceCount": ts_count,
                    "ArtistOccurrenceCount": artist_count,
                }
            )
            continue

        accepted_counts[genre] += resolved_count
        source_counts["ts"][genre] += ts_count
        source_counts["artist"][genre] += artist_count

    available_genres = set(accepted_counts)

    genre_records: dict[str, dict[str, Any]] = {}

    for genre in sorted(
        available_genres,
        key=lambda item: (-accepted_counts[item], item),
    ):
        families = assign_families(genre)

        genre_records[genre] = {
            "id": slugify(genre),
            "label": genre,
            "trackCount": accepted_counts[genre],
            "tsOccurrenceCount": source_counts["ts"][genre],
            "artistOccurrenceCount": source_counts["artist"][genre],
            "aliases": sorted(
                alias
                for alias, canonical in ALIASES.items()
                if canonical == genre and alias != genre
            ),
            "families": families,
            "parent": None,
            "children": [],
            "relatedStyles": [],
            "transitionStyles": [],
        }

    # Parents.
    for genre, record in genre_records.items():
        record["parent"] = infer_parent(genre, available_genres)

    # Children.
    children_map: dict[str, list[str]] = defaultdict(list)

    for genre, record in genre_records.items():
        parent = record["parent"]
        if parent:
            children_map[parent].append(genre)

    for parent, children in children_map.items():
        if parent in genre_records:
            genre_records[parent]["children"] = sorted(
                children,
                key=lambda item: (
                    -genre_records[item]["trackCount"],
                    item,
                ),
            )

    # Relations.
    for genre, record in genre_records.items():
        record["relatedStyles"] = [
            candidate
            for candidate in dynamic_related_styles(
                genre,
                record["families"],
                genre_records,
            )
            if candidate in available_genres and candidate != genre
        ]

        record["transitionStyles"] = [
            candidate
            for candidate in dynamic_transition_styles(
                genre,
                record["families"],
                available_genres,
            )
            if candidate != genre
        ]

    unmapped_rows = [
        {
            "Genre": genre,
            "TrackCount": record["trackCount"],
            "Reason": "no_family_rule",
        }
        for genre, record in genre_records.items()
        if not record["families"]
    ]

    unmapped_rows.sort(
        key=lambda row: (-int(row["TrackCount"]), str(row["Genre"]))
    )

    rejected_rows.sort(
        key=lambda row: (
            -int(row["ResolvedTrackCount"]),
            str(row["NormalizedGenre"]),
        )
    )

    return genre_records, unmapped_rows, rejected_rows


def build_family_index(
    genre_records: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    family_index: dict[str, list[str]] = defaultdict(list)

    for genre, record in genre_records.items():
        for family in record["families"]:
            family_index[family].append(genre)

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "families": {
            family: sorted(
                genres,
                key=lambda item: (
                    -int(genre_records[item]["trackCount"]),
                    item,
                ),
            )
            for family, genres in sorted(family_index.items())
        },
    }


def build_relations_index(
    genre_records: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "relatedStyles": {
            genre: record["relatedStyles"]
            for genre, record in genre_records.items()
            if record["relatedStyles"]
        },
        "transitionStyles": {
            genre: record["transitionStyles"]
            for genre, record in genre_records.items()
            if record["transitionStyles"]
        },
        "parents": {
            genre: record["parent"]
            for genre, record in genre_records.items()
            if record["parent"]
        },
    }


def build_summary(
    total_input_rows: int,
    genre_records: Mapping[str, Mapping[str, Any]],
    unmapped_rows: Sequence[Mapping[str, Any]],
    rejected_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    family_counts: Counter[str] = Counter()

    for record in genre_records.values():
        family_counts.update(record["families"])

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "project_root": str(PROJECT_ROOT),
        "input_file": str(INPUT_FILE),
        "output_directory": str(OUTPUT_DIR),
        "statistics": {
            "input_genre_rows": total_input_rows,
            "accepted_genres": len(genre_records),
            "rejected_genres": len(rejected_rows),
            "unmapped_genres": len(unmapped_rows),
            "genres_with_parent": sum(
                1
                for record in genre_records.values()
                if record["parent"]
            ),
            "genres_with_related_styles": sum(
                1
                for record in genre_records.values()
                if record["relatedStyles"]
            ),
            "genres_with_transition_styles": sum(
                1
                for record in genre_records.values()
                if record["transitionStyles"]
            ),
            "family_counts": dict(family_counts.most_common()),
        },
        "rules": {
            "minimum_track_count": MIN_TRACK_COUNT,
            "max_genre_length": MAX_GENRE_LENGTH,
            "max_genre_words": MAX_GENRE_WORDS,
        },
        "output_files": {
            "genre_graph": str(GENRE_GRAPH_FILE),
            "genre_families": str(GENRE_FAMILIES_FILE),
            "genre_relations": str(GENRE_RELATIONS_FILE),
            "unmapped_genres": str(UNMAPPED_FILE),
            "rejected_taxonomy_genres": str(REJECTED_FILE),
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
    print_header("FLAMINGO DJ APP - BUILD GENRE")

    print(f"Proyecto detectado:\n  {PROJECT_ROOT}")
    print(f"Entrada:\n  {INPUT_FILE}")

    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            "No se encontró clean_genres.csv.\n"
            f"Ubicación esperada:\n  {INPUT_FILE}\n\n"
            "Ejecuta primero CLEAN_GENRES.py."
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = read_csv_rows(INPUT_FILE)

    if not rows:
        raise ValueError("clean_genres.csv está vacío.")

    required_columns = {
        "Genre",
        "ResolvedTrackCount",
        "TSOccurrenceCount",
        "ArtistOccurrenceCount",
    }

    missing = required_columns - set(rows[0])

    if missing:
        raise ValueError(
            "Faltan columnas requeridas: "
            + ", ".join(sorted(missing))
        )

    print(f"Géneros de entrada: {len(rows):,}")

    genre_records, unmapped_rows, rejected_rows = build_taxonomy(rows)

    graph_payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "description": (
            "Grafo inicial de géneros de Flamingo DJ App. "
            "Las relaciones son determinísticas y editables."
        ),
        "genres": genre_records,
    }

    write_json(GENRE_GRAPH_FILE, graph_payload)
    write_json(
        GENRE_FAMILIES_FILE,
        build_family_index(genre_records),
    )
    write_json(
        GENRE_RELATIONS_FILE,
        build_relations_index(genre_records),
    )

    write_csv(
        UNMAPPED_FILE,
        unmapped_rows,
        ("Genre", "TrackCount", "Reason"),
    )

    write_csv(
        REJECTED_FILE,
        rejected_rows,
        (
            "RawGenre",
            "NormalizedGenre",
            "Reason",
            "ResolvedTrackCount",
            "TSOccurrenceCount",
            "ArtistOccurrenceCount",
        ),
    )

    summary = build_summary(
        total_input_rows=len(rows),
        genre_records=genre_records,
        unmapped_rows=unmapped_rows,
        rejected_rows=rejected_rows,
    )

    write_json(SUMMARY_FILE, summary)

    print_header("RESULTADOS")
    print(f"Géneros aceptados: {len(genre_records):,}")
    print(f"Géneros rechazados: {len(rejected_rows):,}")
    print(f"Géneros sin familia: {len(unmapped_rows):,}")
    print(
        "Géneros con parent: "
        f"{summary['statistics']['genres_with_parent']:,}"
    )
    print(
        "Géneros con relatedStyles: "
        f"{summary['statistics']['genres_with_related_styles']:,}"
    )
    print(
        "Géneros con transitionStyles: "
        f"{summary['statistics']['genres_with_transition_styles']:,}"
    )

    print_header("ARCHIVOS GENERADOS")
    print(f"  OK: {GENRE_GRAPH_FILE}")
    print(f"  OK: {GENRE_FAMILIES_FILE}")
    print(f"  OK: {GENRE_RELATIONS_FILE}")
    print(f"  OK: {UNMAPPED_FILE}")
    print(f"  OK: {REJECTED_FILE}")
    print(f"  OK: {SUMMARY_FILE}")

    print_header("SIGUIENTE REVISIÓN")
    print(
        "Comparte estos archivos:\n"
        f"  - {SUMMARY_FILE.name}\n"
        f"  - {UNMAPPED_FILE.name}\n"
        f"  - {REJECTED_FILE.name}\n"
        f"  - {GENRE_GRAPH_FILE.name}"
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
