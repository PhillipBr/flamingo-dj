# -*- coding: utf-8 -*-
"""
IMPORT_DEEMIX_TO_FLAMINGO_LIBRARY.py
============================================================

FLAMINGO DJ - MASS AUDIO LIBRARY IMPORT

SOURCE:
C:\\Users\\fbrav\\Music\\deemix Music

MASTER:
C:\\Users\\fbrav\\OneDrive\\Desktop\\__DB_FILES\\
_FLAMINGO - MASTER\\MASTER_CLEAN.db

DESTINATION:
C:\\Users\\fbrav\\Music\\FLAMINGO_LIBRARY

============================================================

WHAT IT DOES

1. Finds ALL audio files recursively inside deemix Music.

2. Reads filename.

Typical expected Deemix filename:

    Adele - Rolling in the Deep.mp3

Interprets:

    Artist = Adele
    Title  = Rolling in the Deep

3. Matches against:

    MASTER_CLEAN.db
    Songs.Title
    Songs.Artist

4. If found:

    SongID = 109234

5. Creates filename:

    109234__Rolling in the Deep__Adele.mp3

6. Stores it inside central Flamingo library.

7. Shows progress:

    [1/23940] Adele - Rolling in the Deep.mp3

8. Avoids importing the same SongID twice.

9. Creates reports for:
    - matched
    - unmatched
    - ambiguous
    - duplicates

============================================================
"""

import csv
import os
import re
import shutil
import sqlite3
import unicodedata

from pathlib import Path
from typing import Optional, Dict, List, Tuple


# ============================================================
# CONFIG
# ============================================================

SOURCE_LIBRARY_DIR = Path(
    r"C:\Users\fbrav\Music\deemix Music"
)

FLAMINGO_LIBRARY_DIR = Path(
    r"C:\Users\fbrav\Music\FLAMINGO_LIBRARY"
)

MASTER_DB_PATH = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
    r"\_FLAMINGO - MASTER\MASTER_CLEAN.db"
)

REPORT_DIR = Path(
    r"C:\Users\fbrav\OneDrive\Desktop\__DB_FILES"
    r"\_FLAMINGO - MASTER\LIBRARY_IMPORT_REPORTS"
)


# ============================================================
# FILE ACTION
# ============================================================
#
# FIRST RUN RECOMMENDATION:
#
# COPY_FILES = True
# MOVE_FILES = False
#
# After validating everything:
#
# COPY_FILES = False
# MOVE_FILES = True
#
# ============================================================

COPY_FILES = True

MOVE_FILES = False


# ============================================================
# LIBRARY STRUCTURE
# ============================================================
#
# False:
#
# FLAMINGO_LIBRARY\
#     109234__Rolling in the Deep__Adele.mp3
#
# True:
#
# FLAMINGO_LIBRARY\
#     109000-109999\
#         109234__Rolling in the Deep__Adele.mp3
#
# For 20k+ songs I recommend True.
#
# ============================================================

USE_SONGID_BUCKETS = True

BUCKET_SIZE = 1000


# ============================================================
# MATCHING
# ============================================================

# Exact normalized Artist + Title first.
#
# Afterwards it performs controlled normalization
# for common filename differences.

ALLOW_LOOSE_MATCH = True

# If title is unique in MASTER, allow match even
# when artist string differs.
#
# Recommended False for first mass migration.
ALLOW_UNIQUE_TITLE_MATCH = False


# ============================================================
# AUDIO EXTENSIONS
# ============================================================

AUDIO_EXTENSIONS = {
    ".mp3",
    ".flac",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".aiff",
    ".aif",
}


# ============================================================
# LOG
# ============================================================

def log(message: str):
    print(
        message,
        flush=True
    )


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_unicode(
    value
) -> str:

    if value is None:
        return ""

    text = str(
        value
    ).strip()

    text = unicodedata.normalize(
        "NFKD",
        text
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character
        )
    )

    return text


