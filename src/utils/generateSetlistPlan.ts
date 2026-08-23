import type { Track } from "../types/track";

import type {
  GeneratedSetlistBlockResult,
  GeneratedSetlistResult,
  SetlistPlannerOptions,
  SetlistStyleBlock,
} from "../types/setlistGenerator";

import {
  generateSetlist,
} from "./generateSetlist";

import {
  getTrackGenres,
  normalizeGenre,
  scoreSongMatch,
} from "./matchSongs";

function toFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed =
      Number(
        value
          .trim()
          .replace(",", "."),
      );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function getBpm(
  track: Track,
): number | null {
  return toFiniteNumber(
    track.tempo,
  );
}

function getPopularity(
  track: Track,
): number | null {
  return toFiniteNumber(
    track.spotifyPopularity,
  );
}

function trackMatchesGenre(
  track: Track,
  requestedGenre: string,
): boolean {
  const requested =
    normalizeGenre(
      requestedGenre,
    );

  if (
    !requested ||
    requested === "all"
  ) {
    return true;
  }

  return getTrackGenres(
    track,
  ).some(
    (genre) => {
      const normalized =
        normalizeGenre(
          genre,
        );

      return (
        normalized ===
          requested ||
        normalized.includes(
          requested,
        ) ||
        requested.includes(
          normalized,
        )
      );
    },
  );
}

function getHistoricalTrackScore(
  track: Track,
  options: SetlistPlannerOptions,
  block?: SetlistStyleBlock,
): number {
  const enabled =
    block?.historicalPriorityEnabled ??
    options.historicalPriorityEnabled ??
    false;

  if (!enabled) {
    return 0.5;
  }

  const reliable =
    block?.reliableTrackIds ??
    options.reliableTrackIds ??
    [];

  const rescue =
    block?.crowdRescueTrackIds ??
    options.crowdRescueTrackIds ??
    [];

  const review =
    block?.reviewTrackIds ??
    options.reviewTrackIds ??
    [];

  if (
    reliable.includes(
      track.id,
    )
  ) {
    return 1;
  }

  if (
    rescue.includes(
      track.id,
    )
  ) {
    return 0.82;
  }

  if (
    review.includes(
      track.id,
    )
  ) {
    return 0.15;
  }

  return 0.5;
}

function getBlockGenres(
  block: SetlistStyleBlock,
): string[] {
  const genres =
    Array.isArray(
      block.genres,
    )
      ? block.genres
          .map(
            (genre) =>
              genre.trim(),
          )
          .filter(Boolean)
      : [];

  if (
    genres.length > 0
  ) {
    return genres;
  }

  return block.genre
    ? [block.genre]
    : ["all"];
}

function trackMatchesBlockGenres(
  track: Track,
  block: SetlistStyleBlock,
): boolean {
  const requestedGenres =
    getBlockGenres(
      block,
    );

  if (
    requestedGenres.length ===
      0 ||
    requestedGenres.some(
      (genre) =>
        normalizeGenre(
          genre,
        ) === "all",
    )
  ) {
    return true;
  }

  return requestedGenres.some(
    (genre) =>
      trackMatchesGenre(
        track,
        genre,
      ),
  );
}

function getBlockGenreLabel(
  block: SetlistStyleBlock,
): string {
  const genres =
    getBlockGenres(
      block,
    ).filter(
      (genre) =>
        normalizeGenre(
          genre,
        ) !== "all",
    );

  return genres.length > 0
    ? genres.join(" + ")
    : "All genres";
}

function isEligibleForBlock(
  track: Track,
  block: SetlistStyleBlock,
  options: SetlistPlannerOptions,
): boolean {
  const bpm =
    getBpm(track);

  if (
    bpm === null ||
    bpm <
      block.minimumBpm ||
    bpm >
      block.maximumBpm
  ) {
    return false;
  }

  if (
    !trackMatchesBlockGenres(
      track,
      block,
    )
  ) {
    return false;
  }

  const popularity =
    getPopularity(track);

  if (
    popularity !== null &&
    (
      popularity <
        options.minimumPopularity ||
      popularity >
        options.maximumPopularity
    )
  ) {
    return false;
  }

  return true;
}

