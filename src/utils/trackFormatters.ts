export function formatDuration(
  seconds: number | null,
): string {
  if (
    seconds === null ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "—";
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export function formatTempo(
  tempo: number | null,
): string {
  if (
    tempo === null ||
    !Number.isFinite(tempo)
  ) {
    return "—";
  }

  return Math.round(tempo).toString();
}

export function formatDate(
  date: string | null,
): string {
  if (!date) {
    return "—";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
  }).format(parsedDate);
}

export function formatFollowers(
  followers: number | null,
): string {
  if (
    followers === null ||
    !Number.isFinite(followers)
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-CA", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(followers);
}

export function formatOverallVolume(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${value.toFixed(1)} dB`;
}