import { Bell } from "lucide-react";

export default function Topbar() {
  return (
    <header className="topbar">
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
