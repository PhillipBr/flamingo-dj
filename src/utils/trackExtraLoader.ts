import type { Track } from "../types/track";

type TrackExtraRecord = {
  spotifyUrl?:
    | string
    | null;

  [key: string]:
    unknown;
};

type TrackExtraCatalog = {
  tracks?: Record<
    string,
    TrackExtraRecord
  >;
};

const EXTRA_CATALOG_URL =
  new URL(
    "../data/JSON/normalized/catalog/tracks-extra.json",
    import.meta.url,
  ).href;

let catalogPromise:
  Promise<
    Record<
      string,
      TrackExtraRecord
    >
  > | null = null;

async function loadCatalogInternal(): Promise<
  Record<
    string,
    TrackExtraRecord
  >
> {
  const response =
    await fetch(
      EXTRA_CATALOG_URL,
      {
        cache:
          "no-cache",
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Could not load tracks-extra.json (${response.status} ${response.statusText}).`,
    );
  }

  const rawText =
    await response.text();

  const trimmed =
    rawText.trim();

  if (
    trimmed.startsWith(
      "<!doctype",
    ) ||
    trimmed.startsWith(
      "<!DOCTYPE",
    ) ||
    trimmed.startsWith(
      "<html",
    )
  ) {
    throw new Error(
      `tracks-extra.json resolved to HTML instead of JSON. URL: ${EXTRA_CATALOG_URL}`,
    );
  }

  const payload =
    JSON.parse(
      rawText,
    ) as
      TrackExtraCatalog;

  if (
    !payload.tracks ||
    typeof payload.tracks !==
      "object"
  ) {
    throw new Error(
      "tracks-extra.json has an invalid catalog structure.",
    );
  }

  return payload.tracks;
}

export async function loadTrackExtraCatalog(): Promise<
  Record<
    string,
    TrackExtraRecord
  >
> {
  if (
    !catalogPromise
  ) {
    catalogPromise =
      loadCatalogInternal()
        .catch(
          (error) => {
            catalogPromise =
              null;

            throw error;
          },
        );
  }

  return catalogPromise;
}

function possibleTrackIds(
  track: Track,
): string[] {
  return Array.from(
    new Set(
      [
        track.id,
        track.externalSongId,
      ]
        .map(
          (value) =>
            String(
              value ??
                "",
            ).trim(),
        )
        .filter(Boolean),
    ),
  );
}

export async function hydrateTracksWithSpotifyUrls(
  tracks: Track[],
): Promise<{
  tracks: Track[];
  found: number;
  missing: number;
}> {
  const catalog =
    await loadTrackExtraCatalog();

  let found =
    0;

  let missing =
    0;

  const hydrated =
    tracks.map(
      (track) => {
        let extra:
          TrackExtraRecord | undefined;

        for (
          const id of
          possibleTrackIds(
            track,
          )
        ) {
          if (
            catalog[id]
          ) {
            extra =
              catalog[id];

            break;
          }
        }

        const spotifyUrl =
          String(
            track.spotifyUrl ??
              extra?.spotifyUrl ??
              "",
          ).trim();

        if (
          spotifyUrl
        ) {
          found += 1;
        } else {
          missing += 1;
        }

        return {
          ...track,

          spotifyUrl:
            spotifyUrl ||
            null,
        };
      },
    );

  return {
    tracks:
      hydrated,

    found,

    missing,
  };
}
