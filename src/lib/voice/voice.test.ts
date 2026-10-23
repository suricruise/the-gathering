// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
vi.mock("server-only", () => ({}));
import { issueVoiceToken, voiceConfig } from "./server";
import { tokenInput, controlInput, sessionInput } from "./validation";
const id = "a4000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.stubEnv("LIVEKIT_URL", "wss://voice.example.test");
  vi.stubEnv("LIVEKIT_API_KEY", "test-key");
  vi.stubEnv("LIVEKIT_API_SECRET", "test-server-secret-at-least-32-characters");
});
afterEach(() => vi.unstubAllEnvs());
it("signs a one-minute identity-bound microphone-only room token", async () => {
  const result = await issueVoiceToken(id, {
    room: `tg_${id}`,
    ticket: id,
    limit: 12,
    name: "Jordan",
  });
  const claims = await new TokenVerifier(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  ).verify(result.token);
  expect(claims.sub).toBe(id);
  expect(claims.exp! - claims.nbf!).toBe(60);
  expect(claims.video).toEqual({
    room: `tg_${id}`,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: ["microphone"],
    canPublishData: false,
    canUpdateOwnMetadata: false,
    roomAdmin: false,
    roomCreate: false,
    roomRecord: false,
  });
  expect(result).not.toHaveProperty("secret");
  expect(JSON.stringify(result)).not.toContain(process.env.LIVEKIT_API_SECRET);
});
it("rejects client supplied identities, grants, room names and malformed controls", () => {
  for (const extra of [
    { identity: id },
    { room: "arbitrary" },
    { grants: { roomAdmin: true } },
  ])
    expect(tokenInput.safeParse({ channel: id, ...extra }).success).toBe(false);
  expect(tokenInput.safeParse({ channel: id }).success).toBe(true);
  expect(
    controlInput.safeParse({
      channel: id,
      operation: "settings",
      limit: 51,
      locked: false,
    }).success,
  ).toBe(false);
  expect(
    controlInput.safeParse({
      channel: id,
      operation: "remove",
      target: id,
      role: "owner",
    }).success,
  ).toBe(false);
  expect(sessionInput.safeParse({ ticket: "bad" }).success).toBe(false);
});
it("refuses insecure external LiveKit URLs and missing credentials", () => {
  for (const url of [
    "ws://remote.example.test",
    "https://voice.example.test",
    "wss://user:secret@voice.example.test",
    "wss://voice.example.test/path",
  ]) {
    vi.stubEnv("LIVEKIT_URL", url);
    expect(() => voiceConfig()).toThrow();
  }
  vi.stubEnv("LIVEKIT_URL", "ws://127.0.0.1:7880");
  expect(voiceConfig().host).toBe("http://127.0.0.1:7880");
  vi.stubEnv("LIVEKIT_API_SECRET", "");
  expect(() => voiceConfig()).toThrow();
});
