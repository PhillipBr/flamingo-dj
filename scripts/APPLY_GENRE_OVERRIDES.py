#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
APPLY_GENRE_OVERRIDES.py

Aplica correcciones manuales y semiautomáticas sobre el grafo refinado
de géneros de Flamingo DJ App.

Entradas
--------
    <PROJECT_ROOT>/data/genres/refined/genre_graph_refined.json
    <PROJECT_ROOT>/data/genres/refined/genre_match_profiles.json
    <PROJECT_ROOT>/data/genres/config/genre_overrides.json

Salidas
-------
    <PROJECT_ROOT>/data/genres/final/
        genre_graph_final.json
        genre_match_profiles_final.json
        unresolved_genres.csv
        applied_overrides.csv
        rejected_overrides.csv
        final_genre_summary.json

Acciones admitidas en genre_overrides.json
------------------------------------------
1. replace_families
2. merge_families
3. remove
4. alias
5. replace_related
6. replace_transitions
7. keep

Ejemplos
--------
{
  "funk": {
    "action": "replace_families",
    "primaryFamily": "rnb_soul",
    "secondaryFamilies": ["jazz_blues"],
    "weight": 0.95,
    "confidence": "manual",
    "notes": "Corrección manual"
  },

  "indie": {
    "action": "replace_families",
    "primaryFamily": "rock",
    "secondaryFamilies": ["pop"],
    "weight": 0.72,
    "confidence": "manual"
  },

  "hardcore hip hop": {
    "action": "replace_families",
    "primaryFamily": "hip_hop",
    "secondaryFamilies": [],
    "weight": 1.0,
    "confidence": "manual"
  },

  "not a genre": {
    "action": "remove",
    "notes": "Metadata residual"
  },

  "hip-hop": {
    "action": "alias",
    "target": "hip hop"
  }
}
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

REFINED_DIR = PROJECT_ROOT / "data" / "genres" / "refined"
CONFIG_DIR = PROJECT_ROOT / "data" / "genres" / "config"
FINAL_DIR = PROJECT_ROOT / "data" / "genres" / "final"

INPUT_GRAPH_FILE = REFINED_DIR / "genre_graph_refined.json"
INPUT_PROFILES_FILE = REFINED_DIR / "genre_match_profiles.json"
OVERRIDES_FILE = CONFIG_DIR / "genre_overrides.json"

FINAL_GRAPH_FILE = FINAL_DIR / "genre_graph_final.json"
FINAL_PROFILES_FILE = FINAL_DIR / "genre_match_profiles_final.json"
UNRESOLVED_FILE = FINAL_DIR / "unresolved_genres.csv"
APPLIED_OVERRIDES_FILE = FINAL_DIR / "applied_overrides.csv"
REJECTED_OVERRIDES_FILE = FINAL_DIR / "rejected_overrides.csv"
SUMMARY_FILE = FINAL_DIR / "final_genre_summary.json"


# =============================================================================
# CONFIGURATION
# =============================================================================

ALLOWED_ACTIONS = {
    "replace_families",
    "merge_families",
    "remove",
    "alias",
    "replace_related",
    "replace_transitions",
    "keep",
}

ALLOWED_CONFIDENCE = {
    "manual",
    "exact",
    "parent",
    "suffix",
    "prefix",
    "inferred",
    "fallback",
}

CONFIDENCE_SCORES = {
    "manual": 1.00,
    "exact": 0.95,
    "parent": 0.90,
    "suffix": 0.80,
    "prefix": 0.78,
    "inferred": 0.65,
    "fallback": 0.45,
}

MAX_RELATED_STYLES = 16
MAX_TRANSITION_STYLES = 12
MAX_MATCH_RESULTS = 20

SAME_STYLE_BASE = {
    "same_genre": 1.00,
    "same_parent": 0.93,
    "manual_related": 0.90,
    "same_primary_family": 0.84,
    "shared_family": 0.72,
    "graph_related": 0.68,
}

