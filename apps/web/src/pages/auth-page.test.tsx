import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";

import { AuthPage } from "./auth-page";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWithProviders(path = "/auth") {
  const client = new QueryClient();

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

it("shows bootstrap copy when bootstrap is required", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        authenticated: false,
        bootstrapRequired: true,
        user: null,
        appearance: null
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    )
  );

  renderWithProviders();

  expect(await screen.findByText("Create the first admin")).toBeInTheDocument();
});

it("shows invite signup copy for invite routes", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        authenticated: false,
        bootstrapRequired: false,
        user: null,
        appearance: null
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    )
  );

  renderWithProviders("/auth/invite/550e8400-e29b-41d4-a716-446655440000?token=invite-token-123456789");

  expect(await screen.findByText("Finish your invited account")).toBeInTheDocument();
});
