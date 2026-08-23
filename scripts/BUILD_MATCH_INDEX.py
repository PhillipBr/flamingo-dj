#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
BUILD_MATCH_INDEX.py

Convierte el grafo final y los perfiles finales de género de Flamingo DJ App
en índices compactos para React.

Entradas
--------
    <PROJECT_ROOT>/data/genres/final/genre_graph_final.json
    <PROJECT_ROOT>/data/genres/final/genre_match_profiles_final.json
    <PROJECT_ROOT>/data/genres/final/unresolved_genres.csv

Salidas React
-------------
    <PROJECT_ROOT>/src/data/genres/
        genreIndex.json
        genreAliases.json
        genreFamilies.json
        genreSameStyle.json
        genreCrossStyle.json
        genreMetadata.json

Salidas de auditoría
--------------------
    <PROJECT_ROOT>/data/genres/index/
        excluded_genres.csv
        index_review_queue.csv
        match_index_summary.json

Decisiones de calidad
---------------------
- Los géneros sin familia no entran al índice productivo.
- Las asignaciones fallback con peso bajo no entran por defecto.
- Los perfiles solo conservan destinos incluidos en el índice.
- Se eliminan autorreferencias de Cross Style.
- Se limitan resultados para mantener archivos livianos.
- Se penalizan coincidencias geográficas exageradas entre géneros que solo
  comparten una familia amplia.
- No modifica las bases de datos ni los archivos finales de origen.
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

FINAL_DIR = PROJECT_ROOT / "data" / "genres" / "final"
AUDIT_DIR = PROJECT_ROOT / "data" / "genres" / "index"
REACT_OUTPUT_DIR = PROJECT_ROOT / "src" / "data" / "genres"

GRAPH_FILE = FINAL_DIR / "genre_graph_final.json"
PROFILES_FILE = FINAL_DIR / "genre_match_profiles_final.json"
UNRESOLVED_FILE = FINAL_DIR / "unresolved_genres.csv"

GENRE_INDEX_FILE = REACT_OUTPUT_DIR / "genreIndex.json"
ALIASES_FILE = REACT_OUTPUT_DIR / "genreAliases.json"
FAMILIES_FILE = REACT_OUTPUT_DIR / "genreFamilies.json"
SAME_STYLE_FILE = REACT_OUTPUT_DIR / "genreSameStyle.json"
CROSS_STYLE_FILE = REACT_OUTPUT_DIR / "genreCrossStyle.json"
METADATA_FILE = REACT_OUTPUT_DIR / "genreMetadata.json"

EXCLUDED_FILE = AUDIT_DIR / "excluded_genres.csv"
REVIEW_FILE = AUDIT_DIR / "index_review_queue.csv"
SUMMARY_FILE = AUDIT_DIR / "match_index_summary.json"


# =============================================================================
# SETTINGS
# =============================================================================

MIN_PRIMARY_WEIGHT = 0.65
MIN_CONFIDENCE_SCORE = 0.65
MIN_SAME_STYLE_SCORE = 0.36
MIN_CROSS_STYLE_SCORE = 0.40

MAX_SAME_STYLE_RESULTS = 12
MAX_CROSS_STYLE_RESULTS = 10
MAX_FAMILY_GENRES = 250

# Mantener géneros fundamentales incluso cuando alguna señal heredada sea débil.
FORCE_INCLUDE = {
    "pop",
    "rock",
    "hip hop",
    "rap",
    "trap",
    "r&b",
    "soul",
    "funk",
    "electronic",
    "edm",
    "dance",
    "house",
    "deep house",
    "tech house",
    "afro house",
    "amapiano",
    "techno",
    "trance",
    "reggaeton",
    "urbano latino",
    "trap latino",
    "dembow",
    "cumbia",
    "salsa",
    "bachata",
    "merengue",
    "dancehall",
    "reggae",
    "afrobeats",
    "afrobeat",
    "afropop",
    "country",
    "folk",
    "jazz",
    "blues",
    "classical",
    "corrido",
    "banda",
    "música mexicana",
    "sertanejo",
}

