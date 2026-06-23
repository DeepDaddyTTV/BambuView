import {
  Camera,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileCode2,
  Grid2x2,
  Moon,
  Palette,
  Settings,
  SunMedium,
  Users2
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import type { UserProfile } from "@bambuview/contracts";

import { useAppearance } from "../app/appearance";
import { LogoMark } from "./art";

const navigationItems = [
  { icon: Grid2x2, label: "Fleet", to: "/fleet" },
  { icon: FileCode2, label: "Prepare & Slice", to: "/prepare" },
  { icon: Camera, label: "Cameras", to: "/cameras" },
  { icon: Users2, label: "Users", to: "/users" },
  { icon: Settings, label: "Settings", to: "/settings" }
];

const shellDescriptions: Record<string, string> = {
  Appearance: "Tune the approved shell and personalize how the app feels day to day.",
  Cameras: "Assign feeds, check stream health, and map cameras to printers or farms.",
  "Prepare & Slice": "Stage print jobs and prep your next release-ready plate.",
  Users: "Manage invites, roles, and who can operate your fleet."
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ModeToggle() {
  const { appearance, updateAppearance } = useAppearance();

  async function setMode(mode: "dark" | "light") {
    if (mode === appearance.mode) {
      return;
    }

    await updateAppearance({
      ...appearance,
      mode
    });
  }

  return (
    <div className="fleet-console-toolbar__group">
      {([
        { icon: Moon, key: "dark", label: "Dark" },
        { icon: SunMedium, key: "light", label: "Light" }
      ] as const).map((mode) => (
        <button
          className={`fleet-console-toolbar__mode ${appearance.mode === mode.key ? "fleet-console-toolbar__mode--active" : ""}`}
          key={mode.key}
          onClick={() => {
            void setMode(mode.key);
          }}
          type="button"
        >
          <mode.icon className="h-4 w-4" />
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
}

export function AppShell({
  children,
  title,
  user
}: {
  children: React.ReactNode;
  title: string;
  user: UserProfile;
}) {
  return (
    <div className="fleet-console-shell fleet-console-shell--detail-closed">
      <aside className="fleet-console-sidebar">
        <div className="fleet-console-sidebar__brand">
          <LogoMark className="h-11 w-11 text-[color:var(--accent)]" />
          <div className="fleet-console-sidebar__brand-text">
            Bambu<span>View</span>
          </div>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </div>

        <nav className="fleet-console-sidebar__nav">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive
                  ? "fleet-console-sidebar__link fleet-console-sidebar__link--active"
                  : "fleet-console-sidebar__link"
              }
              key={item.to}
              to={item.to}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="fleet-console-sidebar__spacer" />

        <section className="fleet-console-sidebar-card">
          <div className="fleet-console-sidebar-card__headline">
            <span className="fleet-console-dot fleet-console-dot--green" />
            <span>All Systems Operational</span>
          </div>
          <div className="fleet-console-sidebar-card__copy">12 Printers • 1 Farm • 8 Cameras</div>
          <div className="fleet-console-sidebar-card__copy">Updated just now</div>
          <div className="fleet-console-sidebar-card__sparkline" />
        </section>

        <section className="fleet-console-sidebar-card fleet-console-sidebar-card--compact">
          <div className="fleet-console-sidebar-card__row">
            <div>
              <div className="fleet-console-sidebar-card__headline">Need help?</div>
              <div className="fleet-console-sidebar-card__copy">Browse docs and guides</div>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-500" />
          </div>
        </section>

        <section className="fleet-console-sidebar-card fleet-console-sidebar-card--compact">
          <div className="fleet-console-sidebar-card__row">
            <div>
              <div className="fleet-console-sidebar-card__headline">Check for Updates</div>
              <div className="fleet-console-sidebar-card__copy">New builds and release notes</div>
            </div>
            <CircleHelp className="h-4 w-4 text-zinc-500" />
          </div>
        </section>

        <section className="fleet-console-sidebar-card fleet-console-sidebar-card--compact">
          <div className="fleet-console-user">
            <div className="fleet-console-user__avatar">{initials(user.name)}</div>
            <div className="fleet-console-user__copy">
              <div className="fleet-console-user__name">{user.name}</div>
              <div className="fleet-console-user__role">Administrator</div>
            </div>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </div>
        </section>
      </aside>

      <div className="fleet-console-content app-shell-console__content">
        <header className="fleet-console-header app-shell-console__header">
          <div>
            <h1>{title}</h1>
            <p>{shellDescriptions[title]}</p>
          </div>
          <div className="fleet-console-header__actions">
            <ModeToggle />
            <Link className="fleet-console-toolbar__button" to="/settings">
              <Palette className="h-4 w-4" />
              <span>Appearance</span>
            </Link>
          </div>
        </header>

        <main className="app-shell-console__body">{children}</main>

        <nav className="mobile-nav app-shell-mobile-nav">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `mobile-nav__item ${isActive ? "mobile-nav__item--active" : ""}`
              }
              key={item.to}
              to={item.to}
            >
              <item.icon className="h-5 w-5" />
              {item.label.replace(" & Slice", "")}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
