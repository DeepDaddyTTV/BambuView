import { BellDot, Camera, FileCode2, Grid2x2, Menu, Settings, Users2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

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
    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
      {(["light", "dark"] as const).map((mode) => (
        <button
          className={`rounded-full px-5 py-2 text-sm transition ${
            appearance.mode === mode
              ? "bg-[color:var(--accent-soft)] text-white"
              : "text-zinc-400 hover:text-white"
          }`}
          key={mode}
          onClick={() => {
            void setMode(mode);
          }}
          type="button"
        >
          {mode === "light" ? "Light" : "Dark"}
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
  const location = useLocation();

  return (
    <div className="min-h-screen px-3 py-3 md:px-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1700px] overflow-hidden rounded-[34px] border border-white/8 bg-black/25 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <aside className="hidden w-[280px] border-r border-white/8 px-6 py-7 lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <LogoMark className="h-11 w-11 text-[color:var(--accent)]" />
            <div>
              <div className="text-4xl font-semibold tracking-tight text-white">
                Bambu<span className="text-[color:var(--accent)]">View</span>
              </div>
              <div className="text-sm text-zinc-500">Fleet orchestration</div>
            </div>
          </div>
          <nav className="mt-10 space-y-2">
            {navigationItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `nav-pill ${isActive ? "nav-pill--active" : ""}`
                }
                key={item.to}
                to={item.to}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-4">
            <div className="panel">
              <div className="flex items-center gap-2 text-[color:var(--accent)]">
                <BellDot className="h-4 w-4" />
                <span className="font-medium">All Systems Operational</span>
              </div>
              <div className="mt-2 text-sm text-zinc-400">12 Printers • 1 Farm • 8 Cameras</div>
              <div className="mt-4 h-12 rounded-2xl bg-[linear-gradient(90deg,rgba(126,211,33,0.18),rgba(126,211,33,0.02))]">
                <div className="system-sparkline" />
              </div>
            </div>
            <div className="panel flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--accent-soft)] text-xl font-semibold text-white">
                {user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </div>
              <div>
                <div className="font-medium text-white">{user.name}</div>
                <div className="text-sm capitalize text-zinc-400">{user.role}</div>
              </div>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-4 md:px-7 md:py-5">
            <div className="flex items-center gap-3">
              <button
                aria-label="Open navigation"
                className="icon-button lg:hidden"
                type="button"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <div className="text-sm text-zinc-500">BambuView</div>
                <h1 className="text-2xl font-semibold tracking-tight text-white md:text-4xl">
                  {title}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3 md:gap-5">
              <ModeToggle />
              <div className="hidden text-right md:block">
                <div className="font-medium text-white">{user.name}</div>
                <div className="text-sm capitalize text-zinc-400">{user.role}</div>
              </div>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-7">
            {children}
          </main>
          <nav className="mobile-nav lg:hidden">
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
      {location.pathname === "/fleet" ? null : <div className="pb-24 lg:hidden" />}
    </div>
  );
}
