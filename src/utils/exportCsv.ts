function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text =
    Array.isArray(value)
      ? value.join(" | ")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function objectsToCsv(
  rows: readonly Record<string, unknown>[],
): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row)),
    ),
  );

  return [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsv(row[header]))
        .join(","),
    ),
  ].join("\r\n");
}
