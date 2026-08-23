import type { Playlist } from "../types/playlist";

const PLAYLIST_API =
  "/api/flamingo/playlists";

function isLocalDevServer(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !==
      "undefined"
  );
}

async function request(
  url: string,
  init: RequestInit,
): Promise<void> {
  if (
    !isLocalDevServer()
  ) {
    return;
  }

  try {
    const response =
      await fetch(
        url,
        init,
      );

    if (!response.ok) {
      console.warn(
        "[FlamingoDJ] Playlist JSON disk write failed:",
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    console.warn(
      "[FlamingoDJ] Playlist JSON disk API unavailable.",
      error,
    );
  }
}

export async function writeAppPlaylistJson(
  playlist: Playlist,
): Promise<void> {
  await request(
    PLAYLIST_API,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify({
          playlist,
        }),
    },
  );
}

export async function deleteAppPlaylistJson(
  playlistId: string,
): Promise<void> {
  await request(
    `${PLAYLIST_API}/${encodeURIComponent(
      playlistId,
    )}`,
    {
      method: "DELETE",
    },
  );
}
