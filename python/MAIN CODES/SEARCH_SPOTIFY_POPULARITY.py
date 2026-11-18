import csv
import hashlib
import json
import re
import sqlite3
import time
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

import spotipy
from dotenv import load_dotenv
from spotipy.exceptions import SpotifyException
from spotipy.oauth2 import SpotifyClientCredentials


# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE_DIR = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES\_FLAMINGO - MASTER"
)

DJ_DB = BASE_DIR / "DJ.db"
MASTER_DB = BASE_DIR / "MASTER_CLEAN.db"
ENV_FILE = BASE_DIR / ".env"

OUTPUT_DIR = BASE_DIR / "POPULARITY_UPDATE"
BACKUP_DIR = OUTPUT_DIR / "BACKUPS"
CACHE_DB = OUTPUT_DIR / "search_cache.db"
REPORT_CSV = OUTPUT_DIR / "popularity_results.csv"

MIN_POPULARITY = 31
MAX_POPULARITY = 50

PAGE_SIZE = 10
REQUEST_PAUSE = 0.4
MAX_QUERY_LENGTH = 250

TITLE_THRESHOLD = 0.86
ARTIST_THRESHOLD = 0.85

# NO CAMBIAR: mantienen la continuidad con el script anterior.
CAMPAIGN = "popularity_refresh_001"
MATCH_RULES_VERSION = "1"

VERSION_PATTERNS = {
    "remix": r"\bremix\b",
    "live": r"\blive\b|\ben vivo\b|\ben directo\b",
    "acoustic": r"\bacoustic\b|\bacustic[oa]\b|\bunplugged\b",
    "instrumental": r"\binstrumental\b",
    "karaoke": r"\bkaraoke\b|\btribute\b",
    "sped_up": r"\bsped up\b|\bnightcore\b",
    "slowed": r"\bslowed\b",
    "extended": r"\bextended\b",
    "radio": r"\bradio (?:edit|mix|version)\b",
    "clean": r"\bclean(?: version| edit)?\b",
    "no_rap": r"\bno rap\b",
}

# Excepciones para nombres que contienen comas o "&".
# Solo se usan para construir consultas, no para cambiar metadata.
ARTIST_EXCEPTIONS = [
    "Earth, Wind & Fire",
    "Tyler, The Creator",
    "Crosby, Stills & Nash",
    "Crosby, Stills, Nash & Young",
]

SEARCH_REQUESTS = 0


# ============================================================
# UTILIDADES
# ============================================================

def log(message):
    print(message, flush=True)


def now():
    return datetime.now(timezone.utc).isoformat()


