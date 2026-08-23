import type { Track } from "../types/track";

type JsonRecord = Record<string, unknown>;
type CatalogPayload = { tracks?: Record<string, JsonRecord> };

const coreModules = import.meta.glob(
  "../data/JSON/normalized/catalog/tracks-core.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

const extraModules = import.meta.glob(
  "../data/JSON/normalized/catalog/tracks-extra.json",
  { import: "default" },
) as Record<string, () => Promise<unknown>>;

let extraCache: Record<string, JsonRecord> | null = null;
let extraPromise: Promise<Record<string, JsonRecord>> | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function s(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function n(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function corePayload(): CatalogPayload {
  const raw = Object.values(coreModules)[0];
  return isRecord(raw) ? (raw as CatalogPayload) : { tracks: {} };
}

function coreTrack(songId: string, raw: JsonRecord): Track {
  return {
    id: s(raw.id) ?? songId,
    externalSongId: s(raw.externalSongId) ?? songId,
    title: s(raw.title) ?? "Unknown title",
    artist: s(raw.artist) ?? "Unknown artist",
    durationSeconds: n(raw.durationSeconds),
    releaseDate: s(raw.releaseDate),
    spotifyPopularity: n(raw.spotifyPopularity),
    tempo: n(raw.tempo),
    musicalKey: s(raw.musicalKey),
    energy: n(raw.energy),
    album: null,
    artworkUrl: null,
    genre: null,
    country: null,
    spotifyUrl: null,
    overallVolume: null,
    cuePoints: null,
    keywords: [],
    comments: null,
    folder: null,
    dateAdded: null,
    rating: null,
    artistDetails: null,
  } as Track;
}

export function loadCoreTracks(): Track[] {
  return Object.entries(corePayload().tracks ?? {}).map(([songId, raw]) =>
    coreTrack(String(songId), raw),
  );
}

async function loadExtraCatalog(): Promise<Record<string, JsonRecord>> {
  if (extraCache) return extraCache;
  if (extraPromise) return extraPromise;

  extraPromise = (async () => {
    const loader = Object.values(extraModules)[0];

    if (!loader) {
      console.warn("[FlamingoDJ] tracks-extra.json loader not found");
      extraCache = {};
      return extraCache;
    }

    console.info("[FlamingoDJ] Loading tracks-extra.json on demand");
    const raw = await loader();

    extraCache = isRecord(raw)
      ? ((raw as CatalogPayload).tracks ?? {})
      : {};

    console.info("[FlamingoDJ] Extra catalog ready", {
      tracks: Object.keys(extraCache).length,
    });

    return extraCache;
  })();

  return extraPromise;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export async function hydrateTrackExtras(
  tracks: Track[],
  ids: Iterable<string>,
): Promise<Track[]> {
  const wanted = new Set(Array.from(ids, (id) => String(id)));
  if (!wanted.size) return tracks;

  const extras = await loadExtraCatalog();
  let matches = 0;

  const result = tracks.map((track) => {
    if (!wanted.has(track.id)) return track;

    const raw = extras[String(track.id)];

    if (!raw) {
      console.warn("[FlamingoDJ] No EXTRA metadata for SongID", track.id);
      return track;
    }

    matches += 1;

    return {
      ...track,
      album: s(raw.album),
      artworkUrl: s(raw.artworkUrl),
      genre: s(raw.genre),
      country: s(raw.country),
      spotifyUrl: s(raw.spotifyUrl),
      overallVolume: n(raw.overallVolume),
      cuePoints: s(raw.cuePoints),
      comments: s(raw.comments),
      folder: s(raw.folder),
      dateAdded: s(raw.dateAdded),
      rating: n(raw.rating),
      keywords: stringArray(raw.keywords),
      artistDetails: isRecord(raw.artistDetails)
        ? (raw.artistDetails as Track["artistDetails"])
        : null,
      id: track.id,
      externalSongId: track.externalSongId,
    } as Track;
  });

  console.info("[FlamingoDJ] EXTRA merge result", {
    requested: wanted.size,
    matched: matches,
  });

  return result;
}
