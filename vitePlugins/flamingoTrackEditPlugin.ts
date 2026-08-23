import fs from "node:fs";
import path from "node:path";

import type {
  Plugin,
} from "vite";

type TrackEditBody = {
  songId?: unknown;
  changes?: unknown;
};

type JsonRecord =
  Record<string, unknown>;

type JsonWriteResult = {
  catalogUpdated: boolean;
  legacyFilesUpdated: number;
  legacyFiles: string[];
};

function readBody(
  req:
    import("node:http").IncomingMessage,
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let body = "";

      req.on(
        "data",
        (chunk) => {
          body += String(chunk);
        },
      );

      req.on(
        "end",
        () =>
          resolve(body),
      );

      req.on(
        "error",
        reject,
      );
    },
  );
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizedSongId(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  const numeric =
    Number(text);

  if (
    Number.isFinite(numeric)
  ) {
    return String(
      Math.trunc(numeric),
    );
  }

  return text;
}

function trackSongId(
  track: JsonRecord,
): string | null {
  return normalizedSongId(
    track.id ??
    track.externalSongId ??
    track.song_id ??
    track.SongID,
  );
}

function jsonFieldName(
  reactField: string,
): string {
  /*
   * React Track fields and current Flamingo JSON mostly use the same
   * camelCase names. Keep this function explicit so future DB naming
   * changes never leak into the JSON layer.
   */
  const mapping:
    Record<string, string> = {
      title: "title",
      artist: "artist",
      album: "album",
      releaseDate: "releaseDate",
      genre: "genre",
      spotifyPopularity:
        "spotifyPopularity",
      tempo: "tempo",
      musicalKey: "musicalKey",
      energy: "energy",
      keywords: "keywords",
      overallVolume:
        "overallVolume",
      cuePoints: "cuePoints",
      comments: "comments",
      folder: "folder",
      rating: "rating",
      country: "country",
      dateAdded: "dateAdded",
    };

  return (
    mapping[reactField] ??
    reactField
  );
}

function applyChanges(
  source: JsonRecord,
  changes: JsonRecord,
): JsonRecord {
  const next: JsonRecord = {
    ...source,
  };

  for (
    const [
      field,
      value,
    ] of Object.entries(
      changes,
    )
  ) {
    /*
     * SongID itself is immutable.
     */
    if (
      field === "id" ||
      field ===
        "externalSongId" ||
      field === "song_id" ||
      field === "SongID"
    ) {
      continue;
    }

    next[
      jsonFieldName(field)
    ] = value;
  }

  return next;
}

function writeJsonAtomic(
  filePath: string,
  payload: unknown,
): void {
  const parent =
    path.dirname(filePath);

  fs.mkdirSync(
    parent,
    {
      recursive: true,
    },
  );

  const tempPath =
    `${filePath}.tmp`;

  fs.writeFileSync(
    tempPath,
    (
      JSON.stringify(
        payload,
        null,
        2,
      ) + "\n"
    ),
    "utf8",
  );

  fs.renameSync(
    tempPath,
    filePath,
  );
}

function updateNormalizedCatalog(
  catalogPath: string,
  songId: string,
  changes: JsonRecord,
): boolean {
  if (
    !fs.existsSync(
      catalogPath,
    )
  ) {
    return false;
  }

  const parsed =
    JSON.parse(
      fs.readFileSync(
        catalogPath,
        "utf8",
      ),
    ) as unknown;

  if (
    !isRecord(parsed) ||
    !isRecord(
      parsed.tracks,
    )
  ) {
    throw new Error(
      "normalized/catalog/tracks.json "
      + "has an invalid structure.",
    );
  }

  const tracks: JsonRecord = {
    ...parsed.tracks,
  };

  /*
   * Try exact canonical key first.
   * If an older catalog used a numeric-looking alternate key,
   * compare each record SongID as fallback.
   */
  let matchedKey:
    string | null = null;

  if (
    isRecord(
      tracks[songId],
    )
  ) {
    matchedKey = songId;
  } else {
    for (
      const [
        key,
        item,
      ] of Object.entries(
        tracks,
      )
    ) {
      if (
        isRecord(item) &&
        trackSongId(item) ===
          songId
      ) {
        matchedKey = key;
        break;
      }
    }
  }

  if (!matchedKey) {
    return false;
  }

  const current =
    tracks[matchedKey];

  if (!isRecord(current)) {
    return false;
  }

  tracks[matchedKey] =
    applyChanges(
      current,
      changes,
    );

  writeJsonAtomic(
    catalogPath,
    {
      ...parsed,

      updatedAt:
        new Date()
          .toISOString(),

      tracks,
    },
  );

  return true;
}

