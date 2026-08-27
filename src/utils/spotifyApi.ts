import type { Track } from "../types/track";

const SPOTIFY_AUTHORIZE_URL =
  "https://accounts.spotify.com/authorize";

const SPOTIFY_TOKEN_URL =
  "https://accounts.spotify.com/api/token";

const SPOTIFY_API_BASE =
  "https://api.spotify.com/v1";

const ACCESS_TOKEN_KEY =
  "flamingo-dj-spotify-access-token-v1";

const REFRESH_TOKEN_KEY =
  "flamingo-dj-spotify-refresh-token-v1";

const EXPIRES_AT_KEY =
  "flamingo-dj-spotify-expires-at-v1";

const PKCE_VERIFIER_KEY =
  "flamingo-dj-spotify-pkce-verifier-v1";

const OAUTH_STATE_KEY =
  "flamingo-dj-spotify-oauth-state-v1";

const RETURN_HASH_KEY =
  "flamingo-dj-spotify-return-hash-v1";

export const SPOTIFY_AUTH_CHANGED_EVENT =
  "flamingo-dj-spotify-auth-changed";

const SPOTIFY_SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type SpotifyCreatedPlaylistResponse = {
  id: string;

  external_urls?: {
    spotify?: string;
  };
};

export type SpotifyCreatePlaylistResult = {
  playlistId: string;
  playlistUrl: string | null;

  requestedTracks: number;
  validSpotifyTracks: number;
  addedTracks: number;

  skippedTracks: Array<{
    id: string;
    title: string;
    artist: string;
    reason: string;
  }>;
};

/*
 * React.StrictMode can execute effects twice in development.
 *
 * Keep one callback promise at module level so the same Spotify
 * authorization code is never exchanged twice simultaneously.
 */
let oauthCallbackPromise:
  Promise<boolean> | null = null;

function getSpotifyClientId(): string {
  return String(
    import.meta.env
      .VITE_SPOTIFY_CLIENT_ID ??
      "",
  ).trim();
}

export function getSpotifyRedirectUri(): string {
  const configured =
    String(
      import.meta.env
        .VITE_SPOTIFY_REDIRECT_URI ??
        "",
    ).trim();

  if (configured) {
    return configured;
  }

  return new URL(
    import.meta.env.BASE_URL,
    window.location.origin,
  ).toString();
}

export function isSpotifyConfigured(): boolean {
  return Boolean(
    getSpotifyClientId(),
  );
}

export function isSpotifyConnected(): boolean {
  return Boolean(
    window.localStorage.getItem(
      ACCESS_TOKEN_KEY,
    ) ||
      window.localStorage.getItem(
        REFRESH_TOKEN_KEY,
      ),
  );
}

function emitAuthChanged(): void {
  window.dispatchEvent(
    new Event(
      SPOTIFY_AUTH_CHANGED_EVENT,
    ),
  );
}

function clearSpotifyTokens(): void {
  window.localStorage.removeItem(
    ACCESS_TOKEN_KEY,
  );

  window.localStorage.removeItem(
    REFRESH_TOKEN_KEY,
  );

  window.localStorage.removeItem(
    EXPIRES_AT_KEY,
  );

  emitAuthChanged();
}

function clearOAuthSession(): void {
  window.sessionStorage.removeItem(
    OAUTH_STATE_KEY,
  );

  window.sessionStorage.removeItem(
    PKCE_VERIFIER_KEY,
  );

  window.sessionStorage.removeItem(
    RETURN_HASH_KEY,
  );
}

export function disconnectSpotify(): void {
  clearSpotifyTokens();
  clearOAuthSession();
}

function randomString(
  length: number,
): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const values =
    new Uint32Array(
      length,
    );

  window.crypto.getRandomValues(
    values,
  );

  return Array.from(
    values,
    (value) =>
      alphabet[
        value %
          alphabet.length
      ],
  ).join("");
}

