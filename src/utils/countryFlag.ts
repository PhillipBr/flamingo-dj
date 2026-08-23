export function countryToFlag(
  countryCode?: string | null,
): string {
  if (!countryCode) {
    return "";
  }

  const code = countryCode
    .trim()
    .toUpperCase();

  if (code.length !== 2) {
    return "";
  }

  return code.replace(
    /./g,
    (character) =>
      String.fromCodePoint(
        127397 +
          character.charCodeAt(0),
      ),
  );
}