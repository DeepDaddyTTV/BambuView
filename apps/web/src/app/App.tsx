import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { DEFAULT_APPEARANCE, type AuthSession } from "@bambuview/contracts";

import { AppearanceProvider } from "./appearance";
import { AppShell } from "../components/shell";
import { AuthPage } from "../pages/auth-page";
import { CamerasPage } from "../pages/cameras-page";
import { FleetPage } from "../pages/fleet-page";
import { PreparePage } from "../pages/prepare-page";
import { SettingsPage } from "../pages/settings-page";
import { UsersPage } from "../pages/users-page";
import { apiFetch } from "../lib/api";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<AuthSession>("/api/auth/session")
  });

  if (sessionQuery.isLoading || !sessionQuery.data) {
    return <div className="panel m-4">Loading BambuView…</div>;
  }

  if (!sessionQuery.data.authenticated || !sessionQuery.data.user) {
    return <Navigate replace to="/auth" />;
  }

  return (
    <AppearanceProvider initialAppearance={sessionQuery.data.appearance ?? DEFAULT_APPEARANCE}>
      <Routes>
        <Route
          path="/"
          element={
            <AppShell
              title="Fleet"
              user={sessionQuery.data.user}
            >
              <FleetPage />
            </AppShell>
          }
        />
        <Route
          path="/fleet"
          element={
            <AppShell
              title="Fleet"
              user={sessionQuery.data.user}
            >
              <FleetPage />
            </AppShell>
          }
        />
        <Route
          path="/cameras"
          element={
            <AppShell
              title="Cameras"
              user={sessionQuery.data.user}
            >
              <CamerasPage />
            </AppShell>
          }
        />
        <Route
          path="/users"
          element={
            <AppShell
              title="Users"
              user={sessionQuery.data.user}
            >
              <UsersPage currentUser={sessionQuery.data.user} />
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell
              title="Appearance"
              user={sessionQuery.data.user}
            >
              <SettingsPage />
            </AppShell>
          }
        />
        <Route
          path="/prepare"
          element={
            <AppShell
              title="Prepare & Slice"
              user={sessionQuery.data.user}
            >
              <PreparePage />
            </AppShell>
          }
        />
        <Route
          path="*"
          element={<Navigate replace to="/fleet" />}
        />
      </Routes>
    </AppearanceProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/auth"
            element={<AuthPage />}
          />
          <Route
            path="/auth/invite/:inviteId"
            element={<AuthPage />}
          />
          <Route
            path="*"
            element={<ProtectedRoutes />}
          />
        </Routes>
        <Outlet />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
