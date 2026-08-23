export type SafeStorageReadResult<T> = {
  value: T;
  ok: boolean;
  error: string | null;
};

export function safeReadJson<T>(
  key: string,
  fallback: T,
): SafeStorageReadResult<T> {
  try {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return {
        value: fallback,
        ok: true,
        error: null,
      };
    }

    return {
      value: JSON.parse(raw) as T,
      ok: true,
      error: null,
    };
  } catch (error) {
    return {
      value: fallback,
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to parse localStorage value.",
    };
  }
}

export function safeWriteJson(
  key: string,
  value: unknown,
): boolean {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value),
    );

    return true;
  } catch (error) {
    console.error(
      `Unable to write localStorage key "${key}".`,
      error,
    );

    return false;
  }
}

export function safeRemoveStorage(
  key: string,
): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(
      `Unable to remove localStorage key "${key}".`,
      error,
    );

    return false;
  }
}

export function getLocalStorageUsage(): {
  entries: number;
  bytes: number;
} {
  let bytes = 0;

  for (
    let index = 0;
    index < localStorage.length;
    index += 1
  ) {
    const key =
      localStorage.key(index);

    if (!key) {
      continue;
    }

    const value =
      localStorage.getItem(key) ??
      "";

    bytes +=
      new Blob([
        key,
        value,
      ]).size;
  }

  return {
    entries:
      localStorage.length,

    bytes,
  };
}