def normalize_text(
    value
) -> str:

    text = normalize_unicode(
        value
    ).lower()

    text = text.replace(
        "’",
        "'"
    )

    text = text.replace(
        "–",
        "-"
    )

    text = text.replace(
        "—",
        "-"
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def normalize_title(
    value
) -> str:

    text = normalize_text(
        value
    )

    # Preserve meaningful version information.
    text = re.sub(
        r"[^\w\s#&'+\-()]",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def normalize_artist(
    value
) -> str:

    text = normalize_text(
        value
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# ============================================================
# LOOSE NORMALIZATION
# ============================================================

def loose_title(
    value
) -> str:

    text = normalize_text(
        value
    )

    # Remove feat sections.
    text = re.sub(
        r"\s*[\(\[]"
        r"(feat|ft|featuring)\.?"
        r".*?[\)\]]",
        " ",
        text,
        flags=re.IGNORECASE
    )

    # Common differences created by downloads / filenames.
    text = text.replace(
        "-",
        " "
    )

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def loose_artist(
    value
) -> str:

    text = normalize_text(
        value
    )

    # Remove feat at end.
    text = re.sub(
        r"\b(feat|ft|featuring)\b.*$",
        " ",
        text
    )

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# ============================================================
# WINDOWS FILE NAME
# ============================================================

def sanitize_filename_component(
    value
) -> str:

    if value is None:
        return "Unknown"

    text = str(
        value
    ).strip()

    # Windows invalid filename characters.
    text = re.sub(
        r'[<>:"/\\|?*]',
        "_",
        text
    )

    # Remove control characters.
    text = "".join(
        character
        for character in text
        if ord(
            character
        ) >= 32
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    text = text.strip(
        " ."
    )

    if not text:
        return "Unknown"

    # Protect against huge Windows paths.
    return text[:120]


# ============================================================
# DEEMIX FILENAME PARSING
# ============================================================

def parse_deemix_filename(
    file_path: Path
) -> Tuple[
    Optional[str],
    Optional[str]
]:

    """
    Expected format:

        Artist - Title.mp3

    Examples:

        Adele - Rolling in the Deep.mp3

        Highly Suspect - Serotonia.mp3

        Ricky Martin - Fuego De Noche, Nieve De Día.mp3

    Returns:

        artist, title
    """

    stem = (
        file_path.stem
        .strip()
    )

    # --------------------------------------------------------
    # Remove an existing Flamingo SongID prefix if present.
    #
    # 109234__Title__Artist
    # --------------------------------------------------------

    flamingo_match = re.match(
        r"^\d+__(.+?)__(.+)$",
        stem
    )

    if flamingo_match:

        title = (
            flamingo_match
            .group(1)
            .strip()
        )

        artist = (
            flamingo_match
            .group(2)
            .strip()
        )

        return (
            artist,
            title
        )

    # --------------------------------------------------------
    # Standard Deemix:
    # Artist - Title
    # --------------------------------------------------------

    if " - " in stem:

        artist, title = (
            stem.split(
                " - ",
                1
            )
        )

        artist = (
            artist.strip()
        )

        title = (
            title.strip()
        )

        if artist and title:

            return (
                artist,
                title
            )

    return (
        None,
        None
    )


# ============================================================
# DATABASE
# ============================================================

def get_connection():

    if not MASTER_DB_PATH.exists():

        raise FileNotFoundError(
            "No encontré MASTER_CLEAN.db:\n"
            f"{MASTER_DB_PATH}"
        )

    conn = sqlite3.connect(
        MASTER_DB_PATH
    )

    conn.row_factory = (
        sqlite3.Row
    )

    return conn


# ============================================================
# LOAD MASTER
# ============================================================

def load_master_catalog(
    conn
) -> List[Dict]:

    print()
    print(
        "=" * 72
    )

    print(
        "LOADING MASTER_CLEAN.db"
    )

    print(
        "=" * 72
    )

    rows = conn.execute(
        """
        SELECT
            SongID,
            Title,
            Artist
        FROM Songs
        WHERE
            Title IS NOT NULL
            AND Artist IS NOT NULL
        """
    ).fetchall()

    catalog = []

    total = len(
        rows
    )

    for index, row in enumerate(
        rows,
        start=1
    ):

        if (
            index % 50000 == 0
            or index == total
        ):

            log(
                f"MASTER loading: "
                f"{index}/{total}"
            )

        song_id = (
            row["SongID"]
        )

        title = (
            row["Title"]
        )

        artist = (
            row["Artist"]
        )

        catalog.append(
            {
                "SongID":
                    song_id,

                "Title":
                    title,

                "Artist":
                    artist,

                "_title":
                    normalize_title(
                        title
                    ),

                "_artist":
                    normalize_artist(
                        artist
                    ),

                "_loose_title":
                    loose_title(
                        title
                    ),

                "_loose_artist":
                    loose_artist(
                        artist
                    ),
            }
        )

    print()

    log(
        f"MASTER songs loaded: "
        f"{len(catalog)}"
    )

    return catalog


# ============================================================
# MASTER INDEXES
# ============================================================

def build_master_indexes(
    catalog: List[Dict]
) -> Dict:

    print()

    log(
        "Building MASTER indexes..."
    )

    exact = {}

    loose = {}

    title_only = {}

    for track in catalog:

        # ----------------------------------------------------
        # EXACT
        # ----------------------------------------------------

        exact_key = (
            track["_title"],
            track["_artist"]
        )

        exact.setdefault(
            exact_key,
            []
        ).append(
            track
        )

        # ----------------------------------------------------
        # LOOSE
        # ----------------------------------------------------

        loose_key = (
            track["_loose_title"],
            track["_loose_artist"]
        )

        loose.setdefault(
            loose_key,
            []
        ).append(
            track
        )

        # ----------------------------------------------------
        # TITLE
        # ----------------------------------------------------

        title_only.setdefault(
            track["_title"],
            []
        ).append(
            track
        )

    log(
        "MASTER indexes ready."
    )

    return {
        "exact":
            exact,

        "loose":
            loose,

        "title":
            title_only,
    }


# ============================================================
# MATCH MASTER
# ============================================================

def find_master_match(
    artist: str,
    title: str,
    indexes: Dict
) -> Tuple[
    Optional[Dict],
    str
]:

    # ========================================================
    # 1. EXACT NORMALIZED TITLE + ARTIST
    # ========================================================

    exact_key = (
        normalize_title(
            title
        ),
        normalize_artist(
            artist
        )
    )

    matches = (
        indexes[
            "exact"
        ]
        .get(
            exact_key,
            []
        )
    )

    if len(
        matches
    ) == 1:

        return (
            matches[0],
            "EXACT"
        )

    if len(
        matches
    ) > 1:

        return (
            None,
            "AMBIGUOUS_EXACT"
        )

    # ========================================================
    # 2. LOOSE TITLE + ARTIST
    # ========================================================

    if ALLOW_LOOSE_MATCH:

        loose_key = (
            loose_title(
                title
            ),
            loose_artist(
                artist
            )
        )

        matches = (
            indexes[
                "loose"
            ]
            .get(
                loose_key,
                []
            )
        )

        if len(
            matches
        ) == 1:

            return (
                matches[0],
                "LOOSE"
            )

        if len(
            matches
        ) > 1:

            return (
                None,
                "AMBIGUOUS_LOOSE"
            )

    # ========================================================
    # 3. UNIQUE TITLE
    # ========================================================

    if ALLOW_UNIQUE_TITLE_MATCH:

        matches = (
            indexes[
                "title"
            ]
            .get(
                normalize_title(
                    title
                ),
                []
            )
        )

        if len(
            matches
        ) == 1:

            return (
                matches[0],
                "UNIQUE_TITLE"
            )

    return (
        None,
        "NO_MATCH"
    )


# ============================================================
# FIND AUDIO
# ============================================================

def find_all_audio_files() -> List[Path]:

    if not SOURCE_LIBRARY_DIR.exists():

        raise FileNotFoundError(
            "No existe source library:\n"
            f"{SOURCE_LIBRARY_DIR}"
        )

    print()
    print(
        "=" * 72
    )

    print(
        "SCANNING DEEMIX MUSIC"
    )

    print(
        "=" * 72
    )

    audio_files = []

    scanned = 0

    for root, dirs, files in os.walk(
        SOURCE_LIBRARY_DIR
    ):

        for filename in files:

            scanned += 1

            path = (
                Path(root)
                / filename
            )

            if (
                path.suffix.lower()
                in AUDIO_EXTENSIONS
            ):

                audio_files.append(
                    path
                )

        if (
            scanned > 0
            and scanned % 5000 == 0
        ):

            log(
                f"Files scanned: {scanned} | "
                f"Audio found: {len(audio_files)}"
            )

    audio_files.sort(
        key=lambda path:
            str(path).lower()
    )

    print()

    log(
        f"Total audio files found: "
        f"{len(audio_files)}"
    )

    return audio_files


# ============================================================
# LIBRARY DESTINATION
# ============================================================

def get_song_bucket(
    song_id
) -> str:

    try:

        song_id_int = int(
            song_id
        )

        start = (
            song_id_int
            // BUCKET_SIZE
            * BUCKET_SIZE
        )

        end = (
            start
            + BUCKET_SIZE
            - 1
        )

        return (
            f"{start}-{end}"
        )

    except Exception:

        return "OTHER"


def build_destination_path(
    master_track: Dict,
    source_file: Path
) -> Path:

    song_id = (
        master_track[
            "SongID"
        ]
    )

    title = (
        sanitize_filename_component(
            master_track[
                "Title"
            ]
        )
    )

    artist = (
        sanitize_filename_component(
            master_track[
                "Artist"
            ]
        )
    )

    # Requested format:
    #
    # SONGID_TITLE_ARTIST
    #
    # Double underscore makes each component clearer.
    filename = (
        f"{song_id}"
        f"__{title}"
        f"__{artist}"
        f"{source_file.suffix.lower()}"
    )

    if USE_SONGID_BUCKETS:

        folder = (
            FLAMINGO_LIBRARY_DIR
            / get_song_bucket(
                song_id
            )
        )

    else:

        folder = (
            FLAMINGO_LIBRARY_DIR
        )

    return (
        folder
        / filename
    )


# ============================================================
# EXISTING SONGID IN LIBRARY
# ============================================================

def find_existing_songid_file(
    song_id
) -> Optional[Path]:

    if not FLAMINGO_LIBRARY_DIR.exists():

        return None

    prefix = (
        f"{song_id}__"
    )

    if USE_SONGID_BUCKETS:

        folder = (
            FLAMINGO_LIBRARY_DIR
            / get_song_bucket(
                song_id
            )
        )

        if not folder.exists():

            return None

        for file_path in folder.iterdir():

            if (
                file_path.is_file()
                and file_path.name.startswith(
                    prefix
                )
            ):

                return file_path

        return None

    for file_path in (
        FLAMINGO_LIBRARY_DIR
        .glob(
            f"{song_id}__*"
        )
    ):

        if file_path.is_file():

            return file_path

    return None


# ============================================================
# IMPORT FILE
# ============================================================

def import_file(
    source_file: Path,
    master_track: Dict
) -> Tuple[
    str,
    Optional[Path]
]:

    song_id = (
        master_track[
            "SongID"
        ]
    )

    # --------------------------------------------------------
    # Song already physically imported.
    # --------------------------------------------------------

    existing = (
        find_existing_songid_file(
            song_id
        )
    )

    if existing:

        return (
            "ALREADY_EXISTS",
            existing
        )

    destination = (
        build_destination_path(
            master_track,
            source_file
        )
    )

    destination.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Same destination already exists.
    # --------------------------------------------------------

    if destination.exists():

        return (
            "ALREADY_EXISTS",
            destination
        )

    # --------------------------------------------------------
    # COPY
    # --------------------------------------------------------

    if COPY_FILES:

        shutil.copy2(
            source_file,
            destination
        )

        return (
            "COPIED",
            destination
        )

    # --------------------------------------------------------
    # MOVE
    # --------------------------------------------------------

    if MOVE_FILES:

        shutil.move(
            str(
                source_file
            ),
            str(
                destination
            )
        )

        return (
            "MOVED",
            destination
        )

    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    return (
        "DRY_RUN",
        destination
    )


# ============================================================
# REPORT
# ============================================================

def save_csv_report(
    filename: str,
    rows: List[Dict]
):

    REPORT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    path = (
        REPORT_DIR
        / filename
    )

    if not rows:

        # Still create the report.
        with open(
            path,
            "w",
            encoding="utf-8-sig",
            newline=""
        ) as file:

            file.write(
                ""
            )

        return

    columns = []

    for row in rows:

        for key in row.keys():

            if key not in columns:

                columns.append(
                    key
                )

    with open(
        path,
        "w",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=columns
        )

        writer.writeheader()

        writer.writerows(
            rows
        )


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print(
        "=" * 72
    )

    print(
        "FLAMINGO DJ"
    )

    print(
        "DEEMIX MUSIC -> MASTER MATCH -> FLAMINGO LIBRARY"
    )

    print(
        "=" * 72
    )

    print()

    print(
        f"SOURCE:"
    )

    print(
        f"  {SOURCE_LIBRARY_DIR}"
    )

    print()

    print(
        f"MASTER:"
    )

    print(
        f"  {MASTER_DB_PATH}"
    )

    print()

    print(
        f"DESTINATION:"
    )

    print(
        f"  {FLAMINGO_LIBRARY_DIR}"
    )

    print()

    if COPY_FILES:

        print(
            "FILE MODE: COPY"
        )

    elif MOVE_FILES:

        print(
            "FILE MODE: MOVE"
        )

    else:

        print(
            "FILE MODE: DRY RUN"
        )

    # ========================================================
    # MASTER
    # ========================================================

    conn = (
        get_connection()
    )

    try:

        catalog = (
            load_master_catalog(
                conn
            )
        )

    finally:

        conn.close()

    indexes = (
        build_master_indexes(
            catalog
        )
    )

    # ========================================================
    # FILES
    # ========================================================

    audio_files = (
        find_all_audio_files()
    )

    total_files = len(
        audio_files
    )

    if total_files == 0:

        print(
            "No audio files found."
        )

        return

    # ========================================================
    # OUTPUT STRUCTURES
    # ========================================================

    matched_report = []

    unmatched_report = []

    ambiguous_report = []

    parse_error_report = []

    duplicate_report = []

    counters = {

        "exact":
            0,

        "loose":
            0,

        "unique_title":
            0,

        "copied":
            0,

        "moved":
            0,

        "already_exists":
            0,

        "unmatched":
            0,

        "ambiguous":
            0,

        "parse_error":
            0,

    }

    # ========================================================
    # PROCESS
    # ========================================================

    for index, file_path in enumerate(
        audio_files,
        start=1
    ):

        print()

        print(
            "-" * 72
        )

        print(
            f"[{index}/{total_files}] "
            f"{file_path.name}"
        )

        # ====================================================
        # PARSE FILE NAME
        # ====================================================

        artist, title = (
            parse_deemix_filename(
                file_path
            )
        )

        if not artist or not title:

            print(
                "          PARSE ERROR "
                "| Expected: Artist - Title"
            )

            counters[
                "parse_error"
            ] += 1

            parse_error_report.append(
                {
                    "File":
                        str(
                            file_path
                        ),

                    "FileName":
                        file_path.name,
                }
            )

            continue

        print(
            f"          Artist : {artist}"
        )

        print(
            f"          Title  : {title}"
        )

        # ====================================================
        # MASTER MATCH
        # ====================================================

        master_track, match_type = (
            find_master_match(
                artist,
                title,
                indexes
            )
        )

        # ====================================================
        # NO MATCH
        # ====================================================

        if (
            match_type
            == "NO_MATCH"
        ):

            print(
                "          NO MATCH"
            )

            counters[
                "unmatched"
            ] += 1

            unmatched_report.append(
                {
                    "File":
                        str(
                            file_path
                        ),

                    "ArtistParsed":
                        artist,

                    "TitleParsed":
                        title,
                }
            )

            continue

        # ====================================================
        # AMBIGUOUS
        # ====================================================

        if match_type.startswith(
            "AMBIGUOUS"
        ):

            print(
                f"          {match_type}"
            )

            counters[
                "ambiguous"
            ] += 1

            ambiguous_report.append(
                {
                    "File":
                        str(
                            file_path
                        ),

                    "ArtistParsed":
                        artist,

                    "TitleParsed":
                        title,

                    "MatchType":
                        match_type,
                }
            )

            continue

        # ====================================================
        # MATCH
        # ====================================================

        song_id = (
            master_track[
                "SongID"
            ]
        )

        print(
            f"          MATCH  : {match_type}"
        )

        print(
            f"          SongID : {song_id}"
        )

        print(
            f"          MASTER : "
            f"{master_track['Artist']} - "
            f"{master_track['Title']}"
        )

        if match_type == "EXACT":

            counters[
                "exact"
            ] += 1

        elif match_type == "LOOSE":

            counters[
                "loose"
            ] += 1

        elif match_type == "UNIQUE_TITLE":

            counters[
                "unique_title"
            ] += 1

        # ====================================================
        # IMPORT
        # ====================================================

        try:

            status, destination = (
                import_file(
                    file_path,
                    master_track
                )
            )

        except Exception as exc:

            print(
                f"          FILE ERROR: "
                f"{exc}"
            )

            continue

        print(
            f"          {status}"
        )

        if destination:

            print(
                f"          → {destination}"
            )

        if status == "COPIED":

            counters[
                "copied"
            ] += 1

        elif status == "MOVED":

            counters[
                "moved"
            ] += 1

        elif status == "ALREADY_EXISTS":

            counters[
                "already_exists"
            ] += 1

            duplicate_report.append(
                {
                    "SongID":
                        song_id,

                    "Source":
                        str(
                            file_path
                        ),

                    "Existing":
                        (
                            str(
                                destination
                            )
                            if destination
                            else None
                        )
                }
            )

        matched_report.append(
            {
                "SongID":
                    song_id,

                "MatchType":
                    match_type,

                "MasterTitle":
                    master_track[
                        "Title"
                    ],

                "MasterArtist":
                    master_track[
                        "Artist"
                    ],

                "OriginalFile":
                    str(
                        file_path
                    ),

                "LibraryFile":
                    (
                        str(
                            destination
                        )
                        if destination
                        else None
                    ),

                "Status":
                    status,
            }
        )

    # ========================================================
    # REPORTS
    # ========================================================

    save_csv_report(
        "MATCHED.csv",
        matched_report
    )

    save_csv_report(
        "UNMATCHED.csv",
        unmatched_report
    )

    save_csv_report(
        "AMBIGUOUS.csv",
        ambiguous_report
    )

    save_csv_report(
        "PARSE_ERRORS.csv",
        parse_error_report
    )

    save_csv_report(
        "DUPLICATES.csv",
        duplicate_report
    )

    # ========================================================
    # SUMMARY
    # ========================================================

    print()
    print(
        "=" * 72
    )

    print(
        "RESULTADO FINAL"
    )

    print(
        "=" * 72
    )

    print(
        f"Audio files processed : "
        f"{total_files}"
    )

    print()

    print(
        f"Exact matches         : "
        f"{counters['exact']}"
    )

    print(
        f"Loose matches         : "
        f"{counters['loose']}"
    )

    print(
        f"Unique-title matches  : "
        f"{counters['unique_title']}"
    )

    print()

    print(
        f"Copied                : "
        f"{counters['copied']}"
    )

    print(
        f"Moved                 : "
        f"{counters['moved']}"
    )

    print(
        f"Already in library    : "
        f"{counters['already_exists']}"
    )

    print()

    print(
        f"Unmatched             : "
        f"{counters['unmatched']}"
    )

    print(
        f"Ambiguous             : "
        f"{counters['ambiguous']}"
    )

    print(
        f"Filename parse errors : "
        f"{counters['parse_error']}"
    )

    print()

    print(
        "FLAMINGO LIBRARY:"
    )

    print(
        FLAMINGO_LIBRARY_DIR
    )

    print()

    print(
        "REPORTS:"
    )

    print(
        REPORT_DIR
    )

    print()

    print(
        "=" * 72
    )

    print(
        "FIN"
    )

    print(
        "=" * 72
    )


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    main()