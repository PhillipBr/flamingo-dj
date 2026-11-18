#!/usr/bin/env python3
"""Flamingo DJ: crear o reemplazar una playlist Spotify desde JSON locales.
Dependencias: pip install spotipy python-dotenv
Lee automáticamente SPOTIFY_CLIENT_ID / VITE_SPOTIFY_CLIENT_ID y REDIRECT_URI desde .env.
"""
import json
import math
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

BANDS = ((40, 50), (51, 70), (71, 89), (90, 100))
WEIGHTS = (20, 55, 20, 5)
MIN_ENERGY = 4.0


def root_folder():
    script = Path(__file__).resolve()
    for folder in (script.parent, *script.parents):
        if (folder / 'src' / 'data').is_dir():
            return folder
    raise FileNotFoundError('No encontré la raíz de FLAMINGOAPP_DJ_REACT (src/data).')


def read_json(path):
    with path.open(encoding='utf-8-sig') as file:
        return json.load(file)


def catalog_file(root, filename):
    paths = list((root / 'src' / 'data').rglob(filename))
    paths.sort(key=lambda p: (0 if 'normalized' in p.parts else 1, len(p.parts)))
    if not paths:
        raise FileNotFoundError(f'Falta {filename} en src/data')
    return paths[0]


def playlists_available(root):
    paths = (root / 'src' / 'data').rglob('*.json')
    selected = {}
    for path in paths:
        if 'playlists' not in [x.lower() for x in path.parts]:
            continue
        if any(x in path.stem for x in ('__FILTERED_', '__OUT_OF_RANGE', '__UNKNOWN_DATE')):
            continue
        key = path.stem.casefold()
        rank = (0 if 'normalized' in path.parts else 1, len(path.parts))
        if key not in selected or rank < selected[key][0]:
            selected[key] = (rank, path)
    return sorted((x[1] for x in selected.values()), key=lambda p: p.stem.casefold())


def ask_years():
    while True:
        value = input(f'\nAño mínimo-máximo [2020-{datetime.now().year}]: ').strip()
        if not value:
            return 2020, datetime.now().year
        m = re.fullmatch(r'(\d{4})\s*-\s*(\d{4})', value)
        if m and 1900 <= int(m[1]) <= int(m[2]) <= datetime.now().year + 1:
            return int(m[1]), int(m[2])
        print('Formato incorrecto. Ejemplo: 2010-2026')


def ask_sources(options):
    print('\nPLAYLISTS DISPONIBLES:')
    for i, path in enumerate(options, 1):
        print(f'  {i:>2}. {path.stem}')
    while True:
        raw = input('\nSelecciona varias por número, separadas por comas: ').strip()
        parts = [x.strip() for x in raw.split(',') if x.strip()]
        if parts and all(x.isdigit() and 1 <= int(x) <= len(options) for x in parts):
            return list(dict.fromkeys(options[int(x) - 1] for x in parts))
        print('Selecciona los números de la lista. Ejemplo: 3,5,7')


def ask_count():
    while True:
        raw = input('\n¿Cuántas canciones quieres? [70]: ').strip()
        if not raw:
            return 70
        if raw.isdigit() and 1 <= int(raw) <= 10000:
            return int(raw)
        print('Ingresa un número entre 1 y 10000.')


def spotify_track_id(track):
    value = str(track.get('spotifyTrackId') or '').strip()
    if re.fullmatch(r'[A-Za-z0-9]{22}', value):
        return value
    value = str(track.get('spotifyUrl') or '')
    match = re.search(r'(?:open\.spotify\.com/track/|spotify:track:)([A-Za-z0-9]{22})', value)
    return match.group(1) if match else None


