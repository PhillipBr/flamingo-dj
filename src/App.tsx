import {
  Route,
  Routes,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";

import DashboardPage from "./pages/DashboardPage";
import LivePage from "./pages/LivePage";
import PlaylistDetailPage from "./pages/PlaylistDetailPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import TracksPage from "./pages/TracksPage";

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <AppLayout />
        }
      >
        <Route
          index
          element={
            <DashboardPage />
          }
        />

   

        <Route
          path="playlists"
          element={
            <PlaylistsPage />
          }
        />

        <Route
          path="playlists/:playlistId"
          element={
            <PlaylistDetailPage />
          }
        />

        <Route
          path="tracks"
          element={
            <TracksPage />
          }
        />

        <Route
          path="live"
          element={
            <LivePage />
          }
        />
      </Route>
    </Routes>
  );
}