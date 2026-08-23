import { Bell, Search } from "lucide-react";

export default function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar__search">
        <Search size={18} aria-hidden="true" />

        <input
          type="search"
          placeholder="Search title, artist, album or keyword..."
          aria-label="Search music library"
        />

        <kbd>Ctrl K</kbd>
      </div>

      <div className="topbar__actions">
        <button
          className="topbar__icon-button"
          type="button"
          aria-label="Notifications"
        >
          <Bell size={19} />
        </button>

        <div className="topbar__user">
          <div className="topbar__avatar">FB</div>

          <div className="topbar__user-info">
            <strong>Felipe</strong>
            <span>Administrator</span>
          </div>
        </div>
      </div>
    </header>
  );
}