import csv
import json
import os
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


# ============================================================
# CONFIGURACIÓN
# ============================================================

DJ_DB = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
    r"\_FLAMINGO - MASTER\DJ.db"
)

PROJECT_DIR = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
    r"\FLAMINGOAPP_DJ_REACT"
)

JSON_DIR = PROJECT_DIR / "src" / "data" / "JSON"

RUN_STAMP = datetime.now().strftime("%Y%m%d_%H%M%S_%f")

RUN_DIR = (
    DJ_DB.parent
    / "POPULARITY_JSON_SYNC"
    / RUN_STAMP
)

BACKUP_DIR = RUN_DIR / "BACKUPS"
REPORT_PATH = RUN_DIR / "changes.csv"
SUMMARY_PATH = RUN_DIR / "summary.json"

POPULARITY_FIELDS = (
    "spotifyPopularity",
    "popularity",
    "Popularity",
    "SpotifyPopularity",
    "spotify_popularity",
)

SONG_ID_FIELDS = (
    "externalSongId",
    "SongID",
    "song_id",
    "songId",
    "id",
)

TRACK_COLLECTIONS = {
    "tracks",
    "songs",
}

ARTIST_COLLECTIONS = {
    "artists",
    "artistDetails",
    "primaryArtist",
    "primaryArtistDetails",
    "artist",
    "Artist",
}

TRACK_SIGNALS = {
    "title",
    "Title",
    "spotifyUrl",
    "spotify_url",
    "SpotifyURL",
    "Spotify_URL",
    "externalSongId",
    "SongID",
    "song_id",
}


# ============================================================
# UTILIDADES
# ============================================================

def log(message):
    print(message, flush=True)


def normalize_song_id(value):
    if isinstance(value, bool):
        return None

    if isinstance(value, int):
        return str(value)

    if isinstance(value, str):
        text = value.strip()

        if re.fullmatch(r"\d+", text):
            return str(int(text))

    return None


def identify_song(record, dictionary_key=None):
    for field in SONG_ID_FIELDS:
        song_id = normalize_song_id(record.get(field))

        if song_id is not None:
            return song_id

    return normalize_song_id(dictionary_key)


def load_popularities():
    if not DJ_DB.is_file():
        raise FileNotFoundError(
            f"No existe la base de datos:\n{DJ_DB}"
        )

    uri = DJ_DB.resolve().as_uri() + "?mode=ro"

    with sqlite3.connect(uri, uri=True) as conn:
        rows = conn.execute("""
            SELECT song_id, popularity
            FROM tracks
        """).fetchall()

    popularities = {}
    invalid_count = 0

    for song_id, popularity in rows:
        key = normalize_song_id(song_id)

        if (
            key is not None
            and type(popularity) is int
            and 0 <= popularity <= 100
        ):
            popularities[key] = popularity
        else:
            invalid_count += 1

    if not popularities:
        raise RuntimeError(
            "DJ.db no contiene popularidades válidas."
        )

    return popularities, len(rows), invalid_count


def atomic_write(path, content, encoding):
    temporary = path.with_name(
        path.name + ".popularity-sync.tmp"
    )

    try:
        with temporary.open(
            "w",
            encoding=encoding,
            newline="",
        ) as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(temporary, path)

    finally:
        if temporary.exists():
            temporary.unlink()


def serialize_json(payload, original):
    if "\n" in original:
        indent = 2

        match = re.search(r"\n([ \t]+)\S", original)

        if match:
            whitespace = match.group(1)
            indent = (
                "\t"
                if "\t" in whitespace
                else len(whitespace)
            )

        result = json.dumps(
            payload,
            ensure_ascii=False,
            indent=indent,
        )

    else:
        result = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    if original.endswith("\n"):
        result += "\n"

    return result


def looks_like_track(record):
    return (
        isinstance(record, dict)
        and bool(TRACK_SIGNALS.intersection(record))
    )


# ============================================================
# ACTUALIZAR UNA CANCIÓN
# ============================================================

