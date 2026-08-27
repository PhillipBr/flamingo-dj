import {
  useEffect,
} from "react";

import {
  handleSpotifyOAuthCallback,
} from "../../utils/spotifyApi";

/*
 * This component must be mounted once in AppLayout.
 *
 * React.StrictMode may mount/evaluate effects twice during development.
 * spotifyApi.ts protects the OAuth exchange with a shared in-flight promise,
 * so calling handleSpotifyOAuthCallback() twice is safe.
 */
export default function SpotifyOAuthBridge() {
  useEffect(() => {
    void handleSpotifyOAuthCallback()
      .catch(
        (error) => {
          const message =
            error instanceof Error
              ? error.message
              : String(
                  error,
                );

          console.error(
            "Spotify OAuth callback failed:",
            error,
          );

          window.alert(
            message,
          );
        },
      );
  }, []);

  return null;
}