# Etiquetas suficientemente importantes para incluir aunque usen fallback.
TRUSTED_FALLBACK = {
    "sad sierreno",
    "khaleeji",
    "r&b francais",
    "mizrahi",
    "agronejo",
    "desi",
    "french r&b",
    "manele",
    "experimental",
    "alternative",
    "funk carioca",
    "private school piano",
    "rkt",
    "turreo",
    "techengue",
    "gqom",
    "grupera",
    "regional mexicano",
    "tejano",
    "mariachi",
    "neo soul",
    "motown",
    "quiet storm",
    "new jack swing",
    "downtempo",
    "indietronica",
    "electro",
    "instrumental",
}

CONFIDENCE_VALUES = {
    "manual": 1.00,
    "exact": 0.95,
    "parent": 0.90,
    "suffix": 0.80,
    "prefix": 0.78,
    "inferred": 0.65,
    "fallback": 0.45,
}

# Modificadores geográficos que no deberían producir compatibilidad casi exacta
# únicamente por compartir una familia.
GEOGRAPHIC_TOKENS = {
    "german",
    "french",
    "italian",
    "finnish",
    "polish",
    "dutch",
    "danish",
    "russian",
    "turkish",
    "arabic",
    "swedish",
    "norwegian",
    "spanish",
    "brazilian",
    "mexican",
    "colombian",
    "chilean",
    "argentine",
    "argentinian",
    "peruvian",
    "dominican",
    "puerto rican",
    "uk",
    "british",
    "american",
    "canadian",
    "korean",
    "japanese",
    "chinese",
    "indian",
    "nigerian",
    "south african",
    "jamaican",
    "egyptian",
}

BROAD_GENRES = {
    "pop",
    "rock",
    "hip hop",
    "rap",
    "trap",
    "electronic",
    "dance",
    "house",
    "techno",
    "trance",
    "r&b",
    "soul",
    "jazz",
    "blues",
    "country",
    "folk",
    "reggae",
    "latin",
    "african",
    "world",
    "alternative",
    "experimental",
}


# =============================================================================
# HELPERS
# =============================================================================

def safe_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def normalize_genre(value: Any) -> str:
    text = safe_text(value).lower()
    text = text.replace("’", "'").replace("–", "-").replace("—", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ,;|/[]{}()\"'`")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.lower())
    plain = "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )
    plain = re.sub(r"[^a-z0-9]+", "_", plain)
    return plain.strip("_")


