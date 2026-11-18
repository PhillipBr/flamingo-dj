# -*- coding: utf-8 -*-
"""FG LATIN HOUSE: Spotify (authority) -> Excel + MASTER playlist JSON + React legacy/normalized.
Does not change Spotify, MASTER_CLEAN.db, DJ.db, MP3, catalogs or PENDING.
Requires: pip install requests spotipy python-dotenv openpyxl
"""
import copy
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from spotipy.oauth2 import SpotifyOAuth

DB_ROOT = Path(r'C:\Users\fbrav\OneDrive\Desktop\__DB_FILES')
MASTER = DB_ROOT / '_FLAMINGO - MASTER'
REPO = DB_ROOT / 'FLAMINGOAPP_DJ_REACT'
PLAYLIST_NAME = 'LATIN HOUSE'            # Local React and MASTER name
SPOTIFY_PLAYLIST_ID = '3J0CLJU8zd4xiuL6TkQ1Sn'
SPOTIFY_DISPLAY_NAME = 'FG LATIN HOUSE'  # Excel filename
ROOT = MASTER / 'PLAYLIST_JSON' / PLAYLIST_NAME
SOURCE_JSON = ROOT / f'{PLAYLIST_NAME}.json'
EXCEL = ROOT / f'{SPOTIFY_DISPLAY_NAME}.xlsx'
REPORT = ROOT / f'{SPOTIFY_DISPLAY_NAME}_SYNC_REPORT.json'
LEGACY = REPO / 'src/data/JSON/playlists' / f'{PLAYLIST_NAME}.json'
NORMALIZED = REPO / 'src/data/JSON/normalized/playlists' / f'{PLAYLIST_NAME}.json'
CORE = REPO / 'src/data/JSON/normalized/catalog/tracks-core.json'
EXTRA = REPO / 'src/data/JSON/normalized/catalog/tracks-extra.json'
ENV = MASTER / '.env'
CACHE = MASTER / '.spotify_filter_sync_token_cache'
AUTO_GITHUB_PUSH = True
CONFIRM_BEFORE_APPLY = True
ALLOW_EMPTY_SPOTIFY = False
# A large unexpected reduction is allowed only after explicit confirmation.
MAX_REMOVAL_FRACTION_WITHOUT_EXTRA_CONFIRM = 0.30


def normalize(value):
    s = unicodedata.normalize('NFKD', str(value or '').casefold())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def spotify_id(value):
    s = str(value or '').strip()
    match = re.search(r'(?:spotify:track:|open\.spotify\.com/(?:intl-[^/]+/)?track/)([A-Za-z0-9]{22})', s)
    if match:
        return match.group(1)
    return s if re.fullmatch(r'[A-Za-z0-9]{22}', s) else None


def track_id(track):
    for k in ('SpotifyTrackID', 'spotifyTrackId', 'spotifyId', 'SpotifyURL', 'spotifyUrl', 'spotify_url', 'SpotifyURI', 'spotifyUri'):
        x = spotify_id(track.get(k))
        if x:
            return x
    return None


def song_id(track):
    for k in ('SongID', 'id', 'externalSongId', 'song_id'):
        v = track.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def load(path, required=True):
    if not path.exists():
        if required:
            raise FileNotFoundError(str(path))
        return None
    with path.open(encoding='utf-8-sig') as f:
        result = json.load(f)
    if not isinstance(result, dict):
        raise ValueError(f'JSON root no es objeto: {path}')
    return result


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.sync-tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def yes(prompt):
    return input(prompt + ' [S/N]: ').strip().casefold() in ('s', 'si', 'sí', 'y', 'yes')


def spotify_auth():
    load_dotenv(ENV)
    keys = ('SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI')
    if any(not os.getenv(k) for k in keys):
        raise RuntimeError('Faltan credenciales Spotify en ' + str(ENV))
    oauth = SpotifyOAuth(client_id=os.getenv(keys[0]), client_secret=os.getenv(keys[1]),
                         redirect_uri=os.getenv(keys[2]), scope='playlist-read-private',
                         cache_path=str(CACHE), open_browser=True)
    info = oauth.get_cached_token()
    if not info:
        import webbrowser
        url = oauth.get_authorize_url()
        print('Autoriza Spotify:', url)
        webbrowser.open(url)
        code = oauth.parse_response_code(input('Pega la URL completa del callback: ').strip())
        if not code:
            raise RuntimeError('Callback inválido')
        info = oauth.get_access_token(code=code, as_dict=True, check_cache=False)
    return info['access_token']


