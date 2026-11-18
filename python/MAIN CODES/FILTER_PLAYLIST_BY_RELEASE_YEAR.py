#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Filtra releaseDate y REEMPLAZA la playlist original, sin backups.

Ejemplo:
 python FILTER_PLAYLIST_BY_RELEASE_YEAR.py --playlist "REGGAETON 2020-2024" --from-year 2020 --to-year 2024
"""
from __future__ import annotations
import argparse
import json
import os
import re
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

DEFAULT_REPO = Path(r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES\FLAMINGOAPP_DJ_REACT")
DEFAULT_PLAYLIST = "REGGAETON 2020-2024"

def repo_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    for candidate in (DEFAULT_REPO, Path.cwd(), *Path(__file__).resolve().parents):
        if (candidate / "src" / "data" / "JSON").is_dir():
            return candidate
    return DEFAULT_REPO

def input_path(repo: Path, name: str, explicit: str | None) -> Path:
    if explicit:
        result = Path(explicit).expanduser().resolve()
        if not result.is_file():
            raise FileNotFoundError(result)
        return result
    filename = name if name.lower().endswith(".json") else name + ".json"
    options = [repo / "src/data/JSON/playlists" / filename,
               repo / "src/data/JSON/normalized/playlists" / filename]
    for path in options:
        if path.is_file():
            return path
    raise FileNotFoundError("No se encontró la playlist:\n" + "\n".join(map(str, options)))

def extract(data: Any) -> tuple[list[dict], str | None]:
    if isinstance(data, list):
        items, key = data, None
    elif isinstance(data, dict):
        key = next((k for k in ("tracks", "songs", "items") if isinstance(data.get(k), list)), None)
        if key is None:
            raise ValueError("No existe una lista tracks/songs/items en el JSON.")
        items = data[key]
    else:
        raise ValueError("La raíz del JSON debe ser un objeto o una lista.")
    if not all(isinstance(item, dict) for item in items):
        raise ValueError("Hay canciones con formato inválido.")
    return items, key

def year_of(item: dict) -> int | None:
    value = item.get("releaseDate")
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value if 1800 <= value <= 2200 else None
    if isinstance(value, str):
        match = re.match(r"^\s*(\d{4})(?=$|[-/])", value)
        if match:
            year = int(match.group(1))
            return year if 1800 <= year <= 2200 else None
    return None

def main() -> None:
    parser = argparse.ArgumentParser(description="Filtra y reemplaza el JSON original inmediatamente.")
    parser.add_argument("--repo", help="Carpeta raíz del proyecto")
    parser.add_argument("--playlist", default=DEFAULT_PLAYLIST)
    parser.add_argument("--input", help="Ruta exacta de la playlist")
    parser.add_argument("--from-year", type=int)
    parser.add_argument("--to-year", type=int)
    parser.add_argument("--keep-unknown", action="store_true", help="Conservar canciones sin releaseDate válido")
    args = parser.parse_args()
    source = input_path(repo_path(args.repo), args.playlist, args.input)
    years = re.findall(r"(?<!\d)(?:19|20)\d{2}(?!\d)", source.stem)
    start = args.from_year if args.from_year is not None else (int(years[0]) if len(years) >= 2 else None)
    end = args.to_year if args.to_year is not None else (int(years[1]) if len(years) >= 2 else None)
    if start is None or end is None or not 1800 <= start <= end <= 2200:
        raise ValueError("Indica un rango válido con --from-year y --to-year.")
    with source.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    entries, key = extract(data)
    kept = []
    unknown = 0
    counts = Counter()
    for entry in entries:
        year = year_of(entry)
        if year is None:
            unknown += 1
            if args.keep_unknown:
                kept.append(entry)
        elif start <= year <= end:
            kept.append(entry)
            counts[year] += 1
    if not kept:
        raise ValueError("El resultado está vacío: no se modificó el archivo original.")
    if key is None:
        output = kept
    else:
        data[key] = kept
        if "totalTracks" in data:
            data["totalTracks"] = len(kept)
        output = data
    # Escribir a un temporal en la misma carpeta y reemplazar de manera atómica.
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                         prefix=".flamingo_filter_", dir=source.parent,
                                         delete=False) as temp:
            temp_name = temp.name
            json.dump(output, temp, ensure_ascii=False, indent=2)
            temp.write("\n")
            temp.flush()
            os.fsync(temp.fileno())
        os.replace(temp_name, source)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)
    print("\n=== FLAMINGO DJ · FILTRO APLICADO ===")
    print(f"Archivo modificado: {source}")
    print(f"Rango: {start}-{end}")
    print(f"Original: {len(entries)} | Conservadas: {len(kept)} | Eliminadas: {len(entries)-len(kept)}")
    print(f"Sin fecha: {unknown}" + (" (conservadas)" if args.keep_unknown else " (excluidas)"))
    for year in range(start, end + 1):
        print(f"  {year}: {counts[year]}")
    print("Se reemplazó el JSON original. No se creó backup ni archivos adicionales.")

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"ERROR: {exc}")
