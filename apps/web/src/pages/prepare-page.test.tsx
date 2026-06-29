import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";

import { PreparePage } from "./prepare-page";

afterEach(() => {
  vi.restoreAllMocks();
});

it("renders the Bambu Connect prepare handoff", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "planned",
        headline: "Prepare files and hand them to Bambu Connect.",
        description: "Bambu Connect handoff",
        capabilities: ["Bambu Connect import-file URL generation"],
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    ),
  );

  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PreparePage />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByRole("heading", {
      name: "Prepare files and hand them to Bambu Connect.",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Generate Bambu Connect Link" }),
  ).toBeInTheDocument();
});