def spotify_get(token, endpoint, params=None):
    url = endpoint if endpoint.startswith('https://') else 'https://api.spotify.com/v1/' + endpoint
    for attempt in range(6):
        response = requests.get(url, headers={'Authorization': 'Bearer ' + token},
                                params=params, timeout=35)
        if response.status_code == 200:
            return response.json()
        if response.status_code == 429:
            delay = min(int(response.headers.get('Retry-After', '5')), 120)
            print(f'Rate limit: esperando {delay}s')
            time.sleep(delay + 1)
        elif response.status_code in (500, 502, 503, 504):
            time.sleep(min(2 ** attempt, 20))
        else:
            raise RuntimeError(f'Spotify HTTP {response.status_code}: {response.text[:500]}')
    raise RuntimeError('Spotify no respondió tras reintentos')


def read_spotify(token):
    metadata = spotify_get(token, f'playlists/{SPOTIFY_PLAYLIST_ID}')
    total = (metadata.get('tracks') or {}).get('total')
    if total is None:
        total = (metadata.get('items') or {}).get('total')
    url = f'https://api.spotify.com/v1/playlists/{SPOTIFY_PLAYLIST_ID}/items'
    params = {'limit': 50, 'offset': 0, 'additional_types': 'track'}
    items = []
    skipped = []
    while url:
        data = spotify_get(token, url, params)
        params = None
        for entry in data.get('items') or []:
            t = entry.get('item') or entry.get('track')
            if not t or t.get('type') != 'track' or entry.get('is_local') or not t.get('id'):
                skipped.append(entry)
                continue
            tid = t['id']
            items.append({'Position': len(items) + 1, 'SpotifyTrackID': tid,
                          'SpotifyURI': t.get('uri') or 'spotify:track:' + tid,
                          'SpotifyURL': (t.get('external_urls') or {}).get('spotify') or 'https://open.spotify.com/track/' + tid,
                          'Title': t.get('name') or '',
                          'Artist': ', '.join(a.get('name', '') for a in t.get('artists') or [] if a.get('name')),
                          'PlaylistAddedAt': entry.get('added_at')})
        url = data.get('next')
    # Refuse to overwrite anything if Spotify delivered a partial/unexpected playlist.
    if skipped:
        raise RuntimeError(f'Spotify contiene {len(skipped)} entradas no utilizables. No se aplicaron cambios.')
    if total is not None and total != len(items):
        raise RuntimeError(f'Lectura incompleta Spotify: esperado {total}, recibido {len(items)}')
    if not items and not ALLOW_EMPTY_SPOTIFY:
        raise RuntimeError('Spotify devolvió 0 canciones: actualización bloqueada')
    return metadata, items


def build_index(legacy_tracks, core_tracks, extra_tracks, source_tracks):
    by_song = {}
    by_spotify = {}
    title_artist = {}
    # React playlist first, then full shared catalog. Source is used for identifiers.
    for collection in (legacy_tracks, list(core_tracks.values()), list(extra_tracks.values()), source_tracks):
        for t in collection:
            if not isinstance(t, dict):
                continue
            sid = song_id(t)
            if not sid:
                continue
            by_song.setdefault(sid, {})
            by_song[sid].update({k: v for k, v in t.items() if v is not None})
            tid = track_id(t)
            if tid:
                by_spotify.setdefault(tid, set()).add(sid)
            title = normalize(t.get('title') or t.get('Title'))
            artist = normalize(t.get('artist') or t.get('Artist'))
            if title and artist:
                title_artist.setdefault((title, artist), set()).add(sid)
    return by_song, by_spotify, title_artist


