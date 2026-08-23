import type {
  AudienceEmergencyCandidate,
  AudienceEmergencyDecision,
  AudienceEmergencyAction,
  AudienceResponseEntry,
} from "../types/audienceResponse";

import type { LiveAdaptiveDirection } from "../types/liveAdaptiveDirection";
import type { Track } from "../types/track";

import {
  getTrackGenres,
  normalizeGenre,
  scoreSongMatch,
} from "./matchSongs";

function clamp(
  value: number,
  minimum = 0,
  maximum = 1,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getBpm(track: Track): number | null {
  return typeof track.tempo === "number" &&
    Number.isFinite(track.tempo)
    ? track.tempo
    : null;
}

function getEnergy(track: Track): number | null {
  return typeof track.energy === "number" &&
    Number.isFinite(track.energy)
    ? track.energy
    : null;
}

function getPopularity(track: Track): number | null {
  return typeof track.spotifyPopularity === "number" &&
    Number.isFinite(track.spotifyPopularity)
    ? track.spotifyPopularity
    : null;
}

function latestResponse(
  responses: readonly AudienceResponseEntry[],
): AudienceResponseEntry | null {
  return responses[responses.length - 1] ?? null;
}

function matchesTargetStyles(
  track: Track,
  adaptive: LiveAdaptiveDirection,
): boolean {
  const targets = adaptive.targetGenres
    .map(normalizeGenre)
    .filter(Boolean);

  if (targets.length === 0 || targets.includes("all")) {
    return true;
  }

  const genres = getTrackGenres(track)
    .map(normalizeGenre)
    .filter(Boolean);

  return targets.some((target) =>
    genres.some(
      (genre) =>
        genre === target ||
        genre.includes(target) ||
        target.includes(genre),
    ),
  );
}

function resolveDecision(
  response: AudienceResponseEntry | null,
  adaptive: LiveAdaptiveDirection,
): {
  action: AudienceEmergencyAction;
  title: string;
  explanation: string;
  confidence: number;
} {
  if (!response) {
    return {
      action: "keep-direction",
      title: "Waiting for crowd input",
      explanation:
        "Mark the crowd response to let Flamingo adapt its live recommendations.",
      confidence: 45,
    };
  }

  if (response.level === "great") {
    return {
      action: "keep-direction",
      title: "Keep the current direction",
      explanation:
        "The crowd response is strong. Preserve the current BPM and style direction, with only small Energy changes.",
      confidence: 94,
    };
  }

  if (response.level === "good") {
    const returnToPlan = adaptive.action === "return-to-plan";

    return {
      action: returnToPlan
        ? "return-to-plan"
        : "keep-direction",
      title: returnToPlan
        ? "Return gently to plan"
        : "Stay close to the current move",
      explanation: returnToPlan
        ? "The crowd is responding well, but the set is drifting from the Event Plan. Return without making an abrupt correction."
        : "The room is responding positively. Favor compatible BPM, familiar styles and controlled Energy movement.",
      confidence: 86,
    };
  }

  if (response.level === "neutral") {
    if (adaptive.action === "more-energy") {
      return {
        action: "raise-energy",
        title: "Raise Energy carefully",
        explanation:
          "The crowd response is neutral and the adaptive direction already indicates more Energy. Increase gradually while keeping BPM stable.",
        confidence: 88,
      };
    }

    if (adaptive.action === "change-style") {
      return {
        action: "change-style",
        title: "Try a compatible style change",
        explanation:
          "The crowd response is neutral and the recent sequence has stayed in one direction. Move to another style allowed by the current Event Plan phase.",
        confidence: 84,
      };
    }

    return {
      action: "increase-familiarity",
      title: "Increase familiarity",
      explanation:
        "The crowd is not rejecting the set, but the response is flat. Favor more popular tracks within the current BPM and style zone.",
      confidence: 82,
    };
  }

  if (adaptive.action === "return-to-plan") {
    return {
      action: "return-to-plan",
      title: "Return to the Event Plan now",
      explanation:
        "The crowd response is falling and the Current Set is also drifting from the planned BPM or styles. Use a safe track that satisfies both targets.",
      confidence: 97,
    };
  }

  if (adaptive.action === "less-energy") {
    return {
      action: "reduce-energy",
      title: "Reduce Energy and stabilize",
      explanation:
        "The room is losing response while the set is above the recent Energy average. Step down slightly and use a more familiar track.",
      confidence: 91,
    };
  }

  return {
    action: "play-a-hit",
    title: "Play a hit",
    explanation:
      "The crowd response is falling. Prioritize familiarity, strong popularity, stable BPM and a safe harmonic transition.",
    confidence: 96,
  };
}

function scoreCandidate(
  source: Track,
  candidate: Track,
  action: AudienceEmergencyAction,
  adaptive: LiveAdaptiveDirection,
): AudienceEmergencyCandidate | null {
  const match = scoreSongMatch(source, candidate, {
    mode:
      action === "change-style"
        ? "cross-style"
        : "same-style",
    minimumScore: 0,
    requireGenreMatch: false,
    maxBpmDifference: 28,
    maxEnergyDifference: 5,
    popularityPreference:
      action === "play-a-hit" ||
      action === "increase-familiarity"
        ? "higher"
        : "similar",
  });

  if (!match) {
    return null;
  }

  const sourceBpm = getBpm(source);
  const candidateBpm = getBpm(candidate);
  const sourceEnergy = getEnergy(source);
  const candidateEnergy = getEnergy(candidate);
  const popularity = getPopularity(candidate);

  const bpmDifference =
    sourceBpm !== null && candidateBpm !== null
      ? Math.abs(candidateBpm - sourceBpm)
      : 12;

  const bpmScore = clamp(1 - bpmDifference / 18);

  let energyScore = match.breakdown.energy;

  if (
    sourceEnergy !== null &&
    candidateEnergy !== null
  ) {
    const difference = candidateEnergy - sourceEnergy;

    if (action === "raise-energy") {
      energyScore =
        difference >= 0
          ? clamp(1 - Math.abs(difference - 0.8) / 3)
          : 0.1;
    }

    if (action === "reduce-energy") {
      energyScore =
        difference <= 0
          ? clamp(1 - Math.abs(difference + 0.7) / 3)
          : 0.1;
    }
  }

  const popularityScore =
    popularity === null ? 0.35 : clamp(popularity / 100);

  const styleMatch = matchesTargetStyles(
    candidate,
    adaptive,
  );

  const styleScore = styleMatch
    ? 1
    : match.breakdown.genre * 0.4;

  const inTargetBpm =
    adaptive.targetBpmMin === null ||
    adaptive.targetBpmMax === null ||
    candidateBpm === null ||
    (candidateBpm >= adaptive.targetBpmMin &&
      candidateBpm <= adaptive.targetBpmMax);

  let score =
    bpmScore * 0.28 +
    match.breakdown.camelot * 0.2 +
    energyScore * 0.13 +
    styleScore * 0.12 +
    popularityScore * 0.17 +
    match.score * 0.1;

  if (
    action === "play-a-hit" ||
    action === "increase-familiarity"
  ) {
    score =
      bpmScore * 0.26 +
      match.breakdown.camelot * 0.18 +
      energyScore * 0.1 +
      styleScore * 0.1 +
      popularityScore * 0.3 +
      match.score * 0.06;
  }

  if (action === "return-to-plan") {
    score =
      bpmScore * 0.22 +
      match.breakdown.camelot * 0.18 +
      energyScore * 0.1 +
      (inTargetBpm ? 1 : 0) * 0.22 +
      styleScore * 0.22 +
      popularityScore * 0.06;
  }

  let reason = "Safe BPM and harmonic transition.";

  if (action === "play-a-hit") {
    reason = `High familiarity priority${
      popularity === null
        ? ""
        : ` · Popularity ${Math.round(popularity)}`
    }.`;
  } else if (action === "increase-familiarity") {
    reason =
      "More familiar option inside the current direction.";
  } else if (action === "raise-energy") {
    reason =
      "Raises Energy while keeping BPM controlled.";
  } else if (action === "reduce-energy") {
    reason =
      "Reduces Energy without a large BPM move.";
  } else if (action === "return-to-plan") {
    reason =
      "Matches the current Event Plan BPM/style targets.";
  } else if (action === "change-style") {
    reason =
      "Compatible change toward another allowed style.";
  }

  return {
    track: candidate,
    score,
    percentage: Math.round(score * 100),
    popularityScore,
    bpmScore,
    energyScore,
    styleScore,
    reason,
  };
}

export function buildAudienceEmergencyDecision(
  currentTrack: Track | null,
  libraryTracks: readonly Track[],
  excludedTrackIds: ReadonlySet<string>,
  responses: readonly AudienceResponseEntry[],
  adaptive: LiveAdaptiveDirection,
): AudienceEmergencyDecision {
  const response = latestResponse(responses);
  const decision = resolveDecision(response, adaptive);

  const candidates = currentTrack
    ? libraryTracks
        .filter(
          (track) =>
            track.id !== currentTrack.id &&
            !excludedTrackIds.has(track.id),
        )
        .map((candidate) =>
          scoreCandidate(
            currentTrack,
            candidate,
            decision.action,
            adaptive,
          ),
        )
        .filter(
          (
            candidate,
          ): candidate is AudienceEmergencyCandidate =>
            candidate !== null,
        )
        .filter((candidate) => {
          if (decision.action === "play-a-hit") {
            return candidate.popularityScore >= 0.65;
          }

          if (decision.action === "return-to-plan") {
            return (
              candidate.styleScore >= 0.8 &&
              candidate.bpmScore >= 0.55
            );
          }

          return true;
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, 5)
    : [];

  return {
    action: decision.action,
    title: decision.title,
    explanation: decision.explanation,
    confidence: decision.confidence,
    activeResponse: response?.level ?? null,
    candidates,
  };
}