def normalize(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def title_key(value):
    text = str(value or "")
    text = re.sub(
        r"[\(\[]\s*(?:feat\.?|ft\.?|featuring)\s+.*?[\)\]]",
        " ",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\b(?:feat\.?|ft\.?|featuring)\s+.*$",
        " ",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\b(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\b",
        " ",
        text,
        flags=re.I,
    )
    return normalize(text)


def versions(value):
    text = normalize(value)
    return {
        name for name, pattern in VERSION_PATTERNS.items()
        if re.search(pattern, text)
    }


def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def valid_popularity(value):
    return type(value) is int and 0 <= value <= 100


def spotify_id(value):
    text = str(value or "").replace("\\", "").strip()
    match = re.search(
        r"(?:/track/|spotify:track:)([A-Za-z0-9]{22})(?![A-Za-z0-9])",
        text,
    )
    if match:
        return match.group(1)
    return text if re.fullmatch(r"[A-Za-z0-9]{22}", text) else None


def primary_artist(value):
    text = str(value or "").strip()

    for name in sorted(ARTIST_EXCEPTIONS, key=len, reverse=True):
        if text.casefold().startswith(name.casefold()):
            return normalize(name)

    # Separar créditos por coma, punto y coma o feat.
    # No separar "&": puede formar parte del nombre del grupo.
    first = re.split(
        r",|;|\s+(?:feat\.?|ft\.?|featuring)\s+",
        text,
        maxsplit=1,
        flags=re.I,
    )[0]

    return normalize(first)


def shorten_words(text, limit):
    if len(text) <= limit:
        return text

    shortened = text[:limit]
    if " " in shortened:
        shortened = shortened.rsplit(" ", 1)[0]
    return shortened.strip()


def build_queries(row):
    title = title_key(row["title"])
    artist = primary_artist(row["artist"])

    # Reservar espacio para track:"..." artist:"...".
    artist = shorten_words(artist, 90)
    overhead = len('track:"" artist:""')
    title = shorten_words(
        title,
        MAX_QUERY_LENGTH - overhead - len(artist),
    )

    primary = f'track:"{title}" artist:"{artist}"'
    fallback = shorten_words(
        f"{title} {artist}",
        MAX_QUERY_LENGTH,
    )

    if len(primary) > MAX_QUERY_LENGTH:
        raise RuntimeError("No se pudo limitar la consulta.")

    return list(dict.fromkeys([primary, fallback]))


def fingerprint(row):
    # Exactamente el mismo formato que el script anterior.
    values = [
        MATCH_RULES_VERSION,
        row["song_id"],
        row["title"],
        row["artist"],
        row["spotify_url"],
    ]
    return hashlib.sha256(
        json.dumps(values, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def table_exists(conn, name):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone() is not None


def open_existing(path):
    if not path.is_file():
        raise FileNotFoundError(f"No existe: {path}")

    conn = sqlite3.connect(
        path.resolve().as_uri() + "?mode=rw",
        uri=True,
        timeout=30,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def backup(conn, path, stamp):
    destination = BACKUP_DIR / f"{path.stem}_{stamp}.db"
    with sqlite3.connect(destination) as target:
        conn.backup(target)
    log(f"Respaldo: {destination}")


# ============================================================
# AVANCES Y REPORTE
# ============================================================

def prepare_cache():
    cache = sqlite3.connect(CACHE_DB)
    cache.row_factory = sqlite3.Row
    cache.executescript("""
        CREATE TABLE IF NOT EXISTS SearchPages (
            Campaign TEXT NOT NULL,
            Query TEXT NOT NULL,
            OffsetValue INTEGER NOT NULL,
            Payload TEXT NOT NULL,
            SavedAt TEXT NOT NULL,
            PRIMARY KEY (Campaign, Query, OffsetValue)
        );

        CREATE TABLE IF NOT EXISTS Results (
            Campaign TEXT NOT NULL,
            SongID INTEGER NOT NULL,
            Fingerprint TEXT NOT NULL,
            Payload TEXT NOT NULL,
            PRIMARY KEY (Campaign, SongID)
        );

        CREATE TABLE IF NOT EXISTS QueryErrors (
            Campaign TEXT NOT NULL,
            Query TEXT NOT NULL,
            Error TEXT NOT NULL,
            CreatedAt TEXT NOT NULL,
            PRIMARY KEY (Campaign, Query)
        );
    """)
    cache.commit()
    return cache


def completed(cache, row):
    saved = cache.execute("""
        SELECT Fingerprint, Payload
        FROM Results
        WHERE Campaign=? AND SongID=?
    """, (CAMPAIGN, row["song_id"])).fetchone()

    if not saved or saved["Fingerprint"] != fingerprint(row):
        return False

    result = json.loads(saved["Payload"])
    # Los errores individuales se pueden retomar.
    return result.get("status") != "ERROR_SEARCH"


def save_result(cache, row, result):
    with cache:
        cache.execute("""
            INSERT INTO Results (
                Campaign, SongID, Fingerprint, Payload
            )
            VALUES (?, ?, ?, ?)
            ON CONFLICT(Campaign, SongID) DO UPDATE SET
                Fingerprint=excluded.Fingerprint,
                Payload=excluded.Payload
        """, (
            CAMPAIGN,
            row["song_id"],
            fingerprint(row),
            json.dumps(result, ensure_ascii=False),
        ))


def export_report(cache):
    fields = [
        "song_id", "title", "artist",
        "old_dj_popularity", "new_popularity", "difference",
        "status", "selected_title", "selected_artist",
        "selected_album", "source_spotify_url",
        "original_spotify_url", "title_score", "artist_score",
        "candidate_count", "accepted_count", "master_song_id",
        "old_master_popularity", "master_status",
        "checked_at", "error",
    ]

    temporary = REPORT_CSV.with_suffix(".tmp")

    try:
        with temporary.open(
            "w", encoding="utf-8-sig", newline=""
        ) as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()

            for saved in cache.execute("""
                SELECT Payload FROM Results
                WHERE Campaign=? ORDER BY SongID
            """, (CAMPAIGN,)):
                result = json.loads(saved["Payload"])
                writer.writerow({
                    key: result.get(key, "") for key in fields
                })

        temporary.replace(REPORT_CSV)

    except OSError as exc:
        log(
            f"CSV no disponible: {exc}. "
            "La caché conserva los avances. Cierra Excel."
        )


# ============================================================
# SPOTIFY
# ============================================================

class IndividualQueryError(Exception):
    pass


def cached_items(cache, query):
    pages = cache.execute("""
        SELECT Payload FROM SearchPages
        WHERE Campaign=? AND Query=?
        ORDER BY OffsetValue
    """, (CAMPAIGN, query)).fetchall()

    if not pages:
        return None

    found = {}

    for saved in pages:
        page = json.loads(saved["Payload"])

        for item in page.get("items") or []:
            if not isinstance(item, dict) or not item.get("id"):
                continue

            if not valid_popularity(item.get("popularity")):
                raise RuntimeError(
                    "Un candidato no contiene popularity válida. "
                    "Proceso detenido sin sustituirla por cero."
                )

            found[item["id"]] = item

    return found


def fetch_query(sp, cache, query):
    global SEARCH_REQUESTS

    saved = cached_items(cache, query)
    if saved is not None:
        return saved

    if len(query) > MAX_QUERY_LENGTH:
        raise IndividualQueryError(
            "Consulta local superior a 250 caracteres."
        )

    prior_error = cache.execute("""
        SELECT Error FROM QueryErrors
        WHERE Campaign=? AND Query=?
    """, (CAMPAIGN, query)).fetchone()

    if prior_error:
        raise IndividualQueryError(prior_error["Error"])

    for attempt in range(6):
        try:
            SEARCH_REQUESTS += 1

            response = sp.search(
                q=query,
                type="track",
                limit=PAGE_SIZE,
                offset=0,
            )

            page = response.get("tracks")
            if not isinstance(page, dict):
                raise RuntimeError("Respuesta sin objeto tracks.")

            with cache:
                cache.execute("""
                    INSERT OR REPLACE INTO SearchPages (
                        Campaign, Query, OffsetValue,
                        Payload, SavedAt
                    )
                    VALUES (?, ?, 0, ?, ?)
                """, (
                    CAMPAIGN,
                    query,
                    json.dumps(page, ensure_ascii=False),
                    now(),
                ))

            time.sleep(REQUEST_PAUSE)
            return cached_items(cache, query)

        except SpotifyException as exc:
            if exc.http_status == 400:
                message = str(exc)

                with cache:
                    cache.execute("""
                        INSERT OR REPLACE INTO QueryErrors
                        (Campaign, Query, Error, CreatedAt)
                        VALUES (?, ?, ?, ?)
                    """, (CAMPAIGN, query, message, now()))

                raise IndividualQueryError(message) from exc

            if exc.http_status == 429:
                try:
                    delay = float(
                        (exc.headers or {}).get("Retry-After", 30)
                    )
                except (TypeError, ValueError):
                    delay = 30

                if delay > 60:
                    raise RuntimeError(
                        f"Spotify pide esperar {delay:.0f} segundos. "
                        "Avances guardados; retoma después."
                    ) from exc

                log(f"Rate limit: esperando {delay:.0f} segundos.")
                time.sleep(max(1, delay))
                continue

            if (
                exc.http_status
                and exc.http_status >= 500
                and attempt < 5
            ):
                time.sleep(min(2 ** attempt, 30))
                continue

            # Autenticación, permisos u otros fallos generales:
            # detener para no gastar requests en cada canción.
            raise

    raise RuntimeError("Spotify sigue limitando las consultas.")


# ============================================================
# MATCHING
# ============================================================

def match_candidate(row, item):
    title_score = similarity(
        title_key(row["title"]),
        title_key(item.get("name")),
    )

    local_artist = normalize(row["artist"])
    artists = [
        normalize(a.get("name"))
        for a in item.get("artists", [])
        if a.get("name")
    ]

    artist_score = max(
        (
            similarity(local_artist, artist)
            for artist in artists + [" ".join(artists)]
        ),
        default=0.0,
    )

    if artists and (
        local_artist == artists[0]
        or local_artist.startswith(artists[0] + " ")
    ):
        artist_score = 1.0

    accepted = (
        title_score >= TITLE_THRESHOLD
        and artist_score >= ARTIST_THRESHOLD
        and versions(row["title"]) == versions(item.get("name"))
    )

    return accepted, round(title_score, 4), round(artist_score, 4)


def rank(row, items):
    accepted = []

    for item in items.values():
        ok, title_score, artist_score = match_candidate(row, item)
        if ok:
            accepted.append((item, title_score, artist_score))

    accepted.sort(
        key=lambda x: (
            x[0]["popularity"],
            x[1] + x[2],
            x[0]["id"],
        ),
        reverse=True,
    )
    return accepted


def search_best(sp, cache, row):
    # Buscar primero en la caché con los nombres de consulta
    # usados por el script anterior, incluso si eran largos.
    old_title = title_key(row["title"])
    old_artist = normalize(row["artist"])

    old_queries = [
        f'track:"{old_title}" artist:"{old_artist}"',
        f"{old_title} {old_artist}",
    ]

    new_queries = build_queries(row)
    items = {}

    for query in dict.fromkeys(old_queries + new_queries):
        saved = cached_items(cache, query)
        if saved is not None:
            items.update(saved)

    accepted = rank(row, items)
    if accepted:
        log("  Resultados reutilizados desde caché.")
        return items, accepted

    errors = []

    # Solo enviar las nuevas consultas limitadas.
    for query in new_queries:
        try:
            log(f"  Búsqueda: {query}")
            items.update(fetch_query(sp, cache, query))

        except IndividualQueryError as exc:
            errors.append(str(exc))
            continue

        accepted = rank(row, items)
        if accepted:
            return items, accepted

    if errors:
        raise IndividualQueryError(" | ".join(errors))

    return items, []


# ============================================================
# MASTER Y AUDITORÍA
# ============================================================

def prepare_audit(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS PopularityRefreshAudit (
            Campaign TEXT NOT NULL,
            SongID INTEGER NOT NULL,
            OriginalPopularity INTEGER,
            NewPopularity INTEGER NOT NULL,
            SourceSpotifyTrackID TEXT NOT NULL,
            SourceTitle TEXT,
            SourceArtist TEXT,
            UpdatedAt TEXT NOT NULL,
            PRIMARY KEY (Campaign, SongID)
        )
    """)
    conn.commit()


def master_matches(master, row, song_id):
    song = master.execute("""
        SELECT Title, Artist FROM Songs WHERE SongID=?
    """, (song_id,)).fetchone()

    if song is None:
        return False

    local_id = spotify_id(row["spotify_url"])

    if local_id:
        for table in ("SpotifyLinks", "SpotifyTrackAliases"):
            if not table_exists(master, table):
                continue

            # Nombres de tabla constantes definidos arriba.
            links = master.execute(
                f"SELECT SpotifyTrackID, Spotify_URL "
                f"FROM {table} WHERE SongID=?",
                (song_id,),
            ).fetchall()

            for link in links:
                if local_id in (
                    spotify_id(link["SpotifyTrackID"]),
                    spotify_id(link["Spotify_URL"]),
                ):
                    return True

    return (
        normalize(song["Title"]) == normalize(row["title"])
        and normalize(song["Artist"]) == normalize(row["artist"])
    )


def resolve_master(master, row):
    candidates = []

    if table_exists(master, "SongIDMapping"):
        mapping = master.execute("""
            SELECT CanonicalSongID FROM SongIDMapping
            WHERE OldSongID=?
        """, (row["song_id"],)).fetchone()

        if mapping:
            candidates.append(mapping["CanonicalSongID"])

    candidates.append(row["song_id"])

    for candidate in dict.fromkeys(candidates):
        if master_matches(master, row, candidate):
            return candidate

    return None


def original_value(conn, song_id, current):
    saved = conn.execute("""
        SELECT OriginalPopularity FROM PopularityRefreshAudit
        WHERE Campaign=? AND SongID=?
    """, (CAMPAIGN, song_id)).fetchone()

    return saved["OriginalPopularity"] if saved else current


def write_audit(conn, song_id, original, best):
    conn.execute("""
        INSERT INTO PopularityRefreshAudit (
            Campaign, SongID, OriginalPopularity,
            NewPopularity, SourceSpotifyTrackID,
            SourceTitle, SourceArtist, UpdatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(Campaign, SongID) DO UPDATE SET
            NewPopularity=excluded.NewPopularity,
            SourceSpotifyTrackID=excluded.SourceSpotifyTrackID,
            SourceTitle=excluded.SourceTitle,
            SourceArtist=excluded.SourceArtist,
            UpdatedAt=excluded.UpdatedAt
    """, (
        CAMPAIGN,
        song_id,
        original,
        best["popularity"],
        best["id"],
        best.get("name"),
        ", ".join(a.get("name", "") for a in best.get("artists", [])),
        now(),
    ))


def apply_result(dj, master, row, best):
    old_dj = original_value(
        dj, row["song_id"], row["popularity"]
    )

    master_id = resolve_master(master, row)
    old_master = None
    master_status = "SKIPPED_IDENTITY_NOT_CONFIRMED"

    if master_id is not None:
        metadata = master.execute("""
            SELECT Popularity FROM TrackMetadata WHERE SongID=?
        """, (master_id,)).fetchone()

        old_master = original_value(
            master,
            master_id,
            metadata["Popularity"] if metadata else None,
        )

        with master:
            master.execute("""
                INSERT INTO TrackMetadata (SongID, Popularity)
                VALUES (?, ?)
                ON CONFLICT(SongID) DO UPDATE SET
                    Popularity=excluded.Popularity
            """, (master_id, best["popularity"]))

            write_audit(master, master_id, old_master, best)

        master_status = "UPDATED"

    with dj:
        cursor = dj.execute("""
            UPDATE tracks SET popularity=? WHERE song_id=?
        """, (best["popularity"], row["song_id"]))

        if cursor.rowcount != 1:
            raise RuntimeError("No se pudo actualizar el registro DJ.")

        write_audit(dj, row["song_id"], old_dj, best)

    return old_dj, master_id, old_master, master_status


# ============================================================
# PRINCIPAL
# ============================================================

def main():
    for path in (DJ_DB, MASTER_DB, ENV_FILE):
        if not path.is_file():
            raise FileNotFoundError(f"No existe: {path}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    load_dotenv(ENV_FILE)

    dj = master = cache = None

    try:
        dj = open_existing(DJ_DB)
        master = open_existing(MASTER_DB)
        cache = prepare_cache()

        for table in ("Songs", "TrackMetadata", "SpotifyLinks"):
            if not table_exists(master, table):
                raise RuntimeError(f"Falta tabla MASTER: {table}")

        # Seleccionar únicamente el rango autorizado.
        rows = [
            dict(row)
            for row in dj.execute("""
                SELECT song_id, title, artist, popularity, spotify_url
                FROM tracks
                WHERE popularity BETWEEN ? AND ?
                ORDER BY popularity, song_id
            """, (MIN_POPULARITY, MAX_POPULARITY))
        ]

        pending = [row for row in rows if not completed(cache, row)]

        log(f"Campaña: {CAMPAIGN}")
        log(f"Canciones actuales entre 0 y 30: {len(rows):,}")
        log(f"Pendientes: {len(pending):,}")
        log("Se conservan los avances de la ejecución anterior.")

        if not pending:
            return

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        backup(dj, DJ_DB, stamp)
        backup(master, MASTER_DB, stamp)

        prepare_audit(dj)
        prepare_audit(master)

        sp = spotipy.Spotify(
            auth_manager=SpotifyClientCredentials(),
            requests_timeout=30,
            retries=0,
            status_retries=0,
        )

        updated = review = errors = 0

        for index, row in enumerate(pending, 1):
            log(
                f"\n[{index:,}/{len(pending):,}] "
                f"SongID={row['song_id']} | "
                f"{row['artist']} - {row['title']} | "
                f"POP={row['popularity']}"
            )

            result = {
                "song_id": row["song_id"],
                "title": row["title"],
                "artist": row["artist"],
                "old_dj_popularity": row["popularity"],
                "original_spotify_url": row["spotify_url"],
                "checked_at": now(),
            }

            if not title_key(row["title"]) or not normalize(row["artist"]):
                result["status"] = "REVIEW_MISSING_TITLE_OR_ARTIST"
                review += 1
                save_result(cache, row, result)
                continue

            try:
                items, accepted = search_best(sp, cache, row)

            except IndividualQueryError as exc:
                result.update({
                    "status": "ERROR_SEARCH",
                    "error": str(exc),
                })
                save_result(cache, row, result)
                errors += 1
                log("Error individual registrado. Continúa la siguiente.")
                continue

            result["candidate_count"] = len(items)
            result["accepted_count"] = len(accepted)

            if not accepted:
                result["status"] = "REVIEW_NO_COMPATIBLE_CANDIDATE"
                review += 1
                log("Sin coincidencia compatible. Valor conservado.")

            else:
                best, title_score, artist_score = accepted[0]

                old_dj, master_id, old_master, master_status = (
                    apply_result(dj, master, row, best)
                )

                new_value = best["popularity"]

                result.update({
                    "status": "UPDATED",
                    "old_dj_popularity": old_dj,
                    "new_popularity": new_value,
                    "difference": (
                        new_value - old_dj
                        if isinstance(old_dj, (int, float))
                        else ""
                    ),
                    "selected_title": best.get("name"),
                    "selected_artist": ", ".join(
                        a.get("name", "")
                        for a in best.get("artists", [])
                    ),
                    "selected_album": (
                        best.get("album") or {}
                    ).get("name"),
                    "source_spotify_url": (
                        f"https://open.spotify.com/track/{best['id']}"
                    ),
                    "title_score": title_score,
                    "artist_score": artist_score,
                    "master_song_id": master_id,
                    "old_master_popularity": old_master,
                    "master_status": master_status,
                })

                updated += 1
                log(
                    f"Popularity: {old_dj} -> {new_value} | "
                    f"MASTER: {master_status}"
                )

            save_result(cache, row, result)

            if index % 25 == 0:
                export_report(cache)
                log(
                    f"\nActualizadas: {updated:,} | "
                    f"Revisión: {review:,} | Errores: {errors:,} | "
                    f"Requests: {SEARCH_REQUESTS:,}"
                )

        log(
            f"\nFinalizado: {updated:,} actualizadas, "
            f"{review:,} para revisión, {errors:,} con error."
        )

    except KeyboardInterrupt:
        log("\nInterrumpido. Avances conservados.")

    except Exception as exc:
        log(f"\nProceso detenido: {exc}")
        log("No borres la caché. Puedes retomar después de corregirlo.")
        raise

    finally:
        if cache is not None:
            export_report(cache)
            cache.close()

        if dj is not None:
            dj.close()

        if master is not None:
            master.close()

        log(f"\nRequests de búsqueda de esta ejecución: {SEARCH_REQUESTS:,}")
        log(f"Reporte: {REPORT_CSV}")
        log(f"Caché: {CACHE_DB}")


if __name__ == "__main__":
    main()