def build_plan(spotify_tracks, legacy_tracks, source_tracks, core_tracks, extra_tracks):
    by_song, by_spotify, title_artist = build_index(legacy_tracks, core_tracks, extra_tracks, source_tracks)
    current_legacy = {song_id(t): t for t in legacy_tracks if isinstance(t, dict) and song_id(t)}
    source_by_id = {}
    for t in source_tracks:
        if isinstance(t, dict) and track_id(t):
            source_by_id.setdefault(track_id(t), t)
    matched = []
    missing = []
    ambiguous = []
    seen = set()
    for sp in spotify_tracks:
        tid = sp['SpotifyTrackID']
        candidates = by_spotify.get(tid, set())
        method = 'SPOTIFY_ID'
        if not candidates:
            candidates = title_artist.get((normalize(sp['Title']), normalize(sp['Artist'])), set())
            method = 'EXACT_TITLE_ARTIST'
        if len(candidates) > 1:
            ambiguous.append({**sp, 'CandidateSongIDs': sorted(candidates)})
            missing.append({**sp, 'Status': 'AMBIGUOUS_MATCH'})
            continue
        if not candidates:
            missing.append({**sp, 'Status': 'NOT_IN_REPERTOIRE'})
            continue
        sid = next(iter(candidates))
        if sid in seen:
            missing.append({**sp, 'Status': 'DUPLICATE_SONGID'})
            continue
        seen.add(sid)
        # Only complete processed tracks may appear in React. A shared catalog
        # entry alone is not evidence of a usable local MP3.
        if sid not in current_legacy:
            missing.append({**sp, 'SongID': sid, 'Status': 'KNOWN_CATALOG_NOT_IN_PROCESSED_PLAYLIST'})
            continue
        matched.append({'spotify': sp, 'sid': sid, 'track': current_legacy[sid], 'method': method})
    removed = [t for t in legacy_tracks if song_id(t) not in {m['sid'] for m in matched}]
    return matched, missing, ambiguous, removed, source_by_id


def make_source_json(original, spotify_tracks, matched, missing, source_by_id, meta):
    mapping = {m['spotify']['SpotifyTrackID']: m['sid'] for m in matched}
    missing_map = {m['SpotifyTrackID']: m['Status'] for m in missing}
    output = copy.deepcopy(original)
    result = []
    for sp in spotify_tracks:
        tid = sp['SpotifyTrackID']
        old = source_by_id.get(tid, {})
        item = copy.deepcopy(old)
        item.update(sp)
        item['SongID'] = mapping.get(tid) or old.get('SongID')
        item['Status'] = 'IN_FLAMINGO' if tid in mapping else missing_map.get(tid, 'NOT_IN_REPERTOIRE')
        result.append(item)
    output.update({'playlistName': PLAYLIST_NAME, 'spotifyPlaylistId': SPOTIFY_PLAYLIST_ID,
                   'spotifyPlaylistName': meta.get('name'), 'spotifySnapshotId': meta.get('snapshot_id'),
                   'totalTracks': len(result), 'tracks': result,
                   'finalCurationSyncedAt': datetime.now().isoformat(timespec='seconds')})
    # Deliberately do not change PENDING files or assert completeness.
    return output


def make_legacy(original, matched, meta):
    result = copy.deepcopy(original)
    result['tracks'] = [m['track'] for m in matched]
    result['totalTracks'] = len(matched)
    result['filteredFromSpotifyAt'] = datetime.now().isoformat(timespec='seconds')
    result['curationSpotifyPlaylistId'] = SPOTIFY_PLAYLIST_ID
    result['curationSpotifyPlaylistName'] = meta.get('name')
    result['curationSpotifySnapshotId'] = meta.get('snapshot_id')
    result['sort'] = {**(result.get('sort') or {}), 'field': 'spotify_playlist_order', 'descending': False}
    return result


def make_normalized(original, matched, meta):
    result = copy.deepcopy(original or {})
    result.setdefault('schemaVersion', 6)
    result['playlistName'] = PLAYLIST_NAME
    result['trackIds'] = [m['sid'] for m in matched]
    result['totalTracks'] = len(matched)
    result['generatedAt'] = datetime.now().isoformat(timespec='seconds')
    result['curationSpotifyPlaylistId'] = SPOTIFY_PLAYLIST_ID
    result['curationSpotifyPlaylistName'] = meta.get('name')
    result['curationSpotifySnapshotId'] = meta.get('snapshot_id')
    return result