function calculateTrackCount(
  durationMinutes: number,
  averagePlaySeconds: number,
): number {
  const durationSeconds =
    Math.max(
      60,
      durationMinutes * 60,
    );

  const averageSeconds =
    Math.max(
      10,
      averagePlaySeconds,
    );

  return Math.max(
    1,
    Math.round(
      durationSeconds /
        averageSeconds,
    ),
  );
}

function chooseCrossStyleStart(
  previousTrack: Track,
  candidates: readonly Track[],
  block: SetlistStyleBlock,
  options: SetlistPlannerOptions,
): Track | null {
  const eligible =
    candidates.filter(
      (track) =>
        isEligibleForBlock(
          track,
          block,
          options,
        ),
    );

  const ranked =
    eligible
      .map(
        (candidate) => {
          const match =
            scoreSongMatch(
              previousTrack,
              candidate,
              {
                mode:
                  "cross-style",
                minimumScore: 0,
                requireGenreMatch:
                  false,
                maxBpmDifference:
                  Math.max(
                    18,
                    block.maximumBpm -
                      block.minimumBpm,
                  ),
                popularityPreference:
                  "higher",
              },
            );

          if (!match) {
            return null;
          }

          const historicalScore =
            getHistoricalTrackScore(
              candidate,
              options,
              block,
            );

          return {
            track:
              candidate,
            score:
              match.score * 0.92 +
              historicalScore * 0.08,
          };
        },
      )
      .filter(
        (
          item,
        ): item is {
          track: Track;
          score: number;
        } =>
          item !== null,
      )
      .sort(
        (
          left,
          right,
        ) => {
          if (
            right.score !==
            left.score
          ) {
            return (
              right.score -
              left.score
            );
          }

          return (
            (getPopularity(
              right.track,
            ) ?? -1) -
            (getPopularity(
              left.track,
            ) ?? -1)
          );
        },
      );

  return (
    ranked[0]?.track ??
    eligible[0] ??
    null
  );
}

function buildSingleBlock(
  options: SetlistPlannerOptions,
): SetlistStyleBlock {
  const durationMinutes =
    options.generationMode ===
    "event-duration"
      ? options.eventDurationMinutes
      : (
          options.trackCount *
          options.averagePlaySeconds
        ) / 60;

  return {
    id: "single-block",
    genre:
      options.genre,

    genres:
      options.genre &&
      options.genre !== "all"
        ? [options.genre]
        : [],

    durationMinutes,
    minimumBpm:
      options.minimumBpm,
    maximumBpm:
      options.maximumBpm,
  };
}