function listJsonFilesRecursive(
  root: string,
): string[] {
  if (
    !fs.existsSync(root)
  ) {
    return [];
  }

  const output:
    string[] = [];

  for (
    const entry of
      fs.readdirSync(
        root,
        {
          withFileTypes: true,
        },
      )
  ) {
    const fullPath =
      path.join(
        root,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      output.push(
        ...listJsonFilesRecursive(
          fullPath,
        ),
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name
        .toLowerCase()
        .endsWith(".json")
    ) {
      output.push(
        fullPath,
      );
    }
  }

  return output;
}

function updateLegacyPlaylists(
  playlistRoot: string,
  songId: string,
  changes: JsonRecord,
): {
  count: number;
  files: string[];
} {
  const updatedFiles:
    string[] = [];

  for (
    const filePath of
      listJsonFilesRecursive(
        playlistRoot,
      )
  ) {
    let parsed: unknown;

    try {
      parsed =
        JSON.parse(
          fs.readFileSync(
            filePath,
            "utf8",
          ),
        );
    } catch {
      continue;
    }

    /*
     * Normalized playlist files have only trackIds.
     * They do not need metadata changes because the data lives
     * in normalized/catalog/tracks.json.
     */
    if (
      isRecord(parsed) &&
      Array.isArray(
        parsed.trackIds,
      ) &&
      !Array.isArray(
        parsed.tracks,
      )
    ) {
      continue;
    }

    if (
      !isRecord(parsed) ||
      !Array.isArray(
        parsed.tracks,
      )
    ) {
      continue;
    }

    let changed = false;

    const nextTracks =
      parsed.tracks.map(
        (item) => {
          if (
            !isRecord(item) ||
            trackSongId(item) !==
              songId
          ) {
            return item;
          }

          changed = true;

          return applyChanges(
            item,
            changes,
          );
        },
      );

    if (!changed) {
      continue;
    }

    writeJsonAtomic(
      filePath,
      {
        ...parsed,

        updatedAt:
          new Date()
            .toISOString(),

        tracks:
          nextTracks,
      },
    );

    updatedFiles.push(
      filePath,
    );
  }

  return {
    count:
      updatedFiles.length,

    files:
      updatedFiles,
  };
}

function updateJsonFiles(
  projectRoot: string,
  songId: string,
  changes: JsonRecord,
): JsonWriteResult {
  const jsonRoot =
    path.resolve(
      projectRoot,
      "src",
      "data",
      "JSON",
    );

  const normalizedCatalog =
    path.join(
      jsonRoot,
      "normalized",
      "catalog",
      "tracks.json",
    );

  const legacyPlaylistRoot =
    path.join(
      jsonRoot,
      "playlists",
    );

  const catalogUpdated =
    updateNormalizedCatalog(
      normalizedCatalog,
      songId,
      changes,
    );

  const legacy =
    updateLegacyPlaylists(
      legacyPlaylistRoot,
      songId,
      changes,
    );

  return {
    catalogUpdated,
    legacyFilesUpdated:
      legacy.count,
    legacyFiles:
      legacy.files,
  };
}

export function flamingoTrackEditPlugin():
  Plugin {
  const projectRoot =
    process.cwd();

  return {
    name:
      "flamingo-track-edit-json-sync",

    configureServer(
      server,
    ) {
      server.middlewares.use(
        "/api/flamingo/track-edit",
        async (
          req,
          res,
          next,
        ) => {
          if (
            req.method !==
            "PATCH"
          ) {
            next();
            return;
          }

          try {
            const raw =
              await readBody(req);

            const body =
              JSON.parse(
                raw,
              ) as TrackEditBody;

            const songId =
              normalizedSongId(
                body.songId,
              );

            if (
              !songId ||
              !isRecord(
                body.changes,
              )
            ) {
              res.statusCode =
                400;

              res.setHeader(
                "Content-Type",
                "application/json",
              );

              res.end(
                JSON.stringify({
                  ok: false,

                  error:
                    "songId and changes "
                    + "are required.",
                }),
              );

              return;
            }

            const result =
              updateJsonFiles(
                projectRoot,
                songId,
                body.changes,
              );

            /*
             * During the migration at least ONE JSON representation
             * must contain this SongID.
             *
             * If neither the normalized catalog nor any legacy playlist
             * was updated, return an error. This prevents the UI from
             * claiming "saved" when a refresh would restore old data.
             */
            if (
              !result
                .catalogUpdated &&
              result
                .legacyFilesUpdated ===
                0
            ) {
              res.statusCode =
                404;

              res.setHeader(
                "Content-Type",
                "application/json",
              );

              res.end(
                JSON.stringify({
                  ok: false,

                  songId,

                  error:
                    "SongID was not found "
                    + "in normalized catalog "
                    + "or legacy playlist JSON.",
                }),
              );

              return;
            }

            console.log(
              "[FlamingoDJ JSON SAVE]",
              {
                songId,

                catalogUpdated:
                  result
                    .catalogUpdated,

                legacyFilesUpdated:
                  result
                    .legacyFilesUpdated,
              },
            );

            res.statusCode =
              200;

            res.setHeader(
              "Content-Type",
              "application/json",
            );

            res.end(
              JSON.stringify({
                ok: true,

                songId,

                catalogUpdated:
                  result
                    .catalogUpdated,

                legacyFilesUpdated:
                  result
                    .legacyFilesUpdated,

                legacyFiles:
                  result
                    .legacyFiles,
              }),
            );
          } catch (error) {
            console.error(
              "[FlamingoDJ JSON SAVE ERROR]",
              error,
            );

            res.statusCode =
              500;

            res.setHeader(
              "Content-Type",
              "application/json",
            );

            res.end(
              JSON.stringify({
                ok: false,

                error:
                  error instanceof Error
                    ? error.message
                    : "Track JSON edit failed.",
              }),
            );
          }
        },
      );
    },
  };
}