def unique(values: Iterable[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized = normalize_genre(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(normalized)

    return output


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def rounded(value: float) -> float:
    return round(clamp(value), 3)


def parse_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            separators=(",", ":"),
        )


def write_pretty_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


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


# =============================================================================
# QUALITY FILTER
# =============================================================================

def get_primary_assignment(
    record: Mapping[str, Any],
) -> Mapping[str, Any] | None:
    assignments = record.get("familyAssignments", [])

    if isinstance(assignments, list) and assignments:
        first = assignments[0]
        if isinstance(first, dict):
            return first

    primary = normalize_genre(record.get("primaryFamily"))

    if primary:
        return {
            "name": primary,
            "weight": 1.0,
            "confidence": "inferred",
            "confidenceScore": 0.65,
        }

    return None


def inclusion_decision(
    genre: str,
    record: Mapping[str, Any],
) -> tuple[bool, str, float, str]:
    assignment = get_primary_assignment(record)

    if genre in FORCE_INCLUDE:
        return True, "force_include", 1.0, "manual"

    if assignment is None:
        return False, "no_primary_family", 0.0, ""

    family = normalize_genre(assignment.get("name"))
    weight = parse_float(assignment.get("weight"))
    confidence = safe_text(assignment.get("confidence"))
    confidence_score = parse_float(
        assignment.get(
            "confidenceScore",
            CONFIDENCE_VALUES.get(confidence, 0.0),
        )
    )

    if not family:
        return False, "empty_primary_family", weight, confidence

    if confidence == "fallback" and genre not in TRUSTED_FALLBACK:
        return False, "untrusted_fallback", weight, confidence

    if weight < MIN_PRIMARY_WEIGHT and genre not in TRUSTED_FALLBACK:
        return False, "primary_weight_too_low", weight, confidence

    if (
        confidence_score < MIN_CONFIDENCE_SCORE
        and genre not in TRUSTED_FALLBACK
    ):
        return False, "confidence_too_low", weight, confidence

    return True, "quality_pass", weight, confidence


# =============================================================================
# SCORE REFINEMENT
# =============================================================================

def geographic_tokens(genre: str) -> set[str]:
    return {
        token
        for token in GEOGRAPHIC_TOKENS
        if token in genre
    }


def is_geographic_variant(genre: str) -> bool:
    return bool(geographic_tokens(genre))


def adjust_same_style_score(
    source: str,
    target: str,
    score: float,
    records: Mapping[str, Mapping[str, Any]],
) -> float:
    adjusted = score

    if source == target:
        return 1.0

    source_record = records[source]
    target_record = records[target]

    source_parent = normalize_genre(source_record.get("parent"))
    target_parent = normalize_genre(target_record.get("parent"))

    source_primary = normalize_genre(source_record.get("primaryFamily"))
    target_primary = normalize_genre(target_record.get("primaryFamily"))

    source_geo = geographic_tokens(source)
    target_geo = geographic_tokens(target)

    # Evita que dos variantes nacionales sean 0.93 solo por compartir familia.
    if source_geo and target_geo and source_geo != target_geo:
        if not source_parent or source_parent != target_parent:
            adjusted = min(adjusted, 0.74)

    # Una etiqueta geográfica frente al género base puede seguir siendo alta,
    # pero no equivalente exacta.
    if is_geographic_variant(source) != is_geographic_variant(target):
        if source_primary == target_primary:
            adjusted = min(adjusted, 0.82)

    # Géneros demasiado amplios deben tener un techo moderado con microgéneros.
    if source in BROAD_GENRES or target in BROAD_GENRES:
        if source_primary == target_primary:
            adjusted = min(adjusted, 0.86)

    return rounded(adjusted)


def adjust_cross_style_score(
    source: str,
    target: str,
    score: float,
    records: Mapping[str, Mapping[str, Any]],
) -> float:
    adjusted = score

    if source == target:
        return 0.0

    source_record = records[source]
    target_record = records[target]

    source_primary = normalize_genre(source_record.get("primaryFamily"))
    target_primary = normalize_genre(target_record.get("primaryFamily"))

    # Cross Style no debe repetir Same Style con puntajes muy altos cuando
    # ambos tienen exactamente la misma familia principal.
    if source_primary and source_primary == target_primary:
        adjusted = min(adjusted, 0.58)

    if geographic_tokens(source) and geographic_tokens(target):
        adjusted = min(adjusted, 0.50)

    return rounded(adjusted)


def compact_scores(
    source: str,
    raw_scores: Mapping[str, Any],
    records: Mapping[str, Mapping[str, Any]],
    included: set[str],
    mode: str,
    minimum_score: float,
    maximum_results: int,
) -> dict[str, float]:
    candidates: list[tuple[float, int, str]] = []

    for raw_target, raw_score in raw_scores.items():
        target = normalize_genre(raw_target)

        if target not in included or target not in records:
            continue

        score = parse_float(raw_score)

        if mode == "same":
            score = adjust_same_style_score(
                source,
                target,
                score,
                records,
            )
        else:
            score = adjust_cross_style_score(
                source,
                target,
                score,
                records,
            )

        if mode == "cross" and source == target:
            continue

        if score < minimum_score:
            continue

        track_count = parse_int(records[target].get("trackCount"))

        candidates.append((score, track_count, target))

    # Garantizar autorreferencia de Same Style.
    if mode == "same" and source in included:
        candidates.append((1.0, parse_int(records[source].get("trackCount")), source))

    best_by_target: dict[str, tuple[float, int]] = {}

    for score, count, target in candidates:
        previous = best_by_target.get(target)
        if previous is None or score > previous[0]:
            best_by_target[target] = (score, count)

    ordered = sorted(
        (
            (score, count, target)
            for target, (score, count) in best_by_target.items()
        ),
        key=lambda item: (-item[0], -item[1], item[2]),
    )

    return {
        target: rounded(score)
        for score, _, target in ordered[:maximum_results]
    }


# =============================================================================
# INDEX BUILDERS
# =============================================================================

def build_genre_metadata(
    records: Mapping[str, Mapping[str, Any]],
    included: set[str],
) -> dict[str, Any]:
    output: dict[str, Any] = {}

    for genre in sorted(included):
        record = records[genre]
        assignments = record.get("familyAssignments", [])

        output[genre] = {
            "id": safe_text(record.get("id")) or slugify(genre),
            "label": safe_text(record.get("label")) or genre,
            "trackCount": parse_int(record.get("trackCount")),
            "primaryFamily": normalize_genre(
                record.get("primaryFamily")
            ) or None,
            "secondaryFamilies": unique(
                record.get("secondaryFamilies", [])
            ),
            "parent": (
                normalize_genre(record.get("parent"))
                if normalize_genre(record.get("parent")) in included
                else None
            ),
            "confidence": (
                safe_text(assignments[0].get("confidence"))
                if assignments
                else ""
            ),
            "weight": (
                rounded(parse_float(assignments[0].get("weight")))
                if assignments
                else 0.0
            ),
        }

    return output


def build_family_index(
    metadata: Mapping[str, Mapping[str, Any]],
) -> dict[str, list[str]]:
    families: dict[str, list[str]] = defaultdict(list)

    for genre, record in metadata.items():
        primary = normalize_genre(record.get("primaryFamily"))

        if primary:
            families[primary].append(genre)

        for family in record.get("secondaryFamilies", []):
            normalized = normalize_genre(family)
            if normalized:
                families[normalized].append(genre)

    output: dict[str, list[str]] = {}

    for family, genres in sorted(families.items()):
        deduped = unique(genres)
        deduped.sort(
            key=lambda genre: (
                -parse_int(metadata[genre].get("trackCount")),
                genre,
            )
        )
        output[family] = deduped[:MAX_FAMILY_GENRES]

    return output


def build_alias_index(
    graph_payload: Mapping[str, Any],
    records: Mapping[str, Mapping[str, Any]],
    included: set[str],
) -> dict[str, str]:
    aliases: dict[str, str] = {}

    graph_aliases = graph_payload.get("aliases", {})

    if isinstance(graph_aliases, dict):
        for raw_alias, raw_target in graph_aliases.items():
            alias = normalize_genre(raw_alias)
            target = normalize_genre(raw_target)

            if alias and target in included and alias != target:
                aliases[alias] = target

    for genre in included:
        record = records[genre]

        for raw_alias in record.get("aliases", []):
            alias = normalize_genre(raw_alias)

            if alias and alias != genre:
                aliases[alias] = genre

    return dict(sorted(aliases.items()))


def build_search_index(
    metadata: Mapping[str, Mapping[str, Any]],
    aliases: Mapping[str, str],
) -> dict[str, Any]:
    alias_reverse: dict[str, list[str]] = defaultdict(list)

    for alias, canonical in aliases.items():
        alias_reverse[canonical].append(alias)

    output: dict[str, Any] = {}

    for genre, record in metadata.items():
        output[genre] = {
            "id": record["id"],
            "label": record["label"],
            "family": record["primaryFamily"],
            "secondary": record["secondaryFamilies"],
            "aliases": sorted(alias_reverse.get(genre, [])),
        }

    return output


# =============================================================================
# REVIEW REPORTS
# =============================================================================

def unresolved_lookup(
    unresolved_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Mapping[str, Any]]:
    return {
        normalize_genre(row.get("Genre")): row
        for row in unresolved_rows
        if normalize_genre(row.get("Genre"))
    }


def build_review_rows(
    records: Mapping[str, Mapping[str, Any]],
    excluded_rows: Sequence[Mapping[str, Any]],
    unresolved: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for excluded in excluded_rows:
        genre = safe_text(excluded.get("Genre"))
        record = records.get(genre, {})
        unresolved_row = unresolved.get(genre, {})

        rows.append(
            {
                "Genre": genre,
                "TrackCount": parse_int(record.get("trackCount")),
                "PrimaryFamily": normalize_genre(
                    record.get("primaryFamily")
                ),
                "ReasonExcluded": safe_text(excluded.get("Reason")),
                "PrimaryWeight": excluded.get("PrimaryWeight", ""),
                "PrimaryConfidence": excluded.get(
                    "PrimaryConfidence",
                    "",
                ),
                "UnresolvedReasons": safe_text(
                    unresolved_row.get("Reasons")
                ),
                "OriginalPriorityScore": parse_float(
                    unresolved_row.get("PriorityScore")
                ),
            }
        )

    rows.sort(
        key=lambda row: (
            -float(row["OriginalPriorityScore"]),
            -int(row["TrackCount"]),
            str(row["Genre"]),
        )
    )

    return rows


# =============================================================================
# MAIN
# =============================================================================

def print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def main() -> int:
    print_header("FLAMINGO DJ APP - BUILD MATCH INDEX")

    print(f"Proyecto:\n  {PROJECT_ROOT}")
    print(f"Grafo final:\n  {GRAPH_FILE}")
    print(f"Perfiles finales:\n  {PROFILES_FILE}")

    if not GRAPH_FILE.exists():
        raise FileNotFoundError(
            "No se encontró genre_graph_final.json.\n"
            f"Ruta esperada:\n  {GRAPH_FILE}\n\n"
            "Ejecuta primero APPLY_GENRE_OVERRIDES.py."
        )

    if not PROFILES_FILE.exists():
        raise FileNotFoundError(
            "No se encontró genre_match_profiles_final.json.\n"
            f"Ruta esperada:\n  {PROFILES_FILE}"
        )

    graph_payload = read_json(GRAPH_FILE)
    profiles_payload = read_json(PROFILES_FILE)
    unresolved_rows = read_csv(UNRESOLVED_FILE)

    records = graph_payload.get("genres", {})
    profiles = profiles_payload.get("profiles", {})

    if not isinstance(records, dict):
        raise ValueError(
            "genre_graph_final.json no contiene un objeto válido en 'genres'."
        )

    if not isinstance(profiles, dict):
        raise ValueError(
            "genre_match_profiles_final.json no contiene un objeto válido "
            "en 'profiles'."
        )

    included: set[str] = set()
    excluded_rows: list[dict[str, Any]] = []

    for raw_genre, record in records.items():
        genre = normalize_genre(raw_genre)
        include, reason, weight, confidence = inclusion_decision(
            genre,
            record,
        )

        if include:
            included.add(genre)
        else:
            excluded_rows.append(
                {
                    "Genre": genre,
                    "TrackCount": parse_int(record.get("trackCount")),
                    "PrimaryFamily": normalize_genre(
                        record.get("primaryFamily")
                    ),
                    "PrimaryWeight": rounded(weight),
                    "PrimaryConfidence": confidence,
                    "Reason": reason,
                }
            )

    metadata = build_genre_metadata(records, included)
    aliases = build_alias_index(
        graph_payload,
        records,
        included,
    )
    family_index = build_family_index(metadata)
    search_index = build_search_index(metadata, aliases)

    same_style: dict[str, dict[str, float]] = {}
    cross_style: dict[str, dict[str, float]] = {}

    for genre in sorted(included):
        profile = profiles.get(genre, {})
        raw_same = profile.get("sameStyle", {})
        raw_cross = profile.get("crossStyle", {})

        if not isinstance(raw_same, dict):
            raw_same = {}
        if not isinstance(raw_cross, dict):
            raw_cross = {}

        same_style[genre] = compact_scores(
            source=genre,
            raw_scores=raw_same,
            records=records,
            included=included,
            mode="same",
            minimum_score=MIN_SAME_STYLE_SCORE,
            maximum_results=MAX_SAME_STYLE_RESULTS,
        )

        cross_style[genre] = compact_scores(
            source=genre,
            raw_scores=raw_cross,
            records=records,
            included=included,
            mode="cross",
            minimum_score=MIN_CROSS_STYLE_SCORE,
            maximum_results=MAX_CROSS_STYLE_RESULTS,
        )

    unresolved = unresolved_lookup(unresolved_rows)
    review_rows = build_review_rows(
        records,
        excluded_rows,
        unresolved,
    )

    excluded_rows.sort(
        key=lambda row: (
            -int(row["TrackCount"]),
            str(row["Genre"]),
        )
    )

    generated_at = datetime.now().isoformat(timespec="seconds")

    write_json(GENRE_INDEX_FILE, search_index)
    write_json(ALIASES_FILE, aliases)
    write_json(FAMILIES_FILE, family_index)
    write_json(SAME_STYLE_FILE, same_style)
    write_json(CROSS_STYLE_FILE, cross_style)
    write_json(METADATA_FILE, metadata)

    write_csv(
        EXCLUDED_FILE,
        excluded_rows,
        (
            "Genre",
            "TrackCount",
            "PrimaryFamily",
            "PrimaryWeight",
            "PrimaryConfidence",
            "Reason",
        ),
    )

    write_csv(
        REVIEW_FILE,
        review_rows,
        (
            "Genre",
            "TrackCount",
            "PrimaryFamily",
            "ReasonExcluded",
            "PrimaryWeight",
            "PrimaryConfidence",
            "UnresolvedReasons",
            "OriginalPriorityScore",
        ),
    )

    exclusion_counts = Counter(
        row["Reason"]
        for row in excluded_rows
    )

    summary = {
        "generated_at": generated_at,
        "project_root": str(PROJECT_ROOT),
        "inputs": {
            "graph": str(GRAPH_FILE),
            "profiles": str(PROFILES_FILE),
            "unresolved": str(UNRESOLVED_FILE),
        },
        "settings": {
            "minimum_primary_weight": MIN_PRIMARY_WEIGHT,
            "minimum_confidence_score": MIN_CONFIDENCE_SCORE,
            "minimum_same_style_score": MIN_SAME_STYLE_SCORE,
            "minimum_cross_style_score": MIN_CROSS_STYLE_SCORE,
            "max_same_style_results": MAX_SAME_STYLE_RESULTS,
            "max_cross_style_results": MAX_CROSS_STYLE_RESULTS,
        },
        "statistics": {
            "source_genres": len(records),
            "included_genres": len(included),
            "excluded_genres": len(excluded_rows),
            "aliases": len(aliases),
            "families": len(family_index),
            "same_style_profiles": len(same_style),
            "cross_style_profiles": len(cross_style),
            "profiles_without_cross_style": sum(
                1
                for values in cross_style.values()
                if not values
            ),
            "exclusion_reasons": dict(exclusion_counts.most_common()),
        },
        "react_files": {
            "genreIndex": str(GENRE_INDEX_FILE),
            "genreAliases": str(ALIASES_FILE),
            "genreFamilies": str(FAMILIES_FILE),
            "genreSameStyle": str(SAME_STYLE_FILE),
            "genreCrossStyle": str(CROSS_STYLE_FILE),
            "genreMetadata": str(METADATA_FILE),
        },
        "audit_files": {
            "excludedGenres": str(EXCLUDED_FILE),
            "reviewQueue": str(REVIEW_FILE),
        },
    }

    write_pretty_json(SUMMARY_FILE, summary)

    print_header("RESULTADOS")
    print(f"Géneros de origen: {len(records):,}")
    print(f"Géneros incluidos: {len(included):,}")
    print(f"Géneros excluidos: {len(excluded_rows):,}")
    print(f"Familias: {len(family_index):,}")
    print(f"Aliases: {len(aliases):,}")
    print(
        "Perfiles sin Cross Style: "
        f"{summary['statistics']['profiles_without_cross_style']:,}"
    )

    print_header("ARCHIVOS PARA REACT")
    print(f"  OK: {GENRE_INDEX_FILE}")
    print(f"  OK: {ALIASES_FILE}")
    print(f"  OK: {FAMILIES_FILE}")
    print(f"  OK: {SAME_STYLE_FILE}")
    print(f"  OK: {CROSS_STYLE_FILE}")
    print(f"  OK: {METADATA_FILE}")

    print_header("AUDITORÍA")
    print(f"  OK: {EXCLUDED_FILE}")
    print(f"  OK: {REVIEW_FILE}")
    print(f"  OK: {SUMMARY_FILE}")

    print_header("SIGUIENTE PASO")
    print(
        "Después de revisar match_index_summary.json, el siguiente archivo "
        "será src/utils/matchSongs.ts."
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
