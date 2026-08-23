import fs from "node:fs";
import path from "node:path";

import {
  defineConfig,
  type Plugin,
} from "vite";

import react from "@vitejs/plugin-react";

import {
  flamingoTrackEditPlugin,
} from "./vitePlugins/flamingoTrackEditPlugin.js";

type PlaylistPayload = {
  playlist?: {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    category?: unknown;
    trackIds?: unknown;
    updatedAt?: unknown;
  };
};


const PLAYLIST_DIR =
  path.resolve(
    process.cwd(),
    "src/data/JSON/playlists",
  );


function cleanText(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}


function safeFilename(
  value: string,
): string {
  const cleaned =
    value
      .replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  return (
    cleaned ||
    "UNTITLED PLAYLIST"
  );
}


function readJson(
  filePath: string,
): unknown {
  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}


function findAppPlaylistFile(
  playlistId: string,
): string | null {
  if (
    !fs.existsSync(
      PLAYLIST_DIR,
    )
  ) {
    return null;
  }

  for (
    const filename of
      fs.readdirSync(
        PLAYLIST_DIR,
      )
  ) {
    if (
      !filename
        .toLowerCase()
        .endsWith(
          ".json",
        )
    ) {
      continue;
    }

    const filePath =
      path.join(
        PLAYLIST_DIR,
        filename,
      );

    const data =
      readJson(
        filePath,
      );

    if (
      !data ||
      typeof data !==
        "object" ||
      Array.isArray(data)
    ) {
      continue;
    }

    const record =
      data as Record<
        string,
        unknown
      >;

    if (
      record.source ===
        "flamingo-dj-app" &&
      record.playlistId ===
        playlistId
    ) {
      return filePath;
    }
  }

  return null;
}


function readRequestBody(
  req:
    import(
      "node:http"
    ).IncomingMessage,
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
          body +=
            String(chunk);
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


function playlistDiskPlugin():
  Plugin {
  return {
    name:
      "flamingo-dj-playlist-disk-storage",

    configureServer(
      server,
    ) {
      fs.mkdirSync(
        PLAYLIST_DIR,
        {
          recursive: true,
        },
      );

      server.middlewares.use(
        "/api/flamingo/playlists",
        async (
          req,
          res,
          next,
        ) => {
          const method =
            req.method ??
            "GET";

          if (
            method ===
            "POST"
          ) {
            try {
              const body =
                await readRequestBody(
                  req,
                );

              const payload =
                JSON.parse(
                  body,
                ) as PlaylistPayload;

              const playlist =
                payload.playlist;

              if (
                !playlist ||
                typeof playlist !==
                  "object"
              ) {
                res.statusCode =
                  400;

                res.end(
                  "Missing playlist.",
                );

                return;
              }

              const id =
                cleanText(
                  playlist.id,
                );

              const name =
                cleanText(
                  playlist.name,
                );

              if (
                !id ||
                !name
              ) {
                res.statusCode =
                  400;

                res.end(
                  "Playlist id and name are required.",
                );

                return;
              }

              const trackIds =
                Array.isArray(
                  playlist.trackIds,
                )
                  ? playlist.trackIds
                      .map(
                        (value) =>
                          typeof value ===
                            "string"
                            ? value.trim()
                            : typeof value ===
                                "number"
                              ? String(
                                  value,
                                )
                              : "",
                      )
                      .filter(
                        Boolean,
                      )
                  : [];

              const document = {
                schemaVersion: 2,

                source:
                  "flamingo-dj-app",

                playlistId:
                  id,

                playlistName:
                  name,

                description:
                  cleanText(
                    playlist
                      .description,
                  ),

                category:
                  cleanText(
                    playlist
                      .category,
                  ) ||
                  "Custom",

                totalTracks:
                  trackIds.length,

                trackIds,

                updatedAt:
                  cleanText(
                    playlist
                      .updatedAt,
                  ) ||
                  new Date()
                    .toISOString(),

                generatedAt:
                  new Date()
                    .toISOString(),
              };

              const existingFile =
                findAppPlaylistFile(
                  id,
                );

              const targetFile =
                path.join(
                  PLAYLIST_DIR,

                  `${safeFilename(
                    name,
                  )}.json`,
                );

              fs.writeFileSync(
                targetFile,

                (
                  JSON.stringify(
                    document,
                    null,
                    2,
                  ) + "\n"
                ),

                "utf8",
              );

              if (
                existingFile &&
                path.resolve(
                  existingFile,
                ) !==
                  path.resolve(
                    targetFile,
                  )
              ) {
                fs.unlinkSync(
                  existingFile,
                );
              }

              res.statusCode =
                200;

              res.setHeader(
                "Content-Type",
                "application/json",
              );

              res.end(
                JSON.stringify({
                  ok: true,

                  file:
                    path.basename(
                      targetFile,
                    ),
                }),
              );

              return;

            } catch (error) {
              console.error(
                "[FlamingoDJ] Failed to write playlist JSON",
                error,
              );

              res.statusCode =
                500;

              res.end(
                "Failed to write playlist JSON.",
              );

              return;
            }
          }

          if (
            method ===
            "DELETE"
          ) {
            try {
              const url =
                req.url ??
                "";

              const id =
                decodeURIComponent(
                  url
                    .replace(
                      /^\/+/,
                      "",
                    )
                    .split("?")[0],
                );

              if (!id) {
                res.statusCode =
                  400;

                res.end(
                  "Playlist id required.",
                );

                return;
              }

              const filePath =
                findAppPlaylistFile(
                  id,
                );

              if (
                filePath &&
                fs.existsSync(
                  filePath,
                )
              ) {
                fs.unlinkSync(
                  filePath,
                );
              }

              res.statusCode =
                204;

              res.end();

              return;

            } catch (error) {
              console.error(
                "[FlamingoDJ] Failed to delete playlist JSON",
                error,
              );

              res.statusCode =
                500;

              res.end(
                "Failed to delete playlist JSON.",
              );

              return;
            }
          }

          next();
        },
      );
    },
  };
}


export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),

    /*
     * Keeps UI-created playlists on disk.
     */
    playlistDiskPlugin(),

    /*
     * Saves track edits into:
     * - normalized/catalog/tracks.json
     * - legacy playlist JSON while migration is active
     */
    flamingoTrackEditPlugin(),
  ],

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    chunkSizeWarningLimit:
      1500,
  },
});