def update_record(
    record,
    dictionary_key,
    popularities,
    relative_path,
    location,
    changes,
    stats,
    allow_add_popularity=False,
):
    song_id = identify_song(record, dictionary_key)

    if song_id is None:
        stats["records_without_song_id"] += 1
        return

    if song_id not in popularities:
        stats["records_without_valid_db_value"] += 1
        return

    stats["matched_records"] += 1

    fields = [
        field
        for field in POPULARITY_FIELDS
        if field in record
    ]

    # Añadir el campo solo al catálogo core o a un track
    # completo. No añadirlo al catálogo extra.
    if not fields and allow_add_popularity:
        fields = ["spotifyPopularity"]

    if not fields:
        return

    new_value = popularities[song_id]

    for field in fields:
        existed = field in record
        old_value = record.get(field)

        if (
            existed
            and type(old_value) is int
            and old_value == new_value
        ):
            continue

        record[field] = new_value

        changes.append({
            "file": str(relative_path),
            "json_location": location,
            "song_id": song_id,
            "field": field,
            "old_popularity": old_value,
            "new_popularity": new_value,
            "action": "UPDATED" if existed else "ADDED",
        })

        stats["fields_updated"] += 1


# ============================================================
# RECORRER FORMATOS JSON
# ============================================================

def process_payload(
    payload,
    popularities,
    relative_path,
    changes,
    stats,
):
    filename = relative_path.name.lower()

    is_core_catalog = filename == "tracks-core.json"
    is_extra_catalog = filename == "tracks-extra.json"

    seen = set()

    def process_record(record, dictionary_key, location):
        if not isinstance(record, dict):
            return

        marker = id(record)

        if marker in seen:
            return

        seen.add(marker)
        stats["track_records_seen"] += 1

        allow_add = (
            not is_extra_catalog
            and (
                is_core_catalog
                or looks_like_track(record)
            )
        )

        update_record(
            record=record,
            dictionary_key=dictionary_key,
            popularities=popularities,
            relative_path=relative_path,
            location=location,
            changes=changes,
            stats=stats,
            allow_add_popularity=allow_add,
        )

    def process_collection(collection, location):
        if isinstance(collection, list):
            for index, entry in enumerate(collection):
                if not isinstance(entry, dict):
                    # Las referencias por ID no se modifican.
                    continue

                wrapped = entry.get("track")

                if isinstance(wrapped, dict):
                    process_record(
                        wrapped,
                        None,
                        f"{location}[{index}].track",
                    )

                else:
                    process_record(
                        entry,
                        None,
                        f"{location}[{index}]",
                    )

        elif isinstance(collection, dict):
            for key, record in collection.items():
                if isinstance(record, dict):
                    process_record(
                        record,
                        key,
                        f"{location}[{key}]",
                    )

    def walk(node, location="$"):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ARTIST_COLLECTIONS:
                    continue

                if key in TRACK_COLLECTIONS:
                    process_collection(
                        value,
                        f"{location}.{key}",
                    )

                elif key == "track" and isinstance(value, dict):
                    process_record(
                        value,
                        None,
                        f"{location}.track",
                    )

                else:
                    walk(value, f"{location}.{key}")

        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{location}[{index}]")

    if isinstance(payload, list):
        # Lista directa de canciones.
        for index, entry in enumerate(payload):
            if looks_like_track(entry):
                process_record(entry, None, f"$[{index}]")

        walk(payload)

    elif isinstance(payload, dict):
        # Archivo que representa una canción.
        if looks_like_track(payload):
            process_record(payload, None, "$")

        # Catálogo plano indexado por SongID.
        for key, value in payload.items():
            if (
                normalize_song_id(key) is not None
                and isinstance(value, dict)
                and (
                    looks_like_track(value)
                    or is_core_catalog
                    or is_extra_catalog
                )
            ):
                process_record(
                    value,
                    key,
                    f"$[{key}]",
                )

        # Catálogos y playlists con colección "tracks".
        walk(payload)


# ============================================================
# PRINCIPAL
# ============================================================

