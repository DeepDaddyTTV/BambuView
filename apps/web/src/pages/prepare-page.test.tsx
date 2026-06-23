import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";

import { PreparePage } from "./prepare-page";

afterEach(() => {
  vi.restoreAllMocks();
});

it("renders the staged prepare workspace", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "planned",
        headline: "Prepare & Slice is staged for the Orca/Prusa-derived workspace.",
        description: "placeholder",
        capabilities: ["3mf upload staging"]
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    )
  );

  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PreparePage />
    </QueryClientProvider>
  );

  expect(
    await screen.findByRole("heading", {
      name: "Prepare & Slice is staged for the Orca/Prusa-derived workspace."
    })
  ).toBeInTheDocument();
});