def write_excel(path, spotify_tracks, matched, missing):
    # Keep user columns by Spotify ID. Standard columns are refreshed.
    wb = load_workbook(path) if path.exists() else Workbook()
    ws = wb['PLAYLIST'] if 'PLAYLIST' in wb.sheetnames else wb.active
    ws.title = 'PLAYLIST'
    headers = ['Position', 'Title', 'Artist', 'SpotifyTrackID', 'SpotifyURL', 'SongID', 'RepertoireStatus', 'BPM', 'Key', 'Energy', 'Popularity']
    old_headers = [str(c.value or '').strip() for c in ws[1]] if ws.max_row else []
    extra_headers = [h for h in old_headers if h and h not in headers]
    old_by_id = {}
    if 'SpotifyTrackID' in old_headers:
        idx = old_headers.index('SpotifyTrackID')
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and idx < len(row) and row[idx]:
                old_by_id[str(row[idx])] = dict(zip(old_headers, row))
    elif path.exists() and ws.max_row > 1:
        raise RuntimeError('Excel existente sin columna SpotifyTrackID: no se sobrescribe para proteger notas')
    match_by_tid = {m['spotify']['SpotifyTrackID']: m for m in matched}
    missing_by_tid = {m['SpotifyTrackID']: m for m in missing}
    ws.delete_rows(1, ws.max_row)
    ws.append(headers + extra_headers)
    for sp in spotify_tracks:
        tid = sp['SpotifyTrackID']
        m = match_by_tid.get(tid)
        t = m['track'] if m else {}
        extra = old_by_id.get(tid, {})
        status = 'IN_FLAMINGO' if m else missing_by_tid.get(tid, {}).get('Status', 'NOT_IN_REPERTOIRE')
        row = [sp['Position'], sp['Title'], sp['Artist'], tid, sp['SpotifyURL'], m['sid'] if m else '', status,
               t.get('tempo') or t.get('bpm') or t.get('BPM'),
               t.get('musicalKey') or t.get('key') or t.get('Key'),
               t.get('energy') or t.get('Energy'),
               t.get('spotifyPopularity') or t.get('popularity') or t.get('Popularity')]
        ws.append(row + [extra.get(h) for h in extra_headers])
        if not m:
            for cell in ws[ws.max_row]:
                cell.fill = PatternFill('solid', fgColor='FFF0D6')
        ws.cell(ws.max_row, 5).hyperlink = sp['SpotifyURL']
    for c in ws[1]:
        c.fill = PatternFill('solid', fgColor='24334C')
        c.font = Font(color='FFFFFF', bold=True)
    for col, width in {'A': 11, 'B': 42, 'C': 35, 'D': 27, 'E': 55, 'F': 16, 'G': 39, 'H': 12, 'I': 12, 'J': 12, 'K': 14}.items():
        ws.column_dimensions[col].width = width
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = ws.dimensions
    if 'SYNC SUMMARY' in wb.sheetnames:
        del wb['SYNC SUMMARY']
    summary = wb.create_sheet('SYNC SUMMARY')
    for row in [('Spotify Playlist', SPOTIFY_DISPLAY_NAME), ('Spotify Track Count', len(spotify_tracks)),
                ('Flamingo Track Count', len(matched)), ('Spotify Without Processed Audio', len(missing)),
                ('Updated At', datetime.now().isoformat(timespec='seconds'))]:
        summary.append(row)
    summary.column_dimensions['A'].width = 35
    summary.column_dimensions['B'].width = 48
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.stem + '.sync-tmp.xlsx')
    wb.save(temp)
    os.replace(temp, path)


def git(args, check=True):
    p = subprocess.run(['git', *args], cwd=REPO, text=True, capture_output=True)
    if check and p.returncode:
        raise RuntimeError(f'git {" ".join(args)}\n{p.stderr.strip()}')
    return p


def push_github():
    if not AUTO_GITHUB_PUSH:
        return
    print('\nGITHUB SYNC')
    # Avoid accidental inclusion of unrelated staged changes in the commit.
    if git(['diff', '--cached', '--name-only']).stdout.strip():
        print('GITHUB OMITIDO: ya existen cambios staged; haz commit o unstage primero.')
        return
    branch = git(['branch', '--show-current']).stdout.strip()
    if not branch:
        print('GITHUB OMITIDO: HEAD detached')
        return
    upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], check=False)
    if upstream.returncode:
        print('GITHUB OMITIDO: no hay upstream configurado')
        return
    # Fetch before committing to avoid an unnecessary divergent local commit.
    fetched = git(['fetch'], check=False)
    if fetched.returncode:
        print('GITHUB OMITIDO: fetch falló:', fetched.stderr.strip())
        return
    counts = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).stdout.split()
    ahead, behind = map(int, counts)
    if behind:
        print(f'GITHUB OMITIDO: rama local tiene {ahead} commits ahead y {behind} behind. Resuelve el desfase antes del push.')
        return
    paths = [str(LEGACY.relative_to(REPO)), str(NORMALIZED.relative_to(REPO))]
    git(['add', '--', *paths])
    diff = git(['diff', '--cached', '--quiet', '--', *paths], check=False)
    if diff.returncode == 0:
        print('GitHub: sin cambios de playlists para publicar')
        return
    git(['commit', '-m', f'Sync Spotify final curation: {PLAYLIST_NAME}', '--', *paths])
    pushed = git(['push'], check=False)
    if pushed.returncode:
        print('GitHub push falló; cambios guardados localmente:', pushed.stderr.strip())
    else:
        print('GitHub actualizado correctamente.')


