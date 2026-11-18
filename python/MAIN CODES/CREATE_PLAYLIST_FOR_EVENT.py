#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
FLAMINGO DJ - UNIVERSAL EVENT PLAYLIST CREATOR

- Cantidad de canciones configurable
- Artistas prioritarios separados por coma
- Porcentaje exacto de artistas prioritarios
- Requests del cliente por menú, CSV o REQUESTS (lista editable)
- Recomendaciones ARTIST_SEEDS / GENRE_SEEDS y artistas prioritarios con cuota
- Organización por épocas: 90s, 2000s, 2010s, Trends
- Popularity, Energy, BPM, Genre y transiciones
- Excel con requests en rosado
- Excel y JSON en _FLAMINGO - MASTER/PLAYLIST_JSON/<EVENTO>
- Regeneración aleatoria
- Publicación Spotify solo después de aprobación
- Publicación permitida aunque falten requests
- Sin modificar MASTER_CLEAN.db ni DJ.db

Instalar:
    pip install openpyxl spotipy python-dotenv

Ejecutar:
    python CREATE_PLAYLIST_FOR_EVENT.py --random on
"""

import argparse
import json
import math
import os
import random
import re
import sqlite3
import subprocess
import sys
import unicodedata

from collections import Counter
from datetime import datetime
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

NAME = "FG EVENT"

# Estos valores son ejemplos y se pueden editar directamente.
# El menú permite elegir playlists, requests, artistas y géneros en cada ejecución.
SOURCES = ["POP HITS", "POP TRENDS", "POP 90-2000"]

PHASE_PRESETS = {
    "PARTY": [
        ("WARMUP", 40, 5.0, 65),
        ("BUILDING", 55, 6.3, 72),
        ("PEAK", 90, 8.2, 82),
        ("SING-ALONG", 45, 7.3, 85),
        ("FINAL PEAK", 55, 8.5, 90),
        ("CLOSER", 15, 7.0, 88),
    ],
    "BACKGROUND": [
        ("ARRIVAL", 50, 4.5, 65),
        ("BACKGROUND", 150, 5.5, 65),
        ("LATE", 50, 6.0, 72),
    ],
    "EMAAD": [
        ("ARRIVAL", 40, 5.2, 63),
        ("BUILDING", 55, 6.2, 73),
        ("PEAK", 85, 8.0, 82),
        ("SING-ALONG", 45, 7.3, 86),
        ("FINAL PEAK", 60, 8.6, 90),
        ("BIRTHDAY / CLOSER", 15, 8.2, 93),
    ],
}
PHASES = list(PHASE_PRESETS["PARTY"])
ERA_WEIGHTS = {"90s": 0.05, "2000s": 0.10, "2010s": 0.25, "TRENDS": 0.60}
MIN_YEAR = 1990

# Requests opcionales. Formato: (FASE, ARTISTA, TITULO, NOTA).
# Puedes dejar esta lista vacía y añadirlos desde el menú o archivo CSV.
REQUESTS = []

# Recomendaciones / artistas afines: influyen en el score, pero NO son cuota.
ARTIST_SEEDS = {
    "taylor swift", "olivia rodrigo", "lady gaga", "billie eilish",
    "dua lipa", "charli xcx", "gracie abrams", "noah kahan",
    "hozier", "florence the machine", "lorde", "halsey",
    "chappell roan", "sabrina carpenter", "paramore", "the weeknd",
    "avril lavigne",
}
GENRE_SEEDS = {
    "pop", "dance pop", "electropop", "dark pop", "alt pop",
    "alternative pop", "indie pop", "synthpop", "synth pop",
    "pop rock", "indie rock", "dance", "new wave", "art pop", "pop punk",
}

# Plantilla de ejemplo, activable desde el menú (no se aplica por defecto).
EMAAD_REQUESTS = [
    ("ARRIVAL", "Taylor Swift", "Bejeweled", ""),
    ("ARRIVAL", "Hozier", "Too Sweet", ""),
    ("BUILDING", "Olivia Rodrigo", "Vampire", "Club edit requested"),
    ("PEAK", "Lady Gaga", "Bad Romance", ""),
    ("CLOSER", "Taylor Swift", "Shake It Off", "Birthday moment"),
]


# ============================================================
# HELPERS
# ============================================================

def norm(value):
    text = unicodedata.normalize(
        "NFKD",
        str(value or "").casefold()
    )

    text = "".join(
        char for char in text
        if not unicodedata.combining(char)
    )

    return re.sub(
        r"[^a-z0-9]+",
        " ",
        text
    ).strip()


def num(value, default=None):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def first(data, *keys):
    for key in keys:
        value = data.get(key)
        if value is not None and value != "":
            return value
    return None


def sid(value):
    text = str(value or "")

    match = re.search(
        r"(?:open\.spotify\.com/track/|spotify:track:)"
        r"([A-Za-z0-9]{22})",
        text
    )

    if match:
        return match.group(1)

    if re.fullmatch(r"[A-Za-z0-9]{22}", text):
        return text

    return None


def release_year(value):
    match = re.search(
        r"\b(19\d{2}|20\d{2})\b",
        str(value or "")
    )
    return int(match.group(1)) if match else None


def era_of(year):
    if year is None:
        return "UNKNOWN"
    if year < 1990:
        return "CLASSICS"
    if year <= 1999:
        return "90s"
    if year <= 2009:
        return "2000s"
    if year <= 2019:
        return "2010s"
    return "TRENDS"


def energy10(track):
    value = track["energy"]

    if value is None:
        return None

    return value * 10 if 0 <= value <= 1 else value


def artist_names(value):
    if isinstance(value, list):
        names = []
        for item in value:
            names.append(
                item.get("name", "")
                if isinstance(item, dict)
                else str(item)
            )
        return {norm(name) for name in names if norm(name)}

    parts = re.split(
        r"\s*,\s*|\s+feat\.?\s+|\s+ft\.?\s+|"
        r"\s+featuring\s+|\s+&\s+|\s+x\s+",
        str(value or ""),
        flags=re.I
    )

    return {
        norm(part)
        for part in parts
        if norm(part)
    }


def is_priority(track, priority_artists):
    if not priority_artists:
        return False

    return bool(
        track["artistNames"].intersection(priority_artists)
    )


def parse_genres(value):
    if isinstance(value, list):
        return [
            norm(
                item.get("name")
                if isinstance(item, dict)
                else item
            )
            for item in value
        ]

    if isinstance(value, dict):
        return [norm(key) for key in value]

    if isinstance(value, str):
        return [
            norm(item)
            for item in re.split(r"[,;|/]", value)
            if item.strip()
        ]

    return []


def root_dir():
    script = Path(__file__).resolve()

    for folder in [script.parent, *script.parents, Path.cwd()]:
        if (folder / "src/data/JSON").is_dir():
            return folder

    fallback = Path(
        r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
        r"\FLAMINGOAPP_DJ_REACT"
    )

    if (fallback / "src/data/JSON").is_dir():
        return fallback

    raise FileNotFoundError(
        "No encuentro FLAMINGOAPP_DJ_REACT/src/data/JSON"
    )


def load(path):
    return json.loads(
        Path(path).read_text(encoding="utf-8-sig")
    )


def catalog(root, filename):
    paths = list(
        (root / "src/data/JSON").rglob(filename)
    )

    paths.sort(
        key=lambda path: (
            0 if "normalized" in path.parts else 1,
            len(path.parts)
        )
    )

    if not paths:
        raise FileNotFoundError(filename)

    return load(paths[0])


def index_catalog(data):
    if isinstance(data, dict):
        data = data.get("tracks", data)

    if isinstance(data, dict):
        return {
            str(key): value
            for key, value in data.items()
            if isinstance(value, dict)
        }

    result = {}

    for item in data:
        if not isinstance(item, dict):
            continue

        key = first(
            item,
            "id",
            "externalSongId",
            "SongID"
        )

        if key is not None:
            result[str(key)] = item

    return result


def entries(data):
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        if isinstance(data.get("tracks"), list):
            return data["tracks"]

        if isinstance(data.get("trackIds"), list):
            return [
                {"id": value}
                for value in data["trackIds"]
            ]

    return []


def source_path(root, name):
    paths = [
        path
        for path in (root / "src/data/JSON").rglob("*.json")
        if path.stem.casefold() == name.casefold()
        and "playlists" in [
            part.casefold()
            for part in path.parts
        ]
    ]

    paths.sort(
        key=lambda path: (
            0 if "normalized" in path.parts else 1,
            len(path.parts)
        )
    )

    if not paths:
        raise FileNotFoundError(
            f"No encuentro playlist: {name}"
        )

    return paths[0]


# ============================================================
# USER CONFIGURATION
# ============================================================

def ask_yes_no(question):
    while True:
        answer = input(
            question + " [S/N]: "
        ).strip().casefold()

        if answer in ("s", "si", "sí", "y", "yes"):
            return True

        if answer in ("n", "no", ""):
            return False

        print("Responde S o N.")


def safe_filename(value):
    return re.sub(r'[^\w .()-]+', '_', value, flags=re.UNICODE).strip(' .') or 'EVENT'


def ask_text(prompt, default=""):
    value = input(f"{prompt} [{default}]: " if default else f"{prompt}: ").strip()
    return value or default


def available_playlist_names(root):
    names = set()
    base = root / "src" / "data" / "JSON"
    for folder in (base / "playlists", base / "normalized" / "playlists"):
        if folder.is_dir():
            names.update(p.stem for p in folder.glob("*.json"))
    return sorted(names, key=str.casefold)


def configure_event(root):
    """Personaliza evento sin editar el algoritmo; nunca toca las DB."""
    global NAME, SOURCES, PHASES, REQUESTS, ARTIST_SEEDS, GENRE_SEEDS, MIN_YEAR, ERA_WEIGHTS
    print("\n" + "=" * 72)
    print("FLAMINGO DJ - CREATE PLAYLIST FOR EVENT")
    print("=" * 72)
    NAME = ask_text("Nombre de playlist/evento", NAME)
    if not NAME or NAME in {'.', '..'} or '/' in NAME or '\\' in NAME:
        raise ValueError("Nombre de evento inválido")

    options = available_playlist_names(root)
    if not options:
        raise FileNotFoundError("No hay playlists locales para usar como fuentes")
    print("\nPLAYLISTS DISPONIBLES:")
    for i, option in enumerate(options, 1):
        print(f" {i:>3}. {option}")
    print("Puedes escribir números (1,3,5) o nombres separados por coma.")
    default_sources = ", ".join(n for n in SOURCES if n in options)
    chosen = ask_text("Playlists fuente", default_sources)
    result = []
    for part in chosen.split(','):
        part = part.strip()
        if not part:
            continue
        if part.isdecimal() and 1 <= int(part) <= len(options):
            selected = options[int(part)-1]
        else:
            selected = next((x for x in options if x.casefold() == part.casefold()), None)
        if selected is None:
            raise ValueError(f"Playlist fuente desconocida: {part}")
        if selected not in result:
            result.append(selected)
    if not result:
        raise ValueError("Debes elegir al menos una playlist fuente")
    SOURCES = result

    print("\nFASES: 1=PARTY, 2=BACKGROUND, 3=EMAAD, 4=PERSONALIZADAS")
    mode = ask_text("Modo", "1")
    preset = {'1':'PARTY','2':'BACKGROUND','3':'EMAAD'}.get(mode)
    if preset:
        PHASES = list(PHASE_PRESETS[preset])
    elif mode == '4':
        print("Escribe una fase por línea: NOMBRE | PESO | ENERGY(0-10) | POP(0-100). Línea vacía termina.")
        phases = []
        while True:
            line = input("Fase: ").strip()
            if not line:
                break
            parts = [v.strip() for v in line.split('|')]
            if len(parts) != 4:
                print("Formato inválido"); continue
            name, weight, energy, pop = parts
            phases.append((name.upper(), float(weight), float(energy), float(pop)))
        if not phases or any(p[1] <= 0 for p in phases):
            raise ValueError("Fases personalizadas inválidas")
        PHASES = phases
    else:
        raise ValueError("Modo de fases inválido")
    print("Fases:", ', '.join(p[0] for p in PHASES))

    MIN_YEAR = int(ask_text("Año mínimo para canciones automáticas", str(MIN_YEAR)))
    print("\nRECOMENDACIONES: artistas afines que reciben bonus de afinidad.")
    print("No son lo mismo que los artistas prioritarios con porcentaje exacto.")
    rec = ask_text("Artistas recomendados (coma; '-' = ninguno)", ', '.join(sorted(ARTIST_SEEDS)))
    ARTIST_SEEDS = set() if rec == '-' else {norm(x) for x in rec.split(',') if norm(x)}
    genre = ask_text("Géneros recomendados (coma; '-' = ninguno)", ', '.join(sorted(GENRE_SEEDS)))
    GENRE_SEEDS = set() if genre == '-' else {norm(x) for x in genre.split(',') if norm(x)}

    print("\nREQUESTS DEL CLIENTE: canciones obligatorias, marcadas rosadas en Excel.")
    print("Puedes escribirlos aquí o cargarlos de CSV (Phase,Artist,Title,Note).")
    REQUESTS = list(REQUESTS)
    if mode == '3' and ask_yes_no("¿Cargar requests de ejemplo EMAAD?"):
        # Ajustar la fase CLOSER del ejemplo al nombre real de la última fase.
        for phase, artist, title, note in EMAAD_REQUESTS:
            phase = PHASES[-1][0] if phase == 'CLOSER' else phase
            REQUESTS.append((phase, artist, title, note))
    csv_path = input("Ruta CSV de requests (Enter = omitir): ").strip().strip('"')
    if csv_path:
        import csv
        with open(csv_path, newline='', encoding='utf-8-sig') as handle:
            for row in csv.DictReader(handle):
                phase = (row.get('Phase') or row.get('phase') or PHASES[0][0]).strip().upper()
                artist = (row.get('Artist') or row.get('artist') or '').strip()
                title = (row.get('Title') or row.get('title') or '').strip()
                note = (row.get('Note') or row.get('note') or '').strip()
                if artist and title:
                    REQUESTS.append((phase, artist, title, note))
    print("Agregar requests: FASE | ARTISTA | TITULO | NOTA. Enter termina.")
    while True:
        line = input("Request: ").strip()
        if not line:
            break
        parts = [x.strip() for x in line.split('|', 3)]
        if len(parts) < 3 or not parts[1] or not parts[2]:
            print("Formato inválido: FASE | ARTISTA | TITULO | NOTA"); continue
        REQUESTS.append((parts[0].upper(), parts[1], parts[2], parts[3] if len(parts)>3 else ''))
    valid_phases = {p[0] for p in PHASES}
    bad = [r for r in REQUESTS if r[0] not in valid_phases]
    if bad:
        raise ValueError(f"Requests con fases desconocidas: {bad}. Fases válidas: {sorted(valid_phases)}")
    # Duplicados de requests no se convierten en slots adicionales.
    seen = set()
    REQUESTS = [r for r in REQUESTS if not ((key := (norm(r[1]), norm(r[2]))) in seen or seen.add(key))]
    print(f"\nEvento: {NAME} | Fuentes: {SOURCES} | Requests: {len(REQUESTS)}")


def ask_configuration(default_count):
    print("\n" + "=" * 65)
    print(f"FLAMINGO DJ - {NAME}")
    print("=" * 65)

    while True:
        answer = input(
            f"1. Cantidad de canciones [{default_count}]: "
        ).strip()

        try:
            count = int(answer) if answer else default_count

            if count >= max(1, len(REQUESTS)):
                break
        except ValueError:
            pass

        print(
            f"Ingresa al menos {len(REQUESTS)} canciones."
        )

    artist_text = input(
        "\n2. Artistas prioritarios separados por coma "
        "(Enter = ninguno): "
    ).strip()

    priority_artists = {
        norm(name)
        for name in artist_text.split(",")
        if norm(name)
    }

    percentage = 0.0

    if priority_artists:
        while True:
            answer = input(
                "\n3. Porcentaje de prioridad (0-100): "
            ).strip().replace("%", "").replace(",", ".")

            try:
                percentage = float(answer)

                if 0 <= percentage <= 100:
                    break
            except ValueError:
                pass

            print("Ingresa un porcentaje entre 0 y 100.")

    target = round(count * percentage / 100)

    print("\nCONFIGURACION")
    print("-" * 55)
    print("Total canciones:", count)
    print("Artistas:", artist_text or "Ninguno")
    print("Porcentaje:", f"{percentage:g}%")
    print("Objetivo prioritarias:", target)
    print("Objetivo otras:", count - target)
    print("Requests:", len(REQUESTS))
    print("-" * 55)

    return {
        "count": count,
        "priorityArtists": priority_artists,
        "priorityArtistText": artist_text,
        "percentage": percentage,
        "priorityTarget": target,
    }


# ============================================================
# OPTIONAL READ-ONLY MASTER GENRES
# ============================================================

def artist_genres_from_master(root):
    db = (
        root.parent
        / "_FLAMINGO - MASTER"
        / "MASTER_CLEAN.db"
    )

    if not db.exists():
        return {}

    conn = sqlite3.connect(
        f"file:{db.as_posix()}?mode=ro",
        uri=True
    )

    try:
        columns = {
            row[1].lower(): row[1]
            for row in conn.execute(
                'PRAGMA table_info("Artists")'
            )
        }

        artist_col = (
            columns.get("name")
            or columns.get("artistname")
            or columns.get("artist")
        )

        genre_col = (
            columns.get("genres")
            or columns.get("genre")
        )

        if not artist_col or not genre_col:
            return {}

        query = (
            f'SELECT "{artist_col}", "{genre_col}" '
            'FROM "Artists"'
        )

        return {
            norm(name): parse_genres(genres)
            for name, genres in conn.execute(query)
            if name
        }

    except sqlite3.DatabaseError:
        return {}

    finally:
        conn.close()


# ============================================================
# BUILD TRACK POOL
# ============================================================

def build_pool(root):
    core = index_catalog(
        catalog(root, "tracks-core.json")
    )

    extra = index_catalog(
        catalog(root, "tracks-extra.json")
    )

    master_genres = artist_genres_from_master(root)

    pool = {}
    diagnostics = Counter()

    for source in SOURCES:
        path = source_path(root, source)
        print("Reading:", path)

        for entry in entries(load(path)):
            if not isinstance(entry, dict):
                entry = {"id": entry}

            key = str(
                first(
                    entry,
                    "id",
                    "externalSongId",
                    "SongID"
                ) or ""
            )

            merged = {
                **core.get(key, {}),
                **extra.get(key, {}),
            }

            for field, value in entry.items():
                if value is not None and value != "":
                    merged[field] = value

            spotify = sid(
                first(
                    merged,
                    "spotifyTrackId",
                    "SpotifyTrackID",
                    "spotifyUrl",
                    "SpotifyURL",
                    "spotifyURI",
                    "SpotifyURI",
                    "spotifyId"
                )
            )

            if not spotify:
                diagnostics["missing_spotify_url"] += 1
                continue

            title = str(
                first(merged, "title", "Title") or ""
            ).strip()

            artist = str(
                first(merged, "artist", "Artist") or ""
            ).strip()

            if not title or not artist:
                diagnostics["missing_metadata"] += 1
                continue

            names = artist_names(artist)
            primary = next(iter(names), norm(artist))

            # Preserve the first artist as primary.
            primary = norm(
                re.split(
                    r",| feat\.? | ft\.? | & ",
                    artist,
                    flags=re.I
                )[0]
            )

            year = release_year(
                first(
                    merged,
                    "originalReleaseDate",
                    "originalReleaseYear",
                    "releaseDate",
                    "ReleaseDate",
                    "releaseYear",
                    "year"
                )
            )

            genres = parse_genres(
                first(
                    merged,
                    "genre",
                    "Genre",
                    "genres"
                )
            )

            artist_genres = parse_genres(
                first(
                    merged,
                    "artistGenre",
                    "artistGenres",
                    "genreArtist"
                )
            )

            if not artist_genres:
                artist_genres = master_genres.get(
                    primary,
                    []
                )

            track = {
                "id": key,
                "spotifyId": spotify,
                "spotifyUrl": (
                    "https://open.spotify.com/track/"
                    + spotify
                ),
                "title": title,
                "artist": artist,
                "artistNames": names,
                "primary": primary,
                "pop": num(
                    first(
                        merged,
                        "spotifyPopularity",
                        "Popularity",
                        "popularity"
                    )
                ),
                "energy": num(
                    first(merged, "energy", "Energy")
                ),
                "bpm": num(
                    first(merged, "tempo", "BPM", "bpm")
                ),
                "key": str(
                    first(
                        merged,
                        "musicalKey",
                        "key",
                        "Key"
                    ) or ""
                ),
                "genres": genres,
                "artistGenres": artist_genres,
                "year": year,
                "era": era_of(year),
                "sources": {source},
                "requested": False,
                "note": "",
                "phase": "",
                "duration": num(
                    first(
                        merged,
                        "durationSeconds",
                        "duration"
                    )
                ),
            }

            if spotify in pool:
                previous = pool[spotify]

                combined_sources = (
                    previous["sources"] | track["sources"]
                )

                previous_quality = sum(
                    previous[field] is not None
                    for field in (
                        "pop", "energy", "bpm", "year"
                    )
                )

                new_quality = sum(
                    track[field] is not None
                    for field in (
                        "pop", "energy", "bpm", "year"
                    )
                )

                if new_quality > previous_quality:
                    track["sources"] = combined_sources
                    pool[spotify] = track
                else:
                    previous["sources"] = combined_sources

            else:
                pool[spotify] = track

    return list(pool.values()), diagnostics


# ============================================================
# REQUEST MATCHING
# ============================================================

def request_matches(track, artist, title):
    requested_title = norm(title)
    actual_title = norm(track["title"])

    title_ok = (
        actual_title == requested_title
        or actual_title.startswith(
            requested_title + " feat "
        )
        or actual_title.startswith(
            requested_title + " featuring "
        )
    )

    artist_ok = (
        norm(artist) in track["artistNames"]
        or norm(artist) == track["primary"]
    )

    return title_ok and artist_ok


def match_requests(pool):
    matched = []
    missing = []
    used = set()

    for phase, artist, title, note in REQUESTS:
        candidates = [
            track
            for track in pool
            if track["spotifyId"] not in used
            and request_matches(
                track, artist, title
            )
        ]

        if not candidates:
            missing.append({
                "phase": phase,
                "artist": artist,
                "title": title,
                "note": note,
            })
            continue

        candidates.sort(
            key=lambda track: (
                bool(
                    re.search(
                        r"\b(live|remix|cover|karaoke)\b",
                        track["title"],
                        re.I
                    )
                ),
                -(track["pop"] or 0)
            )
        )

        chosen = dict(candidates[0])

        chosen["sources"] = set(chosen["sources"])
        chosen["artistNames"] = set(chosen["artistNames"])
        chosen["requested"] = True
        chosen["phase"] = phase
        chosen["note"] = note

        matched.append(chosen)
        used.add(chosen["spotifyId"])

    return matched, missing


# ============================================================
# SCORING
# ============================================================

def affinity(track):
    genres = set(
        track["genres"] + track["artistGenres"]
    )

    artist_bonus = (
        2.5
        if track["primary"] in ARTIST_SEEDS
        else 0
    )

    genre_matches = sum(
        1
        for genre in genres
        if any(
            seed in genre or genre in seed
            for seed in GENRE_SEEDS
        )
    )

    return (
        artist_bonus
        + min(3.5, genre_matches * 1.2)
    )


def score(track, phase):
    name, _, target_energy, target_pop = phase

    popularity = (
        track["pop"]
        if track["pop"] is not None
        else 45
    )

    energy = energy10(track)

    if energy is None:
        energy = 5.8

    value = (
        affinity(track) * 8
        + popularity * 0.38
        - abs(energy - target_energy) * 5
        - abs(popularity - target_pop) * 0.35
    )

    year = track["year"]

    if year is None:
        value -= 15
    elif year >= 2020:
        value += 22
    elif year >= 2010:
        value += 14
    elif year >= 2000:
        value += 7
    elif year >= 1990:
        value += 3
    else:
        value -= 100

    if name in ("ARRIVAL", "WARMUP", "BACKGROUND"):
        value -= (
            max(0, popularity - 70) * 1.5
            + max(0, energy - 6.5) * 9
        )

    if "PEAK" in name or "CLOSER" in name:
        value += (
            max(0, popularity - 80) * 0.65
        )

    if track["bpm"] is None:
        value -= 8

    return value


def transition(previous, current):
    if previous is None:
        return 0

    penalty = 0

    a = previous["bpm"]
    b = current["bpm"]

    if a and b:
        difference = min(
            abs(a - b),
            abs(a * 2 - b),
            abs(a - b * 2)
        )

        penalty += min(
            45,
            difference * 1.5
        )
    else:
        penalty += 8

    e1 = energy10(previous)
    e2 = energy10(current)

    if e1 is not None and e2 is not None:
        penalty += abs(e1 - e2) * 3

    if previous["primary"] == current["primary"]:
        penalty += 65

    y1 = previous["year"]
    y2 = current["year"]

    if y1 is not None and y2 is not None:
        gap = abs(y1 - y2)

        if gap <= 5:
            penalty += gap * 0.2
        elif gap <= 10:
            penalty += 3
        elif gap <= 20:
            penalty += 12
        else:
            penalty += 28

    if previous["era"] != current["era"]:
        penalty += 8

    return penalty


# ============================================================
# PHASE QUOTAS
# ============================================================

def phase_quotas(count, requests):
    weights = [phase[1] for phase in PHASES]
    total_weight = sum(weights)

    raw = [
        count * weight / total_weight
        for weight in weights
    ]

    quotas = [int(value) for value in raw]

    for index in sorted(
        range(len(raw)),
        key=lambda i: raw[i] - quotas[i],
        reverse=True
    )[:count - sum(quotas)]:
        quotas[index] += 1

    mandatory = {
        phase[0]: sum(
            track["phase"] == phase[0]
            for track in requests
        )
        for phase in PHASES
    }

    # Make room for requests in small playlists.
    for index, phase in enumerate(PHASES):
        required = mandatory[phase[0]]

        while quotas[index] < required:
            donors = [
                j
                for j, other_phase in enumerate(PHASES)
                if quotas[j] > mandatory[other_phase[0]]
            ]

            if not donors:
                raise ValueError(
                    "No hay suficientes espacios para requests."
                )

            donor = max(
                donors,
                key=lambda j: (
                    quotas[j] - mandatory[PHASES[j][0]]
                )
            )

            quotas[donor] -= 1
            quotas[index] += 1

    return quotas


# ============================================================
# ARRANGE ERA BLOCKS
# ============================================================

def arrange_phase(
    tracks,
    phase,
    rng,
    randomness,
    previous=None
):
    requests = [
        track for track in tracks
        if track["requested"]
    ]

    fillers = [
        track for track in tracks
        if not track["requested"]
    ]

    total = len(tracks)
    result = []

    request_positions = [
        round(
            (i + 1) * (total + 1)
            / (len(requests) + 1)
        ) - 1
        for i in range(len(requests))
    ]

    request_index = 0
    active_era = previous["era"] if previous else None
    block_length = 0

    while len(result) < total:
        position = len(result)

        if (
            request_index < len(requests)
            and position >= request_positions[request_index]
        ):
            chosen = requests[request_index]
            request_index += 1

            result.append(chosen)
            previous = chosen
            active_era = chosen["era"]
            block_length = 1
            continue

        if not fillers:
            if request_index < len(requests):
                chosen = requests[request_index]
                request_index += 1

                result.append(chosen)
                previous = chosen
                active_era = chosen["era"]
                block_length = 1
                continue

            break

        next_request = (
            requests[request_index]
            if request_index < len(requests)
            else None
        )

        if active_era is None or block_length >= 12:
            era_counts = Counter(
                track["era"]
                for track in fillers
            )

            available_eras = [
                era
                for era in (
                    "90s", "2000s", "2010s", "TRENDS"
                )
                if era_counts[era] > 0
            ]

            if not available_eras:
                available_eras = list(era_counts)

            def era_rank(era):
                value = era_counts[era] * 0.4

                if previous and previous["era"] == era:
                    value += 12

                if next_request and next_request["era"] == era:
                    value += 10

                if era == "TRENDS":
                    value += 5

                return value + rng.uniform(-3, 3)

            active_era = max(
                available_eras,
                key=era_rank
            )

            block_length = 0

        same_era = [
            track
            for track in fillers
            if track["era"] == active_era
        ]

        candidates = (
            same_era
            if same_era and block_length < 12
            else fillers
        )

        def ordering_score(track):
            value = score(track, phase)

            value -= transition(previous, track)

            if track["era"] == active_era:
                value += 25

            if (
                next_request
                and track["era"] == next_request["era"]
            ):
                value += 5

            value += rng.uniform(
                -randomness * 0.15,
                randomness * 0.15
            )

            return value

        chosen = max(
            candidates,
            key=ordering_score
        )

        fillers.remove(chosen)
        result.append(chosen)

        if chosen["era"] == active_era:
            block_length += 1
        else:
            active_era = chosen["era"]
            block_length = 1

        previous = chosen

    return result


# ============================================================
# CREATE PLAYLIST WITH PRIORITY QUOTA
# ============================================================

def create_plan(pool, config, randomness, seed):
    rng = random.Random(seed)

    count = config["count"]
    priority_artists = config["priorityArtists"]
    priority_target = config["priorityTarget"]

    requests, missing = match_requests(pool)

    if len(requests) > count:
        raise ValueError(
            "Los requests encontrados superan el total."
        )

    quotas = phase_quotas(count, requests)

    requested_priority = sum(
        is_priority(track, priority_artists)
        for track in requests
    )

    requested_other = (
        len(requests) - requested_priority
    )

    # Mandatory requests always take precedence.
    if requested_priority > priority_target:
        raise ValueError(
            f"Los requests incluyen {requested_priority} "
            "canciones de artistas prioritarios, pero "
            f"la cuota elegida es {priority_target}. "
            "Aumenta el porcentaje."
        )

    if requested_other > count - priority_target:
        raise ValueError(
            "Los requests de otros artistas superan "
            "los espacios disponibles. "
            "Reduce el porcentaje prioritario."
        )

    needed_priority = (
        priority_target - requested_priority
    )

    needed_other = (
        count - priority_target - requested_other
    )

    selected = {
        track["spotifyId"]
        for track in requests
    }

    artist_counts = Counter(
        track["primary"]
        for track in requests
    )

    slots = {
        phase[0]: [
            track
            for track in requests
            if track["phase"] == phase[0]
        ]
        for phase in PHASES
    }

    candidates = [
        track
        for track in pool
        if track["spotifyId"] not in selected
        and track["year"] is not None
        and track["year"] >= MIN_YEAR
        and track["pop"] is not None
    ]

    priority_pool = [
        track
        for track in candidates
        if is_priority(track, priority_artists)
    ]

    other_pool = [
        track
        for track in candidates
        if not is_priority(track, priority_artists)
    ]

    if len(priority_pool) < needed_priority:
        raise ValueError(
            "No hay suficientes canciones de artistas "
            "prioritarios en los JSON. "
            f"Necesitas {needed_priority} adicionales "
            f"y hay {len(priority_pool)}. "
            "Reduce el porcentaje o amplía las fuentes."
        )

    if len(other_pool) < needed_other:
        raise ValueError(
            "No hay suficientes canciones de otros artistas. "
            f"Necesitas {needed_other} adicionales "
            f"y hay {len(other_pool)}."
        )

    remaining_slots = {
        phase[0]: quota - len(slots[phase[0]])
        for phase, quota in zip(PHASES, quotas)
    }

    total_remaining = sum(remaining_slots.values())

    raw_priority = {
        name: (
            needed_priority * amount / total_remaining
            if total_remaining else 0
        )
        for name, amount in remaining_slots.items()
    }

    priority_by_phase = {
        name: min(
            remaining_slots[name],
            int(raw_priority[name])
        )
        for name in remaining_slots
    }

    remaining = (
        needed_priority - sum(priority_by_phase.values())
    )

    while remaining:
        possible = [
            name
            for name in remaining_slots
            if priority_by_phase[name] < remaining_slots[name]
        ]

        chosen = max(
            possible,
            key=lambda name: (
                raw_priority[name] - priority_by_phase[name]
            )
        )

        priority_by_phase[chosen] += 1
        remaining -= 1

    selected_eras = Counter(
        track["era"]
        for track in requests
    )

    era_targets = {
        era: count * weight
        for era, weight in ERA_WEIGHTS.items()
    }

    def candidate_score(track, phase):
        value = score(track, phase)

        value -= artist_counts[track["primary"]] * 10

        era = track["era"]

        if selected_eras[era] < era_targets.get(era, 0):
            value += 14

        if era == "TRENDS":
            value += 5

        value += rng.uniform(
            -randomness,
            randomness
        )

        return value

    for phase, quota in zip(PHASES, quotas):
        name = phase[0]

        priority_slots = priority_by_phase[name]
        other_slots = (
            remaining_slots[name] - priority_slots
        )

        for group, required in (
            (priority_pool, priority_slots),
            (other_pool, other_slots)
        ):
            for _ in range(required):
                available = [
                    track
                    for track in group
                    if track["spotifyId"] not in selected
                ]

                if not available:
                    raise ValueError(
                        "No se pudo completar la cuota."
                    )

                chosen = max(
                    available,
                    key=lambda track: candidate_score(
                        track, phase
                    )
                )

                chosen = dict(chosen)
                chosen["sources"] = set(chosen["sources"])
                chosen["artistNames"] = set(chosen["artistNames"])
                chosen["phase"] = name

                slots[name].append(chosen)

                selected.add(chosen["spotifyId"])
                artist_counts[chosen["primary"]] += 1
                selected_eras[chosen["era"]] += 1

    ordered = []

    for phase in PHASES:
        arranged = arrange_phase(
            slots[phase[0]],
            phase,
            rng,
            randomness,
            ordered[-1] if ordered else None
        )

        ordered.extend(arranged)

    actual_priority = sum(
        is_priority(track, priority_artists)
        for track in ordered
    )

    if actual_priority != priority_target:
        raise ValueError(
            "La cuota final no coincide con el porcentaje."
        )

    if len(ordered) != count:
        raise ValueError(
            f"Se seleccionaron {len(ordered)} "
            f"de {count} canciones."
        )

    if len({
        track["spotifyId"]
        for track in ordered
    }) != len(ordered):
        raise ValueError(
            "Se detectaron canciones duplicadas."
        )

    return (
        ordered,
        missing,
        artist_counts,
        Counter(track["era"] for track in ordered)
    )


# ============================================================
# EXCEL
# ============================================================

def excel(path, tracks, missing, config, seed):
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill, Font, Alignment

    wb = Workbook()

    ws = wb.active
    ws.title = "DJ SET ORDER"

    headers = [
        "#",
        "Phase",
        "Era",
        "Release Year",
        "Title",
        "Artist",
        "Priority Artist",
        "BPM",
        "Energy /10",
        "Popularity",
        "Key",
        "Genre",
        "Artist Genre",
        "Source Playlists",
        "Requested",
        "DJ Notes",
        "Spotify URL",
        "SongID",
        "Fit Score",
    ]

    ws.append(headers)

    dark = PatternFill(
        "solid",
        fgColor="252638"
    )

    pink = PatternFill(
        "solid",
        fgColor="F8C9DF"
    )

    blue = PatternFill(
        "solid",
        fgColor="DDEBF7"
    )

    alternate = PatternFill(
        "solid",
        fgColor="F3F5F9"
    )

    for cell in ws[1]:
        cell.fill = dark
        cell.font = Font(
            color="FFFFFF",
            bold=True
        )
        cell.alignment = Alignment(vertical="center")

    ws.row_dimensions[1].height = 30

    widths = {
        "A": 7,
        "B": 23,
        "C": 15,
        "D": 15,
        "E": 40,
        "F": 32,
        "G": 18,
        "H": 11,
        "I": 13,
        "J": 13,
        "K": 12,
        "L": 30,
        "M": 30,
        "N": 27,
        "O": 13,
        "P": 43,
        "Q": 51,
        "R": 16,
        "S": 13,
    }

    for col, width in widths.items():
        ws.column_dimensions[col].width = width

    for index, track in enumerate(tracks, 1):
        phase = next(
            phase
            for phase in PHASES
            if phase[0] == track["phase"]
        )

        priority = is_priority(
            track,
            config["priorityArtists"]
        )

        ws.append([
            index,
            track["phase"],
            track["era"],
            track["year"],
            track["title"],
            track["artist"],
            "YES" if priority else "NO",
            track["bpm"],
            energy10(track),
            track["pop"],
            track["key"],
            ", ".join(track["genres"]),
            ", ".join(track["artistGenres"]),
            ", ".join(sorted(track["sources"])),
            "YES" if track["requested"] else "NO",
            track["note"],
            track["spotifyUrl"],
            track["id"],
            round(score(track, phase), 2),
        ])

        row = index + 1

        if track["requested"]:
            for cell in ws[row]:
                cell.fill = pink

            ws.cell(row, 15).font = Font(
                bold=True,
                color="9C174D"
            )

        elif index % 2 == 0:
            for cell in ws[row]:
                cell.fill = alternate

        if priority and not track["requested"]:
            ws.cell(row, 7).fill = blue

        url_cell = ws.cell(row, 17)

        if track["spotifyUrl"]:
            url_cell.hyperlink = track["spotifyUrl"]
            url_cell.font = Font(
                color="1763B1",
                underline="single"
            )

        ws.cell(row, 8).number_format = "0.0"
        ws.cell(row, 9).number_format = "0.0"

    ws.freeze_panes = "E2"
    ws.auto_filter.ref = ws.dimensions

    summary = wb.create_sheet("SUMMARY")

    actual_priority = sum(
        is_priority(
            track,
            config["priorityArtists"]
        )
        for track in tracks
    )

    summary_rows = [
        ["Metric", "Value"],
        ["Playlist", NAME],
        ["Total Tracks", len(tracks)],
        ["Priority Artists", config["priorityArtistText"]],
        ["Priority Percentage", f'{config["percentage"]:g}%'],
        ["Priority Target", config["priorityTarget"]],
        ["Priority Actual", actual_priority],
        ["Other Artists", len(tracks) - actual_priority],
        ["Requests Found", sum(t["requested"] for t in tracks)],
        ["Requests Missing", len(missing)],
        ["Random Seed", str(seed)],
    ]

    for phase in PHASES:
        summary_rows.append([
            phase[0],
            sum(
                track["phase"] == phase[0]
                for track in tracks
            )
        ])

    era_counts = Counter(
        track["era"]
        for track in tracks
    )

    for era in (
        "90s",
        "2000s",
        "2010s",
        "TRENDS",
        "UNKNOWN",
        "CLASSICS"
    ):
        summary_rows.append([
            era,
            era_counts[era]
        ])

    for row in summary_rows:
        summary.append(row)

    for cell in summary[1]:
        cell.fill = dark
        cell.font = Font(
            color="FFFFFF",
            bold=True
        )

    summary.column_dimensions["A"].width = 35
    summary.column_dimensions["B"].width = 55

    missing_ws = wb.create_sheet("MISSING REQUESTS")

    missing_ws.append([
        "Phase",
        "Artist",
        "Title",
        "Note"
    ])

    for item in missing:
        missing_ws.append([
            item["phase"],
            item["artist"],
            item["title"],
            item["note"]
        ])

    for cell in missing_ws[1]:
        cell.fill = dark
        cell.font = Font(
            color="FFFFFF",
            bold=True
        )

    for col, width in {
        "A": 24,
        "B": 30,
        "C": 40,
        "D": 45
    }.items():
        missing_ws.column_dimensions[col].width = width

    missing_ws.freeze_panes = "A2"
    missing_ws.auto_filter.ref = missing_ws.dimensions

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    wb.save(path)

    print("Excel creado:", path)


def open_excel(path):
    try:
        if sys.platform == "win32":
            os.startfile(str(path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])

        print("Excel abierto:", path)

    except Exception as exc:
        print("No se pudo abrir Excel:", exc)
        print("Ruta:", path)


# ============================================================
# SPOTIFY AUTHENTICATION
# ============================================================

def spotify_connection(root):
    from dotenv import load_dotenv
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth, SpotifyPKCE

    env_paths = [
        root.parent / "_FLAMINGO - MASTER" / ".env",
        root.parent / ".env",
        root / ".env",
        root / ".env.local",
    ]

    for path in env_paths:
        if path.exists():
            load_dotenv(path, override=False)

    client_id = (
        os.getenv("SPOTIFY_CLIENT_ID")
        or os.getenv("VITE_SPOTIFY_CLIENT_ID")
    )

    secret = os.getenv("SPOTIFY_CLIENT_SECRET")

    redirect = (
        os.getenv("SPOTIFY_REDIRECT_URI")
        or os.getenv("VITE_SPOTIFY_REDIRECT_URI")
    )

    if not client_id or not redirect:
        raise RuntimeError(
            "Faltan credenciales Spotify en .env"
        )

    options = {
        "client_id": client_id,
        "redirect_uri": redirect,
        "scope": (
            "playlist-read-private "
            "playlist-modify-private "
            "playlist-modify-public"
        ),
        "cache_path": str(
            root.parent
            / "_FLAMINGO - MASTER"
            / ".spotify_event_creator_cache"
        ),
    }

    if secret:
        auth = SpotifyOAuth(
            client_secret=secret,
            **options
        )
    else:
        auth = SpotifyPKCE(**options)

    return spotipy.Spotify(
        auth_manager=auth,
        requests_timeout=30,
        retries=3,
        status_retries=3,
        backoff_factor=1,
    )


# ============================================================
# FIND MISSING REQUESTS ON SPOTIFY
# ============================================================

def resolve_missing_spotify(sp, pool):
    _, missing = match_requests(pool)

    for request in missing:
        artist = request["artist"]
        title = request["title"]

        # Broad query supports featured-artist titles.
        results = sp.search(
            q=f"{title} {artist}",
            type="track",
            limit=20
        ).get("tracks", {}).get("items", [])

        candidates = []

        for item in results:
            if not item:
                continue

            actual_title = norm(item.get("name"))
            expected_title = norm(title)

            title_ok = (
                actual_title == expected_title
                or actual_title.startswith(
                    expected_title + " feat "
                )
                or actual_title.startswith(
                    expected_title + " featuring "
                )
            )

            artists = {
                norm(a.get("name"))
                for a in item.get("artists", [])
            }

            if title_ok and norm(artist) in artists:
                candidates.append(item)

        candidates.sort(
            key=lambda item: (
                bool(
                    re.search(
                        r"\b(live|remix|cover|karaoke)\b",
                        item.get("name", ""),
                        re.I
                    )
                ),
                -(item.get("popularity") or 0)
            )
        )

        if not candidates:
            print(
                "MISSING SPOTIFY MATCH:",
                artist,
                "-",
                title
            )
            continue

        item = candidates[0]
        spotify = item["id"]

        if any(
            track["spotifyId"] == spotify
            for track in pool
        ):
            continue

        year = release_year(
            (item.get("album") or {}).get("release_date")
        )

        artist_list = [
            a.get("name", "")
            for a in item.get("artists", [])
        ]

        pool.append({
            "id": "",
            "spotifyId": spotify,
            "spotifyUrl": (
                "https://open.spotify.com/track/"
                + spotify
            ),
            "title": item["name"],
            "artist": ", ".join(artist_list),
            "artistNames": artist_names(artist_list),
            "primary": norm(artist),
            "pop": num(item.get("popularity")),
            "energy": None,
            "bpm": None,
            "key": "",
            "genres": [],
            "artistGenres": [],
            "year": year,
            "era": era_of(year),
            "sources": {"SPOTIFY REQUEST"},
            "requested": False,
            "note": "",
            "phase": "",
            "duration": num(
                item.get("duration_ms"), 0
            ) / 1000,
        })

        print(
            "SPOTIFY REQUEST FOUND:",
            artist,
            "-",
            title
        )


# ============================================================
# PUBLISH / REPLACE SPOTIFY PLAYLIST
# ============================================================

def publish(root, tracks, sp=None):
    sp = sp or spotify_connection(root)

    user = sp.current_user()["id"]

    offset = 0
    existing = None

    while True:
        page = sp.current_user_playlists(
            limit=50,
            offset=offset
        )

        for item in page.get("items", []):
            if not item:
                continue

            same_name = (
                item.get("name", "").casefold()
                == NAME.casefold()
            )

            owner = (
                item.get("owner") or {}
            ).get("id")

            if same_name and owner == user:
                existing = item
                break

        if existing or not page.get("next"):
            break

        offset += len(page.get("items", []))

    if not existing:
        existing = sp.user_playlist_create(
            user=user,
            name=NAME,
            public=False,
            description=(
                f"Flamingo DJ - event: {NAME}"
            )
        )

    playlist_id = existing["id"]

    uris = [
        "spotify:track:" + track["spotifyId"]
        for track in tracks
    ]

    sp.playlist_replace_items(
        playlist_id,
        uris[:100]
    )

    for index in range(100, len(uris), 100):
        sp.playlist_add_items(
            playlist_id,
            uris[index:index + 100]
        )

    return (
        (existing.get("external_urls") or {}).get("spotify")
        or (
            "https://open.spotify.com/playlist/"
            + playlist_id
        )
    )


# ============================================================
# SAVE JSON FOR MIX IN KEY WORKFLOW
# ============================================================

def save_mixnkey_source(root, tracks, spotify_url):
    """
    Export playlist in Spotify-to-MASTER-style JSON.

    Does not update MASTER_CLEAN.db or DJ.db.
    SongID remains null for unknown local tracks.
    """

    folder = (
        root.parent
        / "_FLAMINGO - MASTER"
        / "PLAYLIST_JSON"
        / NAME
    )

    folder.mkdir(
        parents=True,
        exist_ok=True
    )

    playlist_id = (
        spotify_url.rstrip("/")
        .split("/")[-1]
        .split("?")[0]
    )

    items = []

    for position, track in enumerate(tracks, 1):
        raw_id = str(
            track.get("id") or ""
        ).strip()

        song_id = (
            int(raw_id)
            if raw_id.isdecimal()
            else None
        )

        spotify = track["spotifyId"]

        artists = [
            artist.strip()
            for artist in re.split(
                r",|\s+feat\.?\s+|\s+ft\.?\s+",
                track["artist"],
                flags=re.I
            )
            if artist.strip()
        ]

        items.append({
            "SongID": song_id,
            "Title": track["title"],
            "Artist": track["artist"],
            "Position": position,
            "PlaylistAddedAt": None,
            "SpotifyTrackID": spotify,
            "SpotifyURI": f"spotify:track:{spotify}",
            "SpotifyURL": track["spotifyUrl"],
            "SpotifyArtists": [
                {
                    "id": None,
                    "name": artist,
                    "uri": None,
                    "external_urls": {},
                }
                for artist in artists
            ],
            "Status": "EXPORTED_FROM_EVENT",
            "DJStatus": "NOT_CHECKED",
            "DJReasons": [],
            "PendingReasons": [],
        })

    payload = {
        "schemaVersion": 4,
        "playlistName": NAME,
        "spotifyPlaylistId": playlist_id,
        "spotifyPlaylistName": NAME,
        "spotifySnapshotId": None,
        "pendingSpotifyPlaylistName": None,
        "pendingSpotifyPlaylistId": None,
        "pendingSpotifyPlaylistURL": None,
        "pendingRule": (
            "Not computed: run SPOTIFY_PLAYLIST_TO_MASTER.py "
            "for true pending"
        ),
        "totalTracks": len(items),
        "completeTracks": None,
        "pendingTracks": None,
        "generatedAt": datetime.now().isoformat(
            timespec="seconds"
        ),
        "tracks": items,
    }

    target = folder / f"{NAME}.json"

    target.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    print("JSON guardado:", target)

    missing_ids = sum(
        track["SongID"] is None
        for track in items
    )

    if missing_ids:
        print(
            f"AVISO: {missing_ids} canciones "
            "no tienen SongID."
        )
        print(
            "Ejecuta SPOTIFY_PLAYLIST_TO_MASTER.py "
            "antes del flujo Mix in Key."
        )

    return target


# ============================================================
# SAVE PLAN AND MISSING REPORT
# ============================================================

def save_reports(output, tracks, missing, config, seed):
    def clean(track):
        return {
            key: (
                sorted(value)
                if isinstance(value, set)
                else value
            )
            for key, value in track.items()
        }

    payload = {
        "playlistName": NAME,
        "generatedAt": datetime.now().isoformat(
            timespec="seconds"
        ),
        "targetTracks": config["count"],
        "priorityArtists": sorted(
            config["priorityArtists"]
        ),
        "priorityPercentage": config["percentage"],
        "priorityTarget": config["priorityTarget"],
        "seed": seed,
        "sourcePlaylists": SOURCES,
        "tracks": [
            clean(track)
            for track in tracks
        ],
    }

    (output / f"{safe_filename(NAME)}_PLAN.json").write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    (output / f"{safe_filename(NAME)}_MISSING_REQUESTS.json").write_text(
        json.dumps(
            missing,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Flamingo DJ Event Creator"
    )

    parser.add_argument(
        "--count",
        type=int,
        default=300
    )

    parser.add_argument(
        "--random",
        choices=["on", "off"],
        default="on"
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=None
    )

    parser.add_argument(
        "--resolve-missing",
        choices=["yes", "no"],
        default="yes"
    )

    args = parser.parse_args()

    root = root_dir()
    configure_event(root)
    config = ask_configuration(args.count)

    pool, diagnostics = build_pool(root)

    if not pool:
        raise ValueError(
            "No hay canciones con SpotifyURL."
        )

    output = (
        root.parent
        / "_FLAMINGO - MASTER"
        / "PLAYLIST_JSON"
        / NAME
    )

    output.mkdir(
        parents=True,
        exist_ok=True
    )

    spotify_client = None

    # Only search Spotify for missing mandatory requests.
    if args.resolve_missing == "yes":
        _, missing = match_requests(pool)

        if missing:
            approved = ask_yes_no(
                f"\n{len(missing)} requests faltantes. "
                "¿Buscarlos en Spotify?"
            )

            if approved:
                spotify_client = spotify_connection(root)

                resolve_missing_spotify(
                    spotify_client,
                    pool
                )

    attempt = 0

    while True:
        attempt += 1

        if args.random == "on":
            seed = (
                args.seed + attempt - 1
                if args.seed is not None
                else random.SystemRandom().randrange(
                    1, 2**32
                )
            )

            randomness = 14
        else:
            seed = 0
            randomness = 0

        tracks, missing, artists, era_counts = create_plan(
            pool,
            config,
            randomness,
            seed
        )

        xlsx = output / f"{NAME}.xlsx"

        try:
            excel(
                xlsx,
                tracks,
                missing,
                config,
                seed
            )
        except PermissionError:
            print(
                "\nCierra el Excel anterior "
                "antes de regenerar."
            )
            break

        save_reports(
            output,
            tracks,
            missing,
            config,
            seed
        )

        actual_priority = sum(
            is_priority(
                track,
                config["priorityArtists"]
            )
            for track in tracks
        )

        print("\n" + "=" * 70)
        print(f"FLAMINGO DJ - {NAME}")
        print("=" * 70)

        print("Propuesta:", attempt)
        print("Seed:", seed)

        print(
            "Canciones:",
            len(tracks),
            "/",
            config["count"]
        )

        print(
            "Requests encontrados:",
            sum(track["requested"] for track in tracks),
            "/",
            len(REQUESTS)
        )

        print("Requests faltantes:", len(missing))

        print("\nARTISTAS PRIORITARIOS")
        print("Objetivo:", config["priorityTarget"])
        print("Seleccionadas:", actual_priority)

        print(
            "Porcentaje real:",
            f"{100 * actual_priority / len(tracks):.1f}%"
        )

        print("\nDISTRIBUCION POR EPOCA")

        for era in (
            "90s",
            "2000s",
            "2010s",
            "TRENDS",
            "UNKNOWN",
            "CLASSICS"
        ):
            print(
                f"{era:12s}: {era_counts[era]}"
            )

        print(
            "\nArtistas principales:",
            artists.most_common(12)
        )

        print(
            "\nDiagnostico:",
            dict(diagnostics)
        )

        print("\nExcel:", xlsx)

        open_excel(xlsx)

        print(
            "\nFILAS ROSADAS = requests del cliente."
        )

        print(
            "AZUL = artista prioritario."
        )

        print(
            "Si quieres regenerar, cierra Excel primero."
        )

        approved = ask_yes_no(
            "\n¿Estas conforme con esta opcion de playlist "
            "para guardar en Spotify?"
        )

        if approved:
            if not tracks:
                print(
                    "No hay canciones disponibles "
                    "para publicar."
                )
                break

            # Missing requests DO NOT block publication.
            if missing:
                print(
                    f"\nAVISO: faltan {len(missing)} "
                    "canciones solicitadas."
                )

                print(
                    "Se publicara igualmente la "
                    "seleccion aprobada."
                )

                print(
                    "Los requests faltantes quedan "
                    "registrados en el Excel."
                )

            print(
                "\nPublicando playlist aprobada "
                "en Spotify..."
            )

            spotify_url = publish(
                root,
                tracks,
                spotify_client
            )

            print(
                "\nSPOTIFY PLAYLIST:",
                spotify_url
            )

            json_path = save_mixnkey_source(
                root,
                tracks,
                spotify_url
            )

            print("\nARCHIVOS GENERADOS")
            print("Excel:", xlsx)
            print("JSON:", json_path)
            print("Folder:", output)

            print(
                "\nPlaylist publicada correctamente."
            )

            break

        if args.random == "off":
            print(
                "Random OFF: otra propuesta "
                "seria identica."
            )
            break

        regenerate = ask_yes_no(
            "¿Quieres generar otra opcion random?"
        )

        if not regenerate:
            print(
                "Spotify no fue modificado."
            )
            break

    print(
        "\nMASTER_CLEAN.db y DJ.db "
        "no fueron modificados."
    )

    print("Proceso finalizado.")


if __name__ == "__main__":
    main()