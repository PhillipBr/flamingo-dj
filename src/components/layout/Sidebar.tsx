import {
  Disc3,
  LayoutDashboard,
  ListMusic,
  Radio,
} from "lucide-react";

import {
  NavLink,
} from "react-router-dom";

import flamingoLogoUrl from "../../assets/branding/flamingo-logo.png";

import HarmonicWheelPanel from "../harmonic/HarmonicWheelPanel";

import "./SidebarEnhancements.css";

const navigationItems = [
  {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/playlists",
    label: "Playlists",
    icon: ListMusic,
    end: false,
  },
  {
    to: "/tracks",
    label: "Tracks",
    icon: Disc3,
    end: false,
  },
  {
    to: "/live",
    label: "Live",
    icon: Radio,
    end: false,
  },
];

export default function Sidebar() {
  return (
    <aside
      className="sidebar"
      aria-label="Primary navigation"
    >
      <div className="sidebar__brand sidebar__brand--flamingo">
        <div className="sidebar__brand-logo">
          <img
            src={
              flamingoLogoUrl
            }
            alt="Flamingo DJ"
          />
        </div>

        <div className="sidebar__brand-copy">
          <strong>
            Flamingo
          </strong>

          <span>
            DJ
          </span>
        </div>
      </div>

      <nav
        className="sidebar__nav"
        aria-label="Main"
      >
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
                aria-hidden="true"
              />

              <span>
                {label}
              </span>
            </NavLink>
          ),
        )}
      </nav>

      <div className="sidebar__dj-tools">
        <span className="sidebar__dj-tools-label">
          DJ TOOLS
        </span>

        <HarmonicWheelPanel />
      </div>
    </aside>
  );
}