def allocate(total, weights):
    raw = [total * weight / sum(weights) for weight in weights]
    counts = [math.floor(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda j: raw[j] - counts[j], reverse=True)[:total - sum(counts)]:
        counts[i] += 1
    return counts


def reorder(tracks, rng):
    pending = tracks[:]
    ordered = []
    while pending:
        last_artist = ordered[-1]['artist'].split(',')[0].strip().casefold() if ordered else ''
        recent_hit = any(x['popularity'] >= 90 for x in ordered[-2:])
        options = [x for x in pending if
                   (not recent_hit or x['popularity'] < 90) and
                   x['artist'].split(',')[0].strip().casefold() != last_artist]
        if not options:
            options = [x for x in pending if not recent_hit or x['popularity'] < 90] or pending
        item = rng.choice(options)
        pending.remove(item)
        ordered.append(item)
    return ordered


def build_selection(root, sources, start_year, end_year, count):
    core = read_json(catalog_file(root, 'tracks-core.json'))['tracks']
    extra = read_json(catalog_file(root, 'tracks-extra.json'))['tracks']
    candidates = {}
    exclusions = Counter()
    for source in sources:
        data = read_json(source)
        entries = data.get('tracks', [])
        if not entries and data.get('trackIds'):
            entries = [{'id': str(x)} for x in data['trackIds']]
        for entry in entries:
            key = str(entry.get('id') or entry.get('externalSongId') or '')
            merged = {**entry, **core.get(key, {}), **extra.get(key, {})}
            sid = spotify_track_id(merged)
            if not sid:
                exclusions['Sin Spotify ID'] += 1
                continue
            try:
                year = int(str(merged.get('releaseDate') or '')[:4])
                pop = int(float(merged.get('spotifyPopularity')))
                energy = float(merged.get('energy'))
                duration = int(float(merged.get('durationSeconds') or 0))
            except (ValueError, TypeError):
                exclusions['Datos incompletos'] += 1
                continue
            if not start_year <= year <= end_year:
                exclusions['Fuera de años'] += 1
                continue
            if not math.isfinite(energy) or energy < MIN_ENERGY:
                exclusions['ENERGY inferior a 4'] += 1
                continue
            band = next((i for i, (lo, hi) in enumerate(BANDS) if lo <= pop <= hi), None)
            if band is None:
                exclusions['Fuera de popularidad 40-100'] += 1
                continue
            if duration <= 0:
                exclusions['Sin duración'] += 1
                continue
            if sid in candidates:
                exclusions['Duplicados'] += 1
                continue
            candidates[sid] = {
                'spotifyId': sid, 'title': merged.get('title', ''),
                'artist': merged.get('artist', ''), 'year': year,
                'popularity': pop, 'energy': energy,
                'durationSeconds': duration, 'band': band,
            }
    if not candidates:
        raise ValueError('No hay canciones elegibles; no se modificará Spotify.')
    rng = random.SystemRandom()  # selección nueva en cada ejecución
    pools = defaultdict(list)
    for track in candidates.values():
        pools[track['band']].append(track)
    for pool in pools.values():
        rng.shuffle(pool)
    target = min(count, len(candidates))
    quotas = allocate(target, WEIGHTS)
    selected = []
    for band, quota in enumerate(quotas):
        selected.extend(pools[band][:quota])
    # Si falta un rango, redistribuir sin sobrecargar primero los hits 90-100.
    remaining = target - len(selected)
    seen = {x['spotifyId'] for x in selected}
    for band in (1, 0, 2, 3):
        if remaining <= 0:
            break
        additions = [x for x in pools[band] if x['spotifyId'] not in seen][:remaining]
        selected.extend(additions)
        seen.update(x['spotifyId'] for x in additions)
        remaining -= len(additions)
    selected = reorder(selected, rng)
    return selected, exclusions, len(candidates)


def load_spotify_settings(root):
    """Usa python-dotenv como MIXNKEY_TO_REACT_JSON.py y localiza el .env real."""
    try:
        from dotenv import load_dotenv
    except ImportError as exc:
        raise RuntimeError('Falta python-dotenv: pip install python-dotenv') from exc

    # El script de MixNKey usa credenciales SPOTIFY_* de un .env externo.
    # Buscar primero en la carpeta compartida __DB_FILES y _FLAMINGO - MASTER,
    # además del proyecto React, sin depender del directorio desde donde se ejecuta.
    db_root = root.parent
    folders = [
        db_root / '_FLAMINGO - MASTER',
        db_root,
        root,
        root / 'python',
        Path(__file__).resolve().parent,
    ]
    found = []
    for folder in folders:
        for filename in ('.env', '.env.local'):
            path = folder / filename
            if path.is_file() and path not in found:
                found.append(path)

    for path in found:
        load_dotenv(dotenv_path=path, override=False)

    if not found:
        raise FileNotFoundError(
            'No se encontró ningún .env en: ' + ', '.join(str(p) for p in folders)
        )
    return found


def spotify_connection(root):
    try:
        import spotipy
        from spotipy.oauth2 import SpotifyOAuth, SpotifyPKCE
    except ImportError as error:
        raise RuntimeError('Instala Spotipy: pip install spotipy') from error

    env_files = load_spotify_settings(root)
    client_id = (os.getenv('SPOTIFY_CLIENT_ID') or os.getenv('VITE_SPOTIFY_CLIENT_ID') or '').strip()
    client_secret = (os.getenv('SPOTIFY_CLIENT_SECRET') or '').strip()
    redirect = (os.getenv('SPOTIFY_REDIRECT_URI') or os.getenv('VITE_SPOTIFY_REDIRECT_URI') or '').strip()
    if not client_id or not redirect:
        raise RuntimeError(
            'Faltan SPOTIFY_CLIENT_ID o SPOTIFY_REDIRECT_URI. '
            'Archivos .env encontrados: ' + ', '.join(str(p) for p in env_files)
        )

    scope = 'playlist-read-private playlist-modify-public playlist-modify-private'
    if client_secret:
        # Igual que MixNKey: SpotifyOAuth con CLIENT_ID + CLIENT_SECRET + REDIRECT_URI.
        auth = SpotifyOAuth(
            client_id=client_id, client_secret=client_secret,
            redirect_uri=redirect, scope=scope,
            cache_path=str(root.parent / '_FLAMINGO - MASTER' / '.spotify_background_token_cache'),
            open_browser=True,
        )
    else:
        auth = SpotifyPKCE(
            client_id=client_id, redirect_uri=redirect, scope=scope,
            cache_path=str(root / '.spotify_background_token_cache'),
            open_browser=True,
        )
    print('Credenciales Spotify cargadas desde .env (sin pedir Client ID).')
    return spotipy.Spotify(
        auth_manager=auth, requests_timeout=25, retries=3,
        status_retries=3, backoff_factor=1,
    )


def find_owned_playlist(spotify, user_id, name):
    offset = 0
    while True:
        page = spotify.current_user_playlists(limit=50, offset=offset)
        for item in page.get('items', []):
            if not item:
                continue
            owner = item.get('owner') or {}
            if owner.get('id') == user_id and item.get('name', '').casefold() == name.casefold():
                return item
        if not page.get('next'):
            return None
        offset += len(page.get('items', []))


def publish(spotify, name, tracks):
    me = spotify.current_user()
    playlist = find_owned_playlist(spotify, me['id'], name)
    ids = [f"spotify:track:{t['spotifyId']}" for t in tracks]
    if playlist is None:
        playlist = spotify.user_playlist_create(user=me['id'], name=name, public=False,
                                                description='Generada por Flamingo DJ Background Creator')
        print(f'Playlist creada en Spotify: {playlist["id"]}')
    else:
        print(f'Playlist existente encontrada: {playlist["id"]}. Reemplazando canciones...')
    # Spotify admite como máximo 100 elementos por operación de reemplazo/adición.
    spotify.playlist_replace_items(playlist['id'], ids[:100])
    for start in range(100, len(ids), 100):
        spotify.playlist_add_items(playlist['id'], ids[start:start + 100])
    return playlist['external_urls'].get('spotify') or f'https://open.spotify.com/playlist/{playlist["id"]}'


def main():
    root = root_folder()
    print('\n=== FLAMINGO DJ · BACKGROUND PLAYLIST CREATOR ===')
    print('Spotify: creación/reemplazo DIRECTO · ENERGY >= 4 · POP 20/55/20/5')
    years = ask_years()
    sources = ask_sources(playlists_available(root))
    count = ask_count()
    name = input('\nNombre de la playlist en Spotify: ').strip()
    if not name:
        raise ValueError('Debes indicar un nombre de playlist.')
    tracks, exclusions, eligible = build_selection(root, sources, *years, count)
    duration = sum(x['durationSeconds'] for x in tracks)
    print(f'\nSeleccionadas: {len(tracks)} / {count} | Elegibles: {eligible}')
    print(f'Duración estimada: {duration / 60:.0f} min ({duration / 3600:.2f} h)')
    for i, band in enumerate(BANDS):
        amount = sum(x['band'] == i for x in tracks)
        print(f'POP {band[0]}-{band[1]}: {amount} ({amount / len(tracks) * 100:.1f}%)')
    if len(tracks) < count:
        print('AVISO: no hay suficientes canciones elegibles para completar la cantidad solicitada.')
    print('\nConectando a Spotify para aplicar la selección...')
    spotify = spotify_connection(root)
    url = publish(spotify, name, tracks)
    print(f'\nLISTO: {name} | {len(tracks)} canciones | {duration / 3600:.2f} h')
    print('Spotify:', url)
    # Respaldo local después de publicar; no es un paso manual.
    out = root / 'background_generated' / (re.sub(r'[^A-Za-z0-9 _-]', '', name).strip().replace(' ', '_') or 'BACKGROUND')
    out.mkdir(parents=True, exist_ok=True)
    (out / 'background_playlist.json').write_text(json.dumps({
        'playlistName': name, 'spotifyUrl': url, 'years': years,
        'sourcePlaylists': [x.stem for x in sources], 'minEnergy': MIN_ENERGY,
        'requestedCount': count, 'tracks': tracks,
        'generatedAt': datetime.now().isoformat(timespec='seconds')
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Respaldo:', out / 'background_playlist.json')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nCancelado.')
        sys.exit(130)
    except Exception as error:
        print(f'\nERROR: {error}', file=sys.stderr)
        sys.exit(1)
