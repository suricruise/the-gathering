// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
import { environmentIssues } from "../../../scripts/check-environment.mjs";
import { operationalEvent } from "./monitoring";
const m = vi.hoisted(() => ({ rpc: vi.fn(), rooms: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: m.rpc }),
}));
vi.mock("@/src/lib/voice/server", () => ({
  roomService: () => ({ listRooms: m.rooms }),
}));
import { GET } from "../../../app/api/ops/health/route";
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  process.env.OPS_HEALTH_TOKEN = "a".repeat(40);
  m.rpc.mockReturnValue({
    abortSignal: () =>
      Promise.resolve({
        data: {
          migration: true,
          rls: true,
          storage: true,
          voice_worker: true,
          maintenance: true,
        },
      }),
  });
  m.rooms.mockResolvedValue([]);
});
it("refuses public server secrets and noncanonical or insecure production origins", () => {
  expect(
    environmentIssues({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_" + "x".repeat(32),
    }),
  ).toContain("Server secret in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  expect(environmentIssues({ APP_URL: "https://site.test/path" })).toContain(
    "Unsafe APP_URL",
  );
  expect(
    environmentIssues({ APP_URL: "http://127.0.0.1:3000" }, { strict: true }),
  ).toContain("Unsafe APP_URL");
  expect(
    environmentIssues({ NEXT_PUBLIC_LIVEKIT_API_SECRET: "hidden" }),
  ).toContain("Forbidden public variable NEXT_PUBLIC_LIVEKIT_API_SECRET");
});
it("health denies absent or incorrect tokens before any dependency access", async () => {
  delete process.env.OPS_HEALTH_TOKEN;
  expect(
    (await GET(new Request("https://app.test/api/ops/health"))).status,
  ).toBe(503);
  process.env.OPS_HEALTH_TOKEN = "a".repeat(40);
  expect(
    (await GET(new Request("https://app.test/api/ops/health"))).status,
  ).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.rooms).not.toHaveBeenCalled();
});
it("reports authenticated dependency booleans without caching or room identities", async () => {
  m.rooms.mockResolvedValue([{ name: "private-room-user-id" }]);
  const r = await GET(
    new Request("https://app.test/api/ops/health", {
      headers: { authorization: "Bearer " + "a".repeat(40) },
    }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(await r.text()).not.toContain("private-room");
});
it("handles provider errors without returning their details", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.rooms.mockRejectedValue(Error("secret bearer private participant"));
  const r = await GET(
    new Request("https://app.test/api/ops/health", {
      headers: { authorization: "Bearer " + "a".repeat(40) },
    }),
  );
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("bearer");
});
it("error events reject unsafe digest content and never include exception messages", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  operationalEvent("server_error", "https://private.test/token");
  const value = JSON.parse(spy.mock.calls[0][0]);
  expect(value.event).toBe("server_error");
  expect(value.digest).toBeUndefined();
  expect(Object.keys(value).sort()).toEqual(["at", "event"]);
});