export function generateSetlistPlan(
  tracks: readonly Track[],
  options: SetlistPlannerOptions,
): GeneratedSetlistResult<Track> {
  const warnings: string[] = [];

  const averagePlaySeconds =
    Math.max(
      10,
      Math.min(
        600,
        Math.round(
          options.averagePlaySeconds,
        ),
      ),
    );

  if (
    !options.useStyleBlocks
  ) {
    const requestedCount =
      options.generationMode ===
      "event-duration"
        ? calculateTrackCount(
            options.eventDurationMinutes,
            averagePlaySeconds,
          )
        : Math.max(
            1,
            Math.round(
              options.trackCount,
            ),
          );

    const result =
      generateSetlist(
        tracks,
        {
          ...options,
          trackCount:
            requestedCount,
        },
      );

    return {
      ...result,
      estimatedDurationSeconds:
        result.generatedCount *
        averagePlaySeconds,
    };
  }

  const rawBlocks =
    options.styleBlocks.filter(
      (block) =>
        block.durationMinutes >
          0 &&
        block.maximumBpm >=
          block.minimumBpm,
    );

  const blocks =
    rawBlocks.length > 0
      ? rawBlocks
      : [
          buildSingleBlock(
            options,
          ),
        ];

  const usedTrackIds =
    new Set<string>();

  const generatedTracks:
    Track[] = [];

  const generatedBlocks:
    GeneratedSetlistBlockResult<Track>[] =
      [];

  let previousTrack:
    Track | null = null;

  blocks.forEach(
    (
      block,
      blockIndex,
    ) => {
      const requestedCount =
        calculateTrackCount(
          block.durationMinutes,
          averagePlaySeconds,
        );

      const availableTracks =
        tracks.filter(
          (track) =>
            !usedTrackIds.has(
              track.id,
            ),
        );

      const blockEligibleTracks =
        availableTracks.filter(
          (track) =>
            isEligibleForBlock(
              track,
              block,
              options,
            ),
        );

      let startTrackId:
        | string
        | null = null;

      let startMode:
        | "automatic"
        | "selected" =
          "automatic";

      if (
        blockIndex === 0 &&
        options.startMode ===
          "selected" &&
        options.startTrackId
      ) {
        startMode =
          "selected";

        startTrackId =
          options.startTrackId;
      } else if (
        previousTrack
      ) {
        const bridge =
          chooseCrossStyleStart(
            previousTrack,
            blockEligibleTracks,
            block,
            options,
          );

        if (bridge) {
          startMode =
            "selected";

          startTrackId =
            bridge.id;
        }
      }

      const result =
        generateSetlist(
          blockEligibleTracks,
          {
            trackCount:
              requestedCount,

            minimumBpm:
              block.minimumBpm,

            maximumBpm:
              block.maximumBpm,

            genre:
              "all",

            minimumPopularity:
              options.minimumPopularity,

            maximumPopularity:
              options.maximumPopularity,

            energyCurve:
              options.energyCurve,

            keyMode:
              options.keyMode,

            artistSpacing:
              options.artistSpacing,

            startMode,
            startTrackId,

            historicalPriorityEnabled:
              block.historicalPriorityEnabled ??
              options.historicalPriorityEnabled,

            reliableTrackIds:
              block.reliableTrackIds ??
              options.reliableTrackIds,

            crowdRescueTrackIds:
              block.crowdRescueTrackIds ??
              options.crowdRescueTrackIds,

            reviewTrackIds:
              block.reviewTrackIds ??
              options.reviewTrackIds,
          },
        );

      result.tracks.forEach(
        (track) => {
          if (
            !usedTrackIds.has(
              track.id,
            )
          ) {
            usedTrackIds.add(
              track.id,
            );

            generatedTracks.push(
              track,
            );
          }
        },
      );

      previousTrack =
        result.tracks[
          result.tracks.length -
            1
        ] ??
        previousTrack;

      generatedBlocks.push({
        blockId:
          block.id,

        phaseName:
          block.phaseName,

        genre:
          getBlockGenreLabel(
            block,
          ),

        genres:
          getBlockGenres(
            block,
          ).filter(
            (genre) =>
              normalizeGenre(
                genre,
              ) !== "all",
          ),

        minimumBpm:
          block.minimumBpm,

        maximumBpm:
          block.maximumBpm,

        requestedCount,
        generatedCount:
          result.generatedCount,
        durationMinutes:
          block.durationMinutes,
        tracks:
          result.tracks,
      });

      if (
        result.generatedCount <
        requestedCount
      ) {
        warnings.push(
          `${getBlockGenreLabel(
            block,
          )}: generated ${result.generatedCount} of ${requestedCount} requested tracks.`,
        );
      }
    },
  );

  const requestedCount =
    generatedBlocks.reduce(
      (
        total,
        block,
      ) =>
        total +
        block.requestedCount,
      0,
    );

  const requestedDurationMinutes =
    blocks.reduce(
      (
        total,
        block,
      ) =>
        total +
        block.durationMinutes,
      0,
    );

  if (
    options.generationMode ===
      "event-duration" &&
    Math.abs(
      requestedDurationMinutes -
        options.eventDurationMinutes,
    ) > 2
  ) {
    warnings.push(
      `Style blocks total ${Math.round(
        requestedDurationMinutes,
      )} minutes, while the event duration is ${Math.round(
        options.eventDurationMinutes,
      )} minutes.`,
    );
  }

  if (
    generatedTracks.length ===
    0
  ) {
    warnings.push(
      "No tracks could be generated with the current style blocks and filters.",
    );
  }

  return {
    tracks:
      generatedTracks,
    requestedCount,
    generatedCount:
      generatedTracks.length,
    warnings,
    estimatedDurationSeconds:
      generatedTracks.length *
      averagePlaySeconds,
    blocks:
      generatedBlocks,
  };
}
