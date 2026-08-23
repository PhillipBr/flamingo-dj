import {
  Disc3,
  LayoutDashboard,
  ListMusic,
  Radio,
} from "lucide-react";

import {
  NavLink,
} from "react-router-dom";

const navigationItems = [
  {
    to: "/",
    label: "Dashboard",
    icon:
      LayoutDashboard,
    end: true,
  },

  {
    to: "/playlists",
    label: "Playlists",
    icon:
      ListMusic,
    end: false,
  },

  {
    to: "/tracks",
    label: "Tracks",
    icon:
      Disc3,
    end: false,
  },

  {
    to: "/live",
    label: "Live",
    icon:
      Radio,
    end: false,
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark">
          F
        </div>

        <div>
          <strong>
            Flamingo
          </strong>

          <span>
            DJ
          </span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navigationItems.map(
          ({
            to,
            label,
            icon: Icon,
            end,
          }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({
                isActive,
              }) =>
                isActive
                  ? "sidebar__link sidebar__link--active"
                  : "sidebar__link"
              }
            >
              <Icon
                size={18}
              />

              <span>
                {label}
              </span>
            </NavLink>
          ),
        )}
      </nav>
    </aside>
  );
}