CROSS_STYLE_BASE = {
    "manual_transition": 0.82,
    "graph_transition": 0.72,
    "family_bridge": 0.64,
    "shared_secondary_family": 0.56,
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
    "rnb_soul": (
        "pop soul",
        "hip hop",
        "neo soul",
        "funk",
    ),
    "regional_mexican": (
        "cumbia",
        "latin pop",
        "latin urban",
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
    return text.strip(" ,;|/[]{}()\"'`")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.lower())
    plain = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    plain = re.sub(r"[^a-z0-9]+", "_", plain)
    return plain.strip("_")


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def rounded(value: float) -> float:
    return round(clamp(value), 3)


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


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
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


def ensure_overrides_file() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    if OVERRIDES_FILE.exists():
        return

    template = {
        "_meta": {
            "description": (
                "Overrides manuales para la taxonomía de géneros. "
                "No eliminar esta sección."
            ),
            "allowedActions": sorted(ALLOWED_ACTIONS),
        },
        "funk": {
            "action": "replace_families",
            "primaryFamily": "rnb_soul",
            "secondaryFamilies": ["jazz_blues"],
            "weight": 0.95,
            "confidence": "manual",
            "notes": "Funk debe tener familia propia relacionada con soul y jazz."
        },
        "indie": {
            "action": "replace_families",
            "primaryFamily": "rock",
            "secondaryFamilies": ["pop"],
            "weight": 0.70,
            "confidence": "manual",
            "notes": "Etiqueta amplia; mantener con confianza moderada."
        },
        "hardcore hip hop": {
            "action": "replace_families",
            "primaryFamily": "hip_hop",
            "secondaryFamilies": [],
            "weight": 1.0,
            "confidence": "manual",
            "notes": "No debe heredar metal automáticamente."
        },
        "tropical house": {
            "action": "replace_families",
            "primaryFamily": "house",
            "secondaryFamilies": ["electronic"],
            "weight": 1.0,
            "confidence": "manual",
            "notes": "Eliminar latin_tropical como familia heredada."
        },
        "contemporary r&b": {
            "action": "replace_families",
            "primaryFamily": "rnb_soul",
            "secondaryFamilies": [],
            "weight": 0.98,
            "confidence": "manual"
        },
        "alternative r&b": {
            "action": "replace_families",
            "primaryFamily": "rnb_soul",
            "secondaryFamilies": [],
            "weight": 0.98,
            "confidence": "manual"
        },
        "soul": {
            "action": "replace_families",
            "primaryFamily": "rnb_soul",
            "secondaryFamilies": [],
            "weight": 1.0,
            "confidence": "manual"
        },
        "pop urbaine": {
            "action": "replace_families",
            "primaryFamily": "pop",
            "secondaryFamilies": ["hip_hop"],
            "weight": 0.88,
            "confidence": "manual"
        },
        "latin": {
            "action": "replace_families",
            "primaryFamily": "latin_tropical",
            "secondaryFamilies": ["latin_urban"],
            "weight": 0.66,
            "confidence": "manual",
            "notes": "Etiqueta demasiado amplia; mantener con peso moderado."
        },
        "ambient": {
            "action": "replace_families",
            "primaryFamily": "electronic",
            "secondaryFamilies": [],
            "weight": 0.95,
            "confidence": "manual"
        },
        "arrocha": {
            "action": "replace_families",
            "primaryFamily": "brazilian",
            "secondaryFamilies": [],
            "weight": 0.95,
            "confidence": "manual"
        },
        "filmi": {
            "action": "replace_families",
            "primaryFamily": "world_asian",
            "secondaryFamilies": ["soundtrack_stage"],
            "weight": 0.92,
            "confidence": "manual"
        },
        "sierreno": {
            "action": "replace_families",
            "primaryFamily": "regional_mexican",
            "secondaryFamilies": [],
            "weight": 0.96,
            "confidence": "manual"
        },
        "norteno": {
            "action": "replace_families",
            "primaryFamily": "regional_mexican",
            "secondaryFamilies": [],
            "weight": 0.96,
            "confidence": "manual"
        }
    }

    write_json(OVERRIDES_FILE, template)


# =============================================================================
# VALIDATION
# =============================================================================

def validate_override(
    genre: str,
    rule: Mapping[str, Any],
    records: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    errors: list[str] = []

    action = safe_text(rule.get("action"))

    if action not in ALLOWED_ACTIONS:
        errors.append(f"invalid_action:{action}")

    if action == "alias":
        target = normalize_genre(rule.get("target"))
        if not target:
            errors.append("alias_missing_target")
        elif target not in records:
            errors.append(f"alias_target_not_found:{target}")

    if action in {"replace_families", "merge_families"}:
        primary = normalize_genre(rule.get("primaryFamily"))
        secondary = rule.get("secondaryFamilies", [])

        if action == "replace_families" and not primary:
            errors.append("missing_primary_family")

        if not isinstance(secondary, list):
            errors.append("secondary_families_must_be_list")

        confidence = safe_text(rule.get("confidence", "manual"))
        if confidence not in ALLOWED_CONFIDENCE:
            errors.append(f"invalid_confidence:{confidence}")

        try:
            weight = float(rule.get("weight", 1.0))
            if weight < 0 or weight > 1:
                errors.append("weight_out_of_range")
        except (TypeError, ValueError):
            errors.append("invalid_weight")

    if action in {"replace_related", "replace_transitions"}:
        field = (
            "relatedStyles"
            if action == "replace_related"
            else "transitionStyles"
        )
        if not isinstance(rule.get(field, []), list):
            errors.append(f"{field}_must_be_list")

    if action != "alias" and genre not in records:
        errors.append("genre_not_found")

    return errors


# =============================================================================
# OVERRIDE APPLICATION
# =============================================================================

def family_assignment(
    name: str,
    weight: float,
    confidence: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "name": normalize_genre(name),
        "weight": rounded(weight),
        "confidence": confidence,
        "confidenceScore": CONFIDENCE_SCORES[confidence],
        "reason": reason,
    }


def apply_replace_families(
    record: dict[str, Any],
    rule: Mapping[str, Any],
) -> None:
    primary = normalize_genre(rule.get("primaryFamily"))
    secondary = unique(rule.get("secondaryFamilies", []))
    weight = float(rule.get("weight", 1.0))
    confidence = safe_text(rule.get("confidence", "manual"))

    assignments: list[dict[str, Any]] = []

    if primary:
        assignments.append(
            family_assignment(
                primary,
                weight,
                confidence,
                "override_replace_families",
            )
        )

    secondary_weight = max(0.35, weight - 0.15)

    for family in secondary:
        if family == primary:
            continue
        assignments.append(
            family_assignment(
                family,
                secondary_weight,
                confidence,
                "override_secondary_family",
            )
        )

    record["familyAssignments"] = assignments
    record["families"] = [item["name"] for item in assignments]
    record["primaryFamily"] = primary or None
    record["secondaryFamilies"] = [
        item["name"]
        for item in assignments[1:]
    ]


def apply_merge_families(
    record: dict[str, Any],
    rule: Mapping[str, Any],
) -> None:
    current = {
        normalize_genre(item.get("name")): dict(item)
        for item in record.get("familyAssignments", [])
        if normalize_genre(item.get("name"))
    }

    primary = normalize_genre(rule.get("primaryFamily"))
    secondary = unique(rule.get("secondaryFamilies", []))
    weight = float(rule.get("weight", 1.0))
    confidence = safe_text(rule.get("confidence", "manual"))

    if primary:
        current[primary] = family_assignment(
            primary,
            weight,
            confidence,
            "override_merge_primary",
        )

    secondary_weight = max(0.35, weight - 0.15)

    for family in secondary:
        if family == primary:
            continue
        current[family] = family_assignment(
            family,
            secondary_weight,
            confidence,
            "override_merge_secondary",
        )

    assignments = sorted(
        current.values(),
        key=lambda item: (
            -float(item["weight"]),
            -float(item["confidenceScore"]),
            item["name"],
        ),
    )

    record["familyAssignments"] = assignments
    record["families"] = [item["name"] for item in assignments]
    record["primaryFamily"] = (
        assignments[0]["name"]
        if assignments
        else None
    )
    record["secondaryFamilies"] = [
        item["name"]
        for item in assignments[1:]
    ]


def apply_overrides(
    records: dict[str, dict[str, Any]],
    overrides: Mapping[str, Any],
) -> tuple[
    dict[str, dict[str, Any]],
    dict[str, str],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    applied_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    aliases: dict[str, str] = {}
    removals: set[str] = set()

    for raw_genre, raw_rule in overrides.items():
        if raw_genre == "_meta":
            continue

        genre = normalize_genre(raw_genre)

        if not isinstance(raw_rule, dict):
            rejected_rows.append(
                {
                    "Genre": raw_genre,
                    "Action": "",
                    "Errors": "override_rule_must_be_object",
                    "Notes": "",
                }
            )
            continue

        rule = dict(raw_rule)
        action = safe_text(rule.get("action"))
        errors = validate_override(genre, rule, records)

        if errors:
            rejected_rows.append(
                {
                    "Genre": genre,
                    "Action": action,
                    "Errors": " | ".join(errors),
                    "Notes": safe_text(rule.get("notes")),
                }
            )
            continue

        if action == "remove":
            removals.add(genre)

        elif action == "alias":
            aliases[genre] = normalize_genre(rule.get("target"))

        elif action == "replace_families":
            apply_replace_families(records[genre], rule)

        elif action == "merge_families":
            apply_merge_families(records[genre], rule)

        elif action == "replace_related":
            records[genre]["relatedStyles"] = unique(
                rule.get("relatedStyles", [])
            )[:MAX_RELATED_STYLES]

        elif action == "replace_transitions":
            records[genre]["transitionStyles"] = unique(
                rule.get("transitionStyles", [])
            )[:MAX_TRANSITION_STYLES]

        elif action == "keep":
            records[genre]["overrideStatus"] = "manual_keep"

        applied_rows.append(
            {
                "Genre": genre,
                "Action": action,
                "PrimaryFamily": safe_text(
                    records.get(genre, {}).get("primaryFamily")
                ),
                "SecondaryFamilies": " | ".join(
                    records.get(genre, {}).get(
                        "secondaryFamilies",
                        [],
                    )
                ),
                "Target": aliases.get(genre, ""),
                "Notes": safe_text(rule.get("notes")),
            }
        )

    for genre in removals:
        records.pop(genre, None)

    # Reescribir referencias a aliases.
    for record in records.values():
        parent = normalize_genre(record.get("parent"))
        if parent in aliases:
            record["parent"] = aliases[parent]

        record["relatedStyles"] = unique(
            aliases.get(normalize_genre(value), normalize_genre(value))
            for value in record.get("relatedStyles", [])
        )

        record["transitionStyles"] = unique(
            aliases.get(normalize_genre(value), normalize_genre(value))
            for value in record.get("transitionStyles", [])
        )

        record["children"] = unique(
            aliases.get(normalize_genre(value), normalize_genre(value))
            for value in record.get("children", [])
        )

    # Eliminar referencias a géneros removidos o inexistentes.
    available = set(records)

    for genre, record in records.items():
        record["relatedStyles"] = [
            value
            for value in record.get("relatedStyles", [])
            if value in available and value != genre
        ][:MAX_RELATED_STYLES]

        record["transitionStyles"] = [
            value
            for value in record.get("transitionStyles", [])
            if value in available and value != genre
        ][:MAX_TRANSITION_STYLES]

        record["children"] = [
            value
            for value in record.get("children", [])
            if value in available and value != genre
        ]

        if record.get("parent") not in available:
            record["parent"] = None

    return records, aliases, applied_rows, rejected_rows


# =============================================================================
# GRAPH REBUILD
# =============================================================================

def rebuild_children(records: dict[str, dict[str, Any]]) -> None:
    children_map: dict[str, list[str]] = defaultdict(list)

    for genre, record in records.items():
        parent = normalize_genre(record.get("parent"))
        if parent and parent in records and parent != genre:
            children_map[parent].append(genre)

    for genre, record in records.items():
        record["children"] = sorted(
            children_map.get(genre, []),
            key=lambda child: (
                -int(records[child].get("trackCount", 0)),
                child,
            ),
        )


def family_weight_map(record: Mapping[str, Any]) -> dict[str, float]:
    return {
        normalize_genre(item.get("name")): float(item.get("weight", 0))
        for item in record.get("familyAssignments", [])
        if normalize_genre(item.get("name"))
    }


def primary_family(record: Mapping[str, Any]) -> str | None:
    return normalize_genre(record.get("primaryFamily")) or None


def relation_score(
    source_genre: str,
    target_genre: str,
    records: Mapping[str, Mapping[str, Any]],
    mode: str,
) -> float:
    if source_genre == target_genre:
        return 1.0 if mode == "same" else 0.0

    source = records[source_genre]
    target = records[target_genre]

    source_parent = normalize_genre(source.get("parent"))
    target_parent = normalize_genre(target.get("parent"))

    if (
        mode == "same"
        and source_parent
        and source_parent == target_parent
    ):
        return SAME_STYLE_BASE["same_parent"]

    if (
        mode == "same"
        and target_genre in source.get("relatedStyles", [])
    ):
        return SAME_STYLE_BASE["manual_related"]

    if (
        mode == "cross"
        and target_genre in source.get("transitionStyles", [])
    ):
        return CROSS_STYLE_BASE["manual_transition"]

    source_weights = family_weight_map(source)
    target_weights = family_weight_map(target)
    shared = set(source_weights) & set(target_weights)

    if shared:
        strongest_shared = max(
            min(source_weights[name], target_weights[name])
            for name in shared
        )

        if mode == "same":
            if primary_family(source) == primary_family(target):
                return rounded(
                    SAME_STYLE_BASE["same_primary_family"]
                    * strongest_shared
                )

            return rounded(
                SAME_STYLE_BASE["shared_family"]
                * strongest_shared
            )

        return rounded(
            CROSS_STYLE_BASE["shared_secondary_family"]
            * strongest_shared
        )

    if mode == "cross":
        source_families = list(source_weights)
        bridge_candidates: set[str] = set()

        for family in source_families:
            bridge_candidates.update(FAMILY_BRIDGES.get(family, ()))

        if target_genre in bridge_candidates:
            return CROSS_STYLE_BASE["family_bridge"]

    return 0.0


def build_match_profiles(
    records: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    profiles: dict[str, Any] = {}
    genres = list(records)

    family_index: dict[str, list[str]] = defaultdict(list)

    for genre, record in records.items():
        for family in family_weight_map(record):
            family_index[family].append(genre)

    for genre in genres:
        source = records[genre]
        candidate_pool: list[str] = [genre]

        candidate_pool.extend(source.get("relatedStyles", []))
        candidate_pool.extend(source.get("transitionStyles", []))

        for family in family_weight_map(source):
            family_candidates = sorted(
                family_index[family],
                key=lambda item: (
                    -int(records[item].get("trackCount", 0)),
                    item,
                ),
            )
            candidate_pool.extend(family_candidates[:50])

        candidate_pool = unique(candidate_pool)

        same_scores: list[tuple[float, str]] = []
        cross_scores: list[tuple[float, str]] = []

        for candidate in candidate_pool:
            if candidate not in records:
                continue

            same_score = relation_score(
                genre,
                candidate,
                records,
                mode="same",
            )
            cross_score = relation_score(
                genre,
                candidate,
                records,
                mode="cross",
            )

            if same_score > 0:
                same_scores.append((same_score, candidate))

            if cross_score > 0:
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
            "primaryFamily": primary_family(source),
            "secondaryFamilies": list(
                source.get("secondaryFamilies", [])
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
            "Perfiles finales de compatibilidad para Same Style "
            "y Cross Style."
        ),
        "profiles": profiles,
    }


# =============================================================================
# UNRESOLVED REPORT
# =============================================================================

def unresolved_reasons(record: Mapping[str, Any]) -> list[str]:
    reasons: list[str] = []

    assignments = record.get("familyAssignments", [])

    if not assignments:
        reasons.append("no_family")

    if assignments:
        first = assignments[0]
        confidence = safe_text(first.get("confidence"))
        weight = float(first.get("weight", 0))

        if confidence == "fallback":
            reasons.append("fallback_confidence")

        if weight < 0.70:
            reasons.append("low_primary_weight")

    if not record.get("relatedStyles"):
        reasons.append("no_related_styles")

    if not record.get("transitionStyles"):
        reasons.append("no_transition_styles")

    return reasons


def unresolved_priority(
    track_count: int,
    reasons: Sequence[str],
) -> float:
    uncertainty = 0.0
    uncertainty += 1.5 if "no_family" in reasons else 0.0
    uncertainty += 1.0 if "fallback_confidence" in reasons else 0.0
    uncertainty += 0.7 if "low_primary_weight" in reasons else 0.0
    uncertainty += 0.4 if "no_related_styles" in reasons else 0.0
    uncertainty += 0.3 if "no_transition_styles" in reasons else 0.0

    return round(
        math.log10(max(track_count, 1) + 1) * uncertainty,
        4,
    )


def build_unresolved_rows(
    records: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for genre, record in records.items():
        reasons = unresolved_reasons(record)

        if not reasons:
            continue

        assignments = record.get("familyAssignments", [])
        track_count = int(record.get("trackCount", 0))

        rows.append(
            {
                "Genre": genre,
                "TrackCount": track_count,
                "PrimaryFamily": safe_text(
                    record.get("primaryFamily")
                ),
                "SecondaryFamilies": " | ".join(
                    record.get("secondaryFamilies", [])
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
                "Reasons": " | ".join(reasons),
                "PriorityScore": unresolved_priority(
                    track_count,
                    reasons,
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
# SUMMARY
# =============================================================================

def build_summary(
    source_count: int,
    records: Mapping[str, Mapping[str, Any]],
    aliases: Mapping[str, str],
    applied_rows: Sequence[Mapping[str, Any]],
    rejected_rows: Sequence[Mapping[str, Any]],
    unresolved_rows: Sequence[Mapping[str, Any]],
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
        "input_graph": str(INPUT_GRAPH_FILE),
        "input_profiles": str(INPUT_PROFILES_FILE),
        "overrides_file": str(OVERRIDES_FILE),
        "output_directory": str(FINAL_DIR),
        "statistics": {
            "source_genres": source_count,
            "final_genres": len(records),
            "applied_overrides": len(applied_rows),
            "rejected_overrides": len(rejected_rows),
            "aliases_created": len(aliases),
            "unresolved_genres": len(unresolved_rows),
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
            "family_counts": dict(family_counts.most_common()),
            "confidence_counts": dict(confidence_counts.most_common()),
        },
        "output_files": {
            "genre_graph_final": str(FINAL_GRAPH_FILE),
            "genre_match_profiles_final": str(FINAL_PROFILES_FILE),
            "unresolved_genres": str(UNRESOLVED_FILE),
            "applied_overrides": str(APPLIED_OVERRIDES_FILE),
            "rejected_overrides": str(REJECTED_OVERRIDES_FILE),
        },
    }


# =============================================================================
# MAIN
# =============================================================================

def print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def main() -> int:
    print_header("FLAMINGO DJ APP - APPLY GENRE OVERRIDES")

    print(f"Proyecto detectado:\n  {PROJECT_ROOT}")
    print(f"Grafo refinado:\n  {INPUT_GRAPH_FILE}")
    print(f"Overrides:\n  {OVERRIDES_FILE}")

    if not INPUT_GRAPH_FILE.exists():
        raise FileNotFoundError(
            "No se encontró genre_graph_refined.json.\n"
            f"Ubicación esperada:\n  {INPUT_GRAPH_FILE}\n\n"
            "Ejecuta primero REFINE_GENRE_GRAPH.py."
        )

    ensure_overrides_file()

    graph_payload = read_json(INPUT_GRAPH_FILE)
    records = graph_payload.get("genres", {})

    if not isinstance(records, dict):
        raise ValueError(
            "genre_graph_refined.json no contiene un objeto válido "
            "en la propiedad 'genres'."
        )

    # Copia profunda para no mutar el payload original.
    records = json.loads(json.dumps(records))

    overrides = read_json(OVERRIDES_FILE)

    if not isinstance(overrides, dict):
        raise ValueError(
            "genre_overrides.json debe contener un objeto JSON."
        )

    print(f"Géneros de entrada: {len(records):,}")
    print(
        "Reglas de override: "
        f"{sum(1 for key in overrides if key != '_meta'):,}"
    )

    source_count = len(records)

    (
        records,
        aliases,
        applied_rows,
        rejected_rows,
    ) = apply_overrides(records, overrides)

    rebuild_children(records)

    final_profiles = build_match_profiles(records)
    unresolved_rows = build_unresolved_rows(records)

    final_graph_payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "description": (
            "Grafo final de géneros con overrides manuales aplicados."
        ),
        "aliases": aliases,
        "genres": records,
    }

    summary = build_summary(
        source_count=source_count,
        records=records,
        aliases=aliases,
        applied_rows=applied_rows,
        rejected_rows=rejected_rows,
        unresolved_rows=unresolved_rows,
    )

    write_json(FINAL_GRAPH_FILE, final_graph_payload)
    write_json(FINAL_PROFILES_FILE, final_profiles)

    write_csv(
        UNRESOLVED_FILE,
        unresolved_rows,
        (
            "Genre",
            "TrackCount",
            "PrimaryFamily",
            "SecondaryFamilies",
            "PrimaryWeight",
            "PrimaryConfidence",
            "Reasons",
            "PriorityScore",
        ),
    )

    write_csv(
        APPLIED_OVERRIDES_FILE,
        applied_rows,
        (
            "Genre",
            "Action",
            "PrimaryFamily",
            "SecondaryFamilies",
            "Target",
            "Notes",
        ),
    )

    write_csv(
        REJECTED_OVERRIDES_FILE,
        rejected_rows,
        (
            "Genre",
            "Action",
            "Errors",
            "Notes",
        ),
    )

    write_json(SUMMARY_FILE, summary)

    stats = summary["statistics"]

    print_header("RESULTADOS")
    print(f"Géneros finales: {stats['final_genres']:,}")
    print(f"Overrides aplicados: {stats['applied_overrides']:,}")
    print(f"Overrides rechazados: {stats['rejected_overrides']:,}")
    print(f"Aliases creados: {stats['aliases_created']:,}")
    print(f"Géneros sin familia: {stats['genres_without_family']:,}")
    print(f"Géneros no resueltos: {stats['unresolved_genres']:,}")
    print(
        "Géneros con múltiples familias: "
        f"{stats['genres_with_multiple_families']:,}"
    )

    print_header("ARCHIVOS GENERADOS")
    print(f"  OK: {FINAL_GRAPH_FILE}")
    print(f"  OK: {FINAL_PROFILES_FILE}")
    print(f"  OK: {UNRESOLVED_FILE}")
    print(f"  OK: {APPLIED_OVERRIDES_FILE}")
    print(f"  OK: {REJECTED_OVERRIDES_FILE}")
    print(f"  OK: {SUMMARY_FILE}")

    print_header("SIGUIENTE REVISIÓN")
    print(
        "Comparte estos archivos:\n"
        f"  - {SUMMARY_FILE.name}\n"
        f"  - {UNRESOLVED_FILE.name}\n"
        f"  - {REJECTED_OVERRIDES_FILE.name}\n"
        f"  - {FINAL_PROFILES_FILE.name}"
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
