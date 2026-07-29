import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <strong>FlamingoApp DJ</strong>
      </div>

      <nav className="sidebar__nav">
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/playlists">Playlists</NavLink>
        <NavLink to="/tracks">Tracks</NavLink>
        <NavLink to="/import">Import</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </aside>
  );
}