def main():
    print('\nFLAMINGO DJ - FG LATIN HOUSE FINAL SYNC')
    print('Spotify es la fuente de verdad. No se modificará Spotify ni PENDING.')
    for p in (ENV, LEGACY, SOURCE_JSON, CORE, EXTRA):
        if not p.exists():
            raise FileNotFoundError(str(p))
    legacy = load(LEGACY)
    source = load(SOURCE_JSON)
    normalized = load(NORMALIZED, required=False)
    core = load(CORE).get('tracks') or {}
    extra = load(EXTRA).get('tracks') or {}
    if not isinstance(core, dict) or not isinstance(extra, dict):
        raise ValueError('Catálogo normalized inválido')
    old_legacy = legacy.get('tracks') or []
    old_source = source.get('tracks') or []
    if not isinstance(old_legacy, list) or not isinstance(old_source, list):
        raise ValueError('JSON de playlist inválido')
    token = spotify_auth()
    meta, spotify_tracks = read_spotify(token)
    matched, missing, ambiguous, removed, source_by_id = build_plan(
        spotify_tracks, old_legacy, old_source, core, extra)
    print(f'Spotify: {len(spotify_tracks)} | Flamingo antes: {len(old_legacy)} | Flamingo después: {len(matched)}')
    print(f'Eliminadas de Flamingo: {len(removed)} | Spotify sin repertorio procesado: {len(missing)} | Ambiguas: {len(ambiguous)}')
    if ambiguous:
        print('ADVERTENCIA: matches ambiguos se dejan fuera de React y aparecen en el reporte.')
    if old_legacy and not matched:
        raise RuntimeError('SAFETY STOP: 0 coincidencias con Flamingo. No se modificaron archivos.')
    if old_legacy and len(removed) / len(old_legacy) > MAX_REMOVAL_FRACTION_WITHOUT_EXTRA_CONFIRM:
        if not yes(f'ATENCIÓN: se quitarían {len(removed)} de {len(old_legacy)} canciones de Flamingo. ¿Continuar?'):
            return
    print('\nAlgunas canciones de Spotify no tendrán MP3; permanecerán en Excel y SOURCE JSON.')
    if CONFIRM_BEFORE_APPLY and not yes('¿Actualizar Excel, MASTER playlist JSON y los 2 JSON React?'):
        print('Sin cambios.')
        return
    # Prepare all data before touching files.
    new_source = make_source_json(source, spotify_tracks, matched, missing, source_by_id, meta)
    new_legacy = make_legacy(legacy, matched, meta)
    new_normalized = make_normalized(normalized, matched, meta)
    report = {'spotifyPlaylistId': SPOTIFY_PLAYLIST_ID, 'spotifyName': meta.get('name'),
              'timestamp': datetime.now().isoformat(timespec='seconds'),
              'spotifyCount': len(spotify_tracks), 'flamingoBefore': len(old_legacy),
              'flamingoAfter': len(matched), 'missing': missing, 'ambiguous': ambiguous,
              'removed': [{'SongID': song_id(t), 'Title': t.get('title'), 'Artist': t.get('artist')} for t in removed]}
    targets = [SOURCE_JSON, LEGACY, NORMALIZED, EXCEL, REPORT]
    backup_dir = ROOT / '_SYNC_BACKUPS' / datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_dir.mkdir(parents=True, exist_ok=True)
    for path in targets:
        if path.exists():
            shutil.copy2(path, backup_dir / (path.name + '.bak'))
    try:
        # Excel may be locked by Windows; write it first so JSONs remain untouched if locked.
        write_excel(EXCEL, spotify_tracks, matched, missing)
        save_json(SOURCE_JSON, new_source)
        save_json(LEGACY, new_legacy)
        save_json(NORMALIZED, new_normalized)
        save_json(REPORT, report)
    except Exception:
        print('ERROR: restaurando archivos desde backup...')
        for path in targets:
            backup = backup_dir / (path.name + '.bak')
            if backup.exists():
                shutil.copy2(backup, path)
            elif path.exists():
                path.unlink()
        raise
    print('\nACTUALIZACIÓN LOCAL COMPLETA')
    for path in targets:
        print('  ', path)
    print('Backups:', backup_dir)
    try:
        push_github()
    except Exception as exc:
        print('GitHub no actualizado; archivos locales conservados:', exc)
    print('\nFIN: PENDING, bases de datos, catálogo y MP3 sin cambios.')


if __name__ == '__main__':
    main()
