import {
  Outlet,
} from "react-router-dom";

import SpotifyOAuthBridge from "../integrations/SpotifyOAuthBridge";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  return (
    <div className="app-layout">
      <SpotifyOAuthBridge />

      <Sidebar />

      <div className="app-main">
        <Topbar />

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
