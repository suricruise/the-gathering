// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
import { allowAuthAttempt } from "./rate-limit";
beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "unit-test-only-not-a-real-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("Authentication limiter availability", () => {
  it("allows attempts only after an explicit database approval", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await allowAuthAttempt("member@example.test")).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("consume_auth_rate_limit", {
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("reports a real exhausted budget as throttled", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await allowAuthAttempt("member@example.test")).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });
  it("does not turn a missing migration into a false rate-limit response", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "sensitive provider detail" },
    });
    await expect(allowAuthAttempt("member@example.test")).rejects.toThrow(
      "Authentication limiter is unavailable",
    );
    expect(console.error).toHaveBeenCalledWith(
      "[auth] Signup limiter dependency unavailable",
      { code: "PGRST202" },
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      /member@example|sensitive provider|unit-test-only/,
    );
  });
  it("fails closed on a transport failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("private transport detail"));
    await expect(allowAuthAttempt("member@example.test")).rejects.toThrow(
      "Authentication limiter is unavailable",
    );
  });
  it("fails closed on a missing key without attempting the RPC", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await expect(allowAuthAttempt("member@example.test")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not treat an invalid response as an exhausted budget", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(allowAuthAttempt("member@example.test")).rejects.toThrow();
  });
});
