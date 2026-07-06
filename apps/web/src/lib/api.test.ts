import { afterEach, expect, it, vi } from "vitest";

import { apiFetch } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

it("does not send a JSON content-type header for empty post requests", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ pairingCode: { code: "abc" } }), {
      headers: { "Content-Type": "application/json" },
      status: 201,
    }),
  );

  await apiFetch("/api/companions/pairing-codes", {
    method: "POST",
  });

  expect(fetchSpy).toHaveBeenCalledWith(
    "/api/companions/pairing-codes",
    expect.objectContaining({
      credentials: "include",
      headers: expect.any(Headers),
      method: "POST",
    }),
  );

  const requestHeaders = fetchSpy.mock.calls[0]?.[1]?.headers;
  expect(requestHeaders).toBeInstanceOf(Headers);
  expect((requestHeaders as Headers).has("Content-Type")).toBe(false);
});

it("adds a JSON content-type header when a request body is present", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
  );

  await apiFetch("/api/example", {
    body: JSON.stringify({ test: true }),
    method: "POST",
  });

  const requestHeaders = fetchSpy.mock.calls[0]?.[1]?.headers;
  expect(requestHeaders).toBeInstanceOf(Headers);
  expect((requestHeaders as Headers).get("Content-Type")).toBe(
    "application/json",
  );
});

it("preserves caller headers while still adding JSON for body requests", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
  );

  await apiFetch("/api/example", {
    body: JSON.stringify({ test: true }),
    headers: {
      "X-BambuView-Test": "1",
    },
    method: "POST",
  });

  const requestHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
  expect(requestHeaders.get("Content-Type")).toBe("application/json");
  expect(requestHeaders.get("X-BambuView-Test")).toBe("1");
});

it("does not force JSON content-type for form-data bodies", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
  );

  const body = new FormData();
  body.set("token", "abc");

  await apiFetch("/api/upload", {
    body,
    method: "POST",
  });

  const requestHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
  expect(requestHeaders.has("Content-Type")).toBe(false);
});