def main():
    if not JSON_DIR.is_dir():
        raise FileNotFoundError(
            f"No existe la carpeta de JSON:\n{JSON_DIR}"
        )

    popularities, total_db, invalid_db = load_popularities()

    files = sorted(JSON_DIR.rglob("*.json"))

    if not files:
        raise RuntimeError(
            f"No se encontraron archivos JSON:\n{JSON_DIR}"
        )

    RUN_DIR.mkdir(parents=True, exist_ok=True)

    stats = {
        "database": str(DJ_DB),
        "json_directory": str(JSON_DIR),
        "database_tracks": total_db,
        "valid_database_popularities": len(popularities),
        "invalid_database_popularities_skipped": invalid_db,
        "json_files_found": len(files),
        "files_updated": 0,
        "files_unchanged": 0,
        "files_failed": 0,
        "track_records_seen": 0,
        "matched_records": 0,
        "records_without_song_id": 0,
        "records_without_valid_db_value": 0,
        "fields_updated": 0,
        "started_at": datetime.now().isoformat(),
    }

    failures = []

    log("=" * 70)
    log("DJ.db → POPULARIDAD DE LOS JSON DE FLAMINGO")
    log("=" * 70)
    log(f"Base: {DJ_DB}")
    log(f"JSON: {JSON_DIR}")
    log(f"Tracks en DJ.db: {total_db:,}")
    log(f"Popularidades válidas: {len(popularities):,}")
    log(f"Archivos JSON encontrados: {len(files):,}")
    log("Rango: todos los valores válidos, de 0 a 100.")
    log("Requests a Spotify: 0")
    log("Las bases de datos se mantienen sin cambios.\n")

    with REPORT_PATH.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as report_handle:
        writer = csv.DictWriter(
            report_handle,
            fieldnames=[
                "file",
                "json_location",
                "song_id",
                "field",
                "old_popularity",
                "new_popularity",
                "action",
            ],
        )
        writer.writeheader()

        for index, path in enumerate(files, start=1):
            relative = path.relative_to(JSON_DIR)

            try:
                raw = path.read_bytes()
                has_bom = raw.startswith(b"\xef\xbb\xbf")
                original = raw.decode("utf-8-sig")
                payload = json.loads(original)

                changes = []

                local_stats = {
                    "track_records_seen": 0,
                    "matched_records": 0,
                    "records_without_song_id": 0,
                    "records_without_valid_db_value": 0,
                    "fields_updated": 0,
                }

                process_payload(
                    payload=payload,
                    popularities=popularities,
                    relative_path=relative,
                    changes=changes,
                    stats=local_stats,
                )

                if changes:
                    updated_text = serialize_json(
                        payload,
                        original,
                    )

                    # Verificar que el resultado siga siendo JSON válido.
                    json.loads(updated_text)

                    backup_path = BACKUP_DIR / relative
                    backup_path.parent.mkdir(
                        parents=True,
                        exist_ok=True,
                    )

                    shutil.copy2(path, backup_path)

                    atomic_write(
                        path,
                        updated_text,
                        "utf-8-sig" if has_bom else "utf-8",
                    )

                    writer.writerows(changes)
                    report_handle.flush()

                    stats["files_updated"] += 1

                    log(
                        f"[{index}/{len(files)}] "
                        f"ACTUALIZADO: {relative} | "
                        f"{len(changes):,} campos"
                    )

                else:
                    stats["files_unchanged"] += 1

                for key, value in local_stats.items():
                    stats[key] += value

            except Exception as exc:
                stats["files_failed"] += 1

                failures.append({
                    "file": str(relative),
                    "error": str(exc),
                })

                log(f"ERROR: {relative}: {exc}")

    stats["finished_at"] = datetime.now().isoformat()
    stats["failures"] = failures

    SUMMARY_PATH.write_text(
        json.dumps(
            stats,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    log("\n" + "=" * 70)
    log("RESULTADO")
    log("=" * 70)
    log(f"Archivos actualizados: {stats['files_updated']:,}")
    log(f"Archivos sin cambios: {stats['files_unchanged']:,}")
    log(f"Archivos con errores: {stats['files_failed']:,}")
    log(f"Campos actualizados: {stats['fields_updated']:,}")
    log(
        "Registros sin valor válido en DJ.db: "
        f"{stats['records_without_valid_db_value']:,}"
    )

    log(f"\nReporte: {REPORT_PATH}")
    log(f"Resumen: {SUMMARY_PATH}")
    log(f"Respaldos: {BACKUP_DIR}")

    if stats["files_failed"]:
        raise SystemExit(
            "\nHubo errores en algunos archivos. "
            "Consulta summary.json."
        )

    log("\nSincronización terminada.")


if __name__ == "__main__":
    main()