function base64UrlEncode(
  buffer: ArrayBuffer,
): string {
  const bytes =
    new Uint8Array(
      buffer,
    );

  let binary = "";

  for (
    const byte of bytes
  ) {
    binary +=
      String.fromCharCode(
        byte,
      );
  }

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createPkceChallenge(
  verifier: string,
): Promise<string> {
  const encoded =
    new TextEncoder().encode(
      verifier,
    );

  const digest =
    await window.crypto.subtle.digest(
      "SHA-256",
      encoded,
    );

  return base64UrlEncode(
    digest,
  );
}

function saveTokenResponse(
  token:
    SpotifyTokenResponse,
): void {
  const expiresAt =
    Date.now() +
    Math.max(
      30,
      token.expires_in - 60,
    ) *
      1000;

  window.localStorage.setItem(
    ACCESS_TOKEN_KEY,
    token.access_token,
  );

  window.localStorage.setItem(
    EXPIRES_AT_KEY,
    String(
      expiresAt,
    ),
  );

  /*
   * Spotify may omit refresh_token when refreshing.
   * Preserve the existing refresh token in that case.
   */
  if (
    token.refresh_token
  ) {
    window.localStorage.setItem(
      REFRESH_TOKEN_KEY,
      token.refresh_token,
    );
  }

  emitAuthChanged();
}

export async function beginSpotifyAuthorization(
  returnHash = "#/live",
): Promise<void> {
  const clientId =
    getSpotifyClientId();

  if (!clientId) {
    throw new Error(
      "VITE_SPOTIFY_CLIENT_ID is not configured.",
    );
  }

  const verifier =
    randomString(
      96,
    );

  const challenge =
    await createPkceChallenge(
      verifier,
    );

  const state =
    randomString(
      32,
    );

  /*
   * Clean stale OAuth data before creating a new authorization.
   */
  clearOAuthSession();

  window.sessionStorage.setItem(
    PKCE_VERIFIER_KEY,
    verifier,
  );

  window.sessionStorage.setItem(
    OAUTH_STATE_KEY,
    state,
  );

  window.sessionStorage.setItem(
    RETURN_HASH_KEY,
    returnHash,
  );

  const authUrl =
    new URL(
      SPOTIFY_AUTHORIZE_URL,
    );

  authUrl.search =
    new URLSearchParams({
      client_id:
        clientId,

      response_type:
        "code",

      redirect_uri:
        getSpotifyRedirectUri(),

      scope:
        SPOTIFY_SCOPES,

      state,

      code_challenge_method:
        "S256",

      code_challenge:
        challenge,
    }).toString();

  window.location.assign(
    authUrl.toString(),
  );
}

async function processSpotifyOAuthCallback(): Promise<boolean> {
  const params =
    new URLSearchParams(
      window.location.search,
    );

  const code =
    params.get(
      "code",
    );

  const returnedState =
    params.get(
      "state",
    );

  const oauthError =
    params.get(
      "error",
    );

  /*
   * Normal application load.
   * There is no Spotify OAuth callback to process.
   */
  if (
    !code &&
    !oauthError
  ) {
    return false;
  }

  const expectedState =
    window.sessionStorage.getItem(
      OAUTH_STATE_KEY,
    );

  const verifier =
    window.sessionStorage.getItem(
      PKCE_VERIFIER_KEY,
    );

  const returnHash =
    window.sessionStorage.getItem(
      RETURN_HASH_KEY,
    ) ||
    "#/live";

  if (oauthError) {
    clearOAuthSession();

    const message =
      params.get(
        "error_description",
      ) ||
      oauthError;

    console.error(
      "Spotify authorization error:",
      message,
    );

    /*
     * Remove OAuth query parameters and return to Live.
     */
    window.location.replace(
      `${getSpotifyRedirectUri()}${returnHash}`,
    );

    return true;
  }

  /*
   * Explicit validation is important for TypeScript and OAuth safety.
   */
  if (!code) {
    throw new Error(
      "Spotify authorization code is missing. Start the connection again.",
    );
  }

  if (
    !returnedState ||
    !expectedState ||
    returnedState !==
      expectedState
  ) {
    throw new Error(
      "Spotify OAuth state mismatch. Start the connection again.",
    );
  }

  if (!verifier) {
    throw new Error(
      "Spotify PKCE verifier is missing. Start the connection again.",
    );
  }

  const clientId =
    getSpotifyClientId();

  if (!clientId) {
    throw new Error(
      "VITE_SPOTIFY_CLIENT_ID is not configured.",
    );
  }

  /*
   * IMPORTANT:
   * Do NOT clear verifier/state before this request succeeds.
   *
   * In React.StrictMode the OAuth bridge can mount twice.
   * Clearing early caused the second effect to see missing OAuth state
   * while the first request was still in progress.
   */
  const response =
    await fetch(
      SPOTIFY_TOKEN_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          new URLSearchParams({
            client_id:
              clientId,

            grant_type:
              "authorization_code",

            code,

            redirect_uri:
              getSpotifyRedirectUri(),

            code_verifier:
              verifier,
          }),
      },
    );

  let body:
    SpotifyTokenResponse & {
      error?: string;
      error_description?: string;
    };

  try {
    body =
      await response.json();
  } catch {
    throw new Error(
      `Spotify token exchange failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.ok) {
    /*
     * Keep state/verifier available while reporting the failure.
     * This is useful for debugging and avoids destroying OAuth context
     * before we know what went wrong.
     */
    throw new Error(
      `Spotify authorization failed: ${
        body.error_description ??
        body.error ??
        response.status
      }`,
    );
  }

  if (
    !body.access_token
  ) {
    throw new Error(
      "Spotify token response did not contain an access token.",
    );
  }

  /*
   * Persist tokens FIRST.
   */
  saveTokenResponse(
    body,
  );

  /*
   * Only after token persistence succeeds do we clear PKCE state.
   */
  clearOAuthSession();

  /*
   * Verify persistence before removing OAuth query parameters.
   */
  if (
    !isSpotifyConnected()
  ) {
    throw new Error(
      "Spotify token was received but could not be persisted locally.",
    );
  }

  /*
   * Remove ?code=...&state=... and return to Live.
   * HashRouter then opens the Live page.
   */
  window.location.replace(
    `${getSpotifyRedirectUri()}${returnHash}`,
  );

  return true;
}

export function handleSpotifyOAuthCallback(): Promise<boolean> {
  if (
    oauthCallbackPromise
  ) {
    return oauthCallbackPromise;
  }

  oauthCallbackPromise =
    processSpotifyOAuthCallback()
      .finally(
        () => {
          oauthCallbackPromise =
            null;
        },
      );

  return oauthCallbackPromise;
}

async function refreshSpotifyAccessToken(): Promise<string> {
  const refreshToken =
    window.localStorage.getItem(
      REFRESH_TOKEN_KEY,
    );

  if (!refreshToken) {
    clearSpotifyTokens();

    throw new Error(
      "Spotify session expired. Connect Spotify again.",
    );
  }

  const clientId =
    getSpotifyClientId();

  if (!clientId) {
    throw new Error(
      "VITE_SPOTIFY_CLIENT_ID is not configured.",
    );
  }

  const response =
    await fetch(
      SPOTIFY_TOKEN_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          new URLSearchParams({
            grant_type:
              "refresh_token",

            refresh_token:
              refreshToken,

            client_id:
              clientId,
          }),
      },
    );

  let body:
    SpotifyTokenResponse & {
      error?: string;
      error_description?: string;
    };

  try {
    body =
      await response.json();
  } catch {
    throw new Error(
      `Spotify refresh failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.ok) {
    if (
      body.error ===
      "invalid_grant"
    ) {
      clearSpotifyTokens();

      throw new Error(
        "Spotify authorization expired. Connect Spotify again.",
      );
    }

    throw new Error(
      `Spotify refresh failed: ${
        body.error_description ??
        body.error ??
        response.status
      }`,
    );
  }

  if (
    !body.access_token
  ) {
    throw new Error(
      "Spotify refresh response did not contain an access token.",
    );
  }

  saveTokenResponse(
    body,
  );

  return body.access_token;
}

export async function getValidSpotifyAccessToken(): Promise<string> {
  const accessToken =
    window.localStorage.getItem(
      ACCESS_TOKEN_KEY,
    );

  const expiresAt =
    Number(
      window.localStorage.getItem(
        EXPIRES_AT_KEY,
      ) ||
        0,
    );

  if (
    accessToken &&
    Date.now() <
      expiresAt
  ) {
    return accessToken;
  }

  return refreshSpotifyAccessToken();
}

async function spotifyFetch(
  path: string,
  init:
    RequestInit = {},
  retryUnauthorized = true,
  retryRateLimit = true,
): Promise<Response> {
  const token =
    await getValidSpotifyAccessToken();

  const headers =
    new Headers(
      init.headers,
    );

  headers.set(
    "Authorization",
    `Bearer ${token}`,
  );

  if (
    init.body &&
    !headers.has(
      "Content-Type",
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response =
    await fetch(
      `${SPOTIFY_API_BASE}${path}`,
      {
        ...init,
        headers,
      },
    );

  if (
    response.status === 401 &&
    retryUnauthorized
  ) {
    window.localStorage.removeItem(
      ACCESS_TOKEN_KEY,
    );

    window.localStorage.removeItem(
      EXPIRES_AT_KEY,
    );

    await refreshSpotifyAccessToken();

    return spotifyFetch(
      path,
      init,
      false,
      retryRateLimit,
    );
  }

  if (
    response.status === 429 &&
    retryRateLimit
  ) {
    const retryAfter =
      Math.max(
        1,
        Number(
          response.headers.get(
            "Retry-After",
          ) ||
            1,
        ),
      );

    await new Promise(
      (resolve) =>
        window.setTimeout(
          resolve,
          retryAfter *
            1000,
        ),
    );

    return spotifyFetch(
      path,
      init,
      retryUnauthorized,
      false,
    );
  }

  return response;
}

async function spotifyApiError(
  response: Response,
): Promise<Error> {
  let detail =
    `${response.status} ${response.statusText}`;

  try {
    const body =
      await response.json();

    detail =
      body?.error?.message ??
      body?.error_description ??
      body?.error ??
      detail;
  } catch {
    // Keep HTTP status.
  }

  return new Error(
    `Spotify API error: ${detail}`,
  );
}

export function spotifyTrackUrlToUri(
  value:
    | string
    | null
    | undefined,
): string | null {
  const raw =
    String(
      value ??
        "",
    ).trim();

  if (!raw) {
    return null;
  }

  const uriMatch =
    raw.match(
      /^spotify:track:([A-Za-z0-9]+)$/i,
    );

  if (uriMatch) {
    return `spotify:track:${uriMatch[1]}`;
  }

  try {
    const url =
      new URL(
        raw,
      );

    if (
      !url.hostname
        .toLowerCase()
        .endsWith(
          "spotify.com",
        )
    ) {
      return null;
    }

    const pathMatch =
      url.pathname.match(
        /\/track\/([A-Za-z0-9]+)/i,
      );

    if (!pathMatch) {
      return null;
    }

    return `spotify:track:${pathMatch[1]}`;
  } catch {
    return null;
  }
}

function chunk<T>(
  values: T[],
  size: number,
): T[][] {
  const output:
    T[][] = [];

  for (
    let index = 0;
    index <
    values.length;
    index += size
  ) {
    output.push(
      values.slice(
        index,
        index + size,
      ),
    );
  }

  return output;
}

export async function createSpotifyPlaylistFromTracks(
  options: {
    name: string;
    description?: string;
    isPublic: boolean;
    tracks: Track[];
  },
): Promise<SpotifyCreatePlaylistResult> {
  if (
    !isSpotifyConfigured()
  ) {
    throw new Error(
      "Spotify is not configured. Add VITE_SPOTIFY_CLIENT_ID.",
    );
  }

  const valid: Array<{
    track: Track;
    uri: string;
  }> = [];

  const skipped:
    SpotifyCreatePlaylistResult["skippedTracks"] =
      [];

  for (
    const track of
    options.tracks
  ) {
    const uri =
      spotifyTrackUrlToUri(
        track.spotifyUrl,
      );

    if (!uri) {
      skipped.push({
        id:
          track.id,

        title:
          track.title,

        artist:
          track.artist,

        reason:
          "Missing or invalid Spotify URL",
      });

      continue;
    }

    valid.push({
      track,
      uri,
    });
  }

  if (
    valid.length ===
    0
  ) {
    throw new Error(
      "No generated track has a valid Spotify URL.",
    );
  }

  const createResponse =
    await spotifyFetch(
      "/me/playlists",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            name:
              options.name,

            public:
              options.isPublic,

            collaborative:
              false,

            description:
              options.description ??
              "Generated with Flamingo DJ.",
          }),
      },
    );

  if (
    !createResponse.ok
  ) {
    throw await spotifyApiError(
      createResponse,
    );
  }

  const created =
    await createResponse.json() as
      SpotifyCreatedPlaylistResponse;

  let addedTracks = 0;

  /*
   * Send sequential batches so Spotify preserves Flamingo Play Order.
   */
  for (
    const batch of
    chunk(
      valid,
      100,
    )
  ) {
    const addResponse =
      await spotifyFetch(
        `/playlists/${encodeURIComponent(
          created.id,
        )}/items`,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              uris:
                batch.map(
                  (item) =>
                    item.uri,
                ),
            }),
        },
      );

    if (
      !addResponse.ok
    ) {
      throw await spotifyApiError(
        addResponse,
      );
    }

    addedTracks +=
      batch.length;
  }

  return {
    playlistId:
      created.id,

    playlistUrl:
      created.external_urls
        ?.spotify ??
      null,

    requestedTracks:
      options.tracks.length,

    validSpotifyTracks:
      valid.length,

    addedTracks,

    skippedTracks:
      skipped,
  };
}
