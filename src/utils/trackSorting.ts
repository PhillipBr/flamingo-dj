
import type {
  TrackSortDirection,
  TrackSortField,
} from "../components/tracks/TracksTable";

import type { Track } from "../types/track";

import { getCamelotKey } from "./camelot";

function normalizeText(
  value: unknown,
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isMissingNumber(
  value: unknown,
): boolean {
  return (
    typeof value !== "number" ||
    Number.isNaN(value)
  );
}

function compareNumbers(
  firstValue: unknown,
  secondValue: unknown,
  direction: TrackSortDirection,
): number {
  const firstMissing =
    isMissingNumber(firstValue);

  const secondMissing =
    isMissingNumber(secondValue);

  if (
    firstMissing &&
    secondMissing
  ) {
    return 0;
  }

  // Los valores NULL siempre quedan al final,
  // sin importar la dirección del sort.
  if (firstMissing) {
    return 1;
  }

  if (secondMissing) {
    return -1;
  }

  const firstNumber =
    firstValue as number;

  const secondNumber =
    secondValue as number;

  return direction === "asc"
    ? firstNumber - secondNumber
    : secondNumber - firstNumber;
}

function compareText(
  firstValue: unknown,
  secondValue: unknown,
  direction: TrackSortDirection,
): number {
  const firstText =
    normalizeText(firstValue);

  const secondText =
    normalizeText(secondValue);

  const firstMissing =
    firstText.length === 0;

  const secondMissing =
    secondText.length === 0;

  if (
    firstMissing &&
    secondMissing
  ) {
    return 0;
  }

  // Los textos vacíos siempre quedan al final.
  if (firstMissing) {
    return 1;
  }

  if (secondMissing) {
    return -1;
  }

  const comparison =
    firstText.localeCompare(
      secondText,
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    );

  return direction === "asc"
    ? comparison
    : -comparison;
}

function getRoundedTempo(
  track: Track,
): number | null {
  if (
    typeof track.tempo !== "number" ||
    Number.isNaN(track.tempo)
  ) {
    return null;
  }

  /*
   * Para DJs, valores como 119.98 y 120.04
   * pertenecen al mismo grupo visual de 120 BPM.
   *
   * Dentro de ese grupo se aplica Popularity DESC.
   */
  return Math.round(
    track.tempo,
  );
}

function getRoundedEnergy(
  track: Track,
): number | null {
  if (
    typeof track.energy !== "number" ||
    Number.isNaN(track.energy)
  ) {
    return null;
  }

  /*
   * Agrupa Energy a un decimal para que Popularity
   * pueda actuar como segundo criterio.
   */
  return (
    Math.round(
      track.energy * 10,
    ) / 10
  );
}

function comparePrimaryField(
  firstTrack: Track,
  secondTrack: Track,
  sortField: TrackSortField,
  sortDirection: TrackSortDirection,
): number {
  switch (sortField) {
    case "tempo":
      return compareNumbers(
        getRoundedTempo(
          firstTrack,
        ),
        getRoundedTempo(
          secondTrack,
        ),
        sortDirection,
      );

    case "energy":
      return compareNumbers(
        getRoundedEnergy(
          firstTrack,
        ),
        getRoundedEnergy(
          secondTrack,
        ),
        sortDirection,
      );

    case "spotifyPopularity":
      return compareNumbers(
        firstTrack.spotifyPopularity,
        secondTrack.spotifyPopularity,
        sortDirection,
      );

    case "durationSeconds":
      return compareNumbers(
        firstTrack.durationSeconds,
        secondTrack.durationSeconds,
        sortDirection,
      );

    case "overallVolume":
      return compareNumbers(
        firstTrack.overallVolume,
        secondTrack.overallVolume,
        sortDirection,
      );

    case "rating":
      return compareNumbers(
        firstTrack.rating,
        secondTrack.rating,
        sortDirection,
      );

    case "camelot":
      return compareText(
        getCamelotKey(
          firstTrack.musicalKey,
        ),
        getCamelotKey(
          secondTrack.musicalKey,
        ),
        sortDirection,
      );

    default:
      return compareText(
        firstTrack[
          sortField
        ],
        secondTrack[
          sortField
        ],
        sortDirection,
      );
  }
}

/**
 * Orden global para FlamingoApp DJ.
 *
 * Prioridades:
 * 1. Campo seleccionado por el usuario.
 * 2. Spotify Popularity DESC.
 * 3. Título ASC.
 * 4. Artista ASC.
 *
 * Ejemplo con Tempo ASC:
 * 120 BPM / Popularity 95
 * 120 BPM / Popularity 82
 * 122 BPM / Popularity 99
 */
export function sortTracks(
  tracks: Track[],
  sortField: TrackSortField,
  sortDirection: TrackSortDirection,
): Track[] {
  return [...tracks].sort(
    (
      firstTrack,
      secondTrack,
    ) => {
      const primaryComparison =
        comparePrimaryField(
          firstTrack,
          secondTrack,
          sortField,
          sortDirection,
        );

      if (
        primaryComparison !== 0
      ) {
        return primaryComparison;
      }

      /*
       * Popularity siempre es la segunda prioridad,
       * excepto cuando ya es el campo principal.
       */
      if (
        sortField !==
        "spotifyPopularity"
      ) {
        const popularityComparison =
          compareNumbers(
            firstTrack
              .spotifyPopularity,
            secondTrack
              .spotifyPopularity,
            "desc",
          );

        if (
          popularityComparison !== 0
        ) {
          return popularityComparison;
        }
      }

      const titleComparison =
        compareText(
          firstTrack.title,
          secondTrack.title,
          "asc",
        );

      if (
        titleComparison !== 0
      ) {
        return titleComparison;
      }

      return compareText(
        firstTrack.artist,
        secondTrack.artist,
        "asc",
      );
    },
  );
}
