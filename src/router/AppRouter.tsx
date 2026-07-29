import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";
import DashboardPage from "../pages/DashboardPage";
import ImportPage from "../pages/ImportPage";
import PlaylistDetailPage from "../pages/PlaylistDetailPage";
import PlaylistsPage from "../pages/PlaylistsPage";
import SettingsPage from "../pages/SettingsPage";
import TracksPage from "../pages/TracksPage";

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="/dashboard"
          element={<DashboardPage />}
        />

        <Route
          path="/playlists"
          element={<PlaylistsPage />}
        />

        <Route
          path="/playlists/:playlistId"
          element={<PlaylistDetailPage />}
        />

        <Route
          path="/tracks"
          element={<TracksPage />}
        />

        <Route
          path="/import"
          element={<ImportPage />}
        />

        <Route
          path="/settings"
          element={<SettingsPage />}
        />
      </Route>
    </Routes>
  );
}