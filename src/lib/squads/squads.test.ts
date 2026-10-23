import { describe, it, expect } from "vitest";
import { commandSchema, filtersSchema } from "./validation";
const id = "a8000000-0000-4000-8000-000000000001";
const session = {
  operation: "create",
  id,
  title: "Minecraft together",
  description: "A casual local fixture",
  game: "minecraft",
  platform: "pc",
  cross_play: true,
  style: "casual",
  max_players: 4,
  approval: false,
  visibility: "public",
  community: null,
  game_night: false,
  starts_at: null,
};
describe("Squad Up input boundaries", () => {
  it("accepts supported session creation and rejects forged controls", () => {
    expect(commandSchema.safeParse(session).success).toBe(true);
    for (const extra of [
      { host_id: id },
      { role: "owner" },
      { expires_at: "2099-01-01T00:00:00Z" },
      { voice_room: "global" },
      { status: "accepted" },
    ])
      expect(commandSchema.safeParse({ ...session, ...extra }).success).toBe(
        false,
      );
  });
  it("requires a matching community audience and game-night scope", () => {
    for (const extra of [
      { community: id },
      { visibility: "community" },
      { game_night: true },
    ])
      expect(commandSchema.safeParse({ ...session, ...extra }).success).toBe(
        false,
      );
    expect(
      commandSchema.safeParse({
        ...session,
        visibility: "community",
        community: id,
        game_night: true,
      }).success,
    ).toBe(true);
  });
  it("bounds players, text, controls, dates and platform identifiers", () => {
    for (const extra of [
      { max_players: 1 },
      { max_players: 51 },
      { max_players: 2.5 },
      { title: "x" },
      { description: "x".repeat(2001) },
      { description: "unsafe\u0001" },
      { platform: "PC<script>" },
      { starts_at: "tomorrow" },
    ])
      expect(commandSchema.safeParse({ ...session, ...extra }).success).toBe(
        false,
      );
    expect(
      commandSchema.safeParse({
        ...session,
        starts_at: "2026-11-01T12:00:00-04:00",
      }).success,
    ).toBe(true);
  });
  it("requires a chosen join platform without accepting a client-controlled membership", () => {
    expect(
      commandSchema.safeParse({
        operation: "join",
        session: id,
        platform: "pc",
      }).success,
    ).toBe(true);
    for (const v of [
      { operation: "join", session: id },
      { operation: "join", session: id, platform: "pc", user_id: id },
      { operation: "join", session: id, platform: "pc", status: "accepted" },
    ])
      expect(commandSchema.safeParse(v).success).toBe(false);
  });
  it("bounds discovery filters and bigint cursors", () => {
    expect(filtersSchema.parse({}).mode).toBe("discover");
    for (const v of [
      { slots: 50 },
      { slots: -1 },
      { when: "forever" },
      { before: "9223372036854775808" },
      { community: "private-name" },
      { host_id: id },
    ])
      expect(filtersSchema.safeParse(v).success).toBe(false);
    expect(
      filtersSchema.safeParse({
        mode: "game-nights",
        slots: 2,
        before: "9007199254740993",
      }).success,
    ).toBe(true);
  });
  it("does not accept arbitrary voice or host operations", () => {
    for (const operation of [
      "issue-token",
      "set-role",
      "invite-as-owner",
      "set-expiration",
    ])
      expect(commandSchema.safeParse({ operation, session: id }).success).toBe(
        false,
      );
    expect(
      commandSchema.safeParse({ operation: "approve", session: id, target: id })
        .success,
    ).toBe(true);
  });
});
