import { it, expect } from "vitest";
import { spaceCommandSchema, readSchema, localInZone } from "./validation";
const id = "a8000000-0000-4000-8000-000000000001";
it("validates privacy and explicit prayer guideline consent before dispatch", () => {
  expect(
    spaceCommandSchema.safeParse({
      operation: "prayer-create",
      id,
      community: id,
      body: "Pray for my family",
      visibility: "moderators",
      guidelines: true,
    }).success,
  ).toBe(true);
  for (const extra of [
    { guidelines: false },
    { visibility: "public" },
    { author_id: id },
    { role: "moderator" },
  ])
    expect(
      spaceCommandSchema.safeParse({
        operation: "prayer-create",
        id,
        community: id,
        body: "Prayer",
        visibility: "moderators",
        guidelines: true,
        ...extra,
      }).success,
    ).toBe(false);
});
it("rejects spoofed hosts, recipients, roles and unsafe bounded body inputs", () => {
  for (const body of ["", "x".repeat(4001), "bad\u0001"])
    expect(
      spaceCommandSchema.safeParse({
        operation: "prayer-create",
        id,
        community: id,
        body,
        visibility: "community",
        guidelines: true,
      }).success,
    ).toBe(false);
  expect(
    spaceCommandSchema.safeParse({
      operation: "rsvp",
      id,
      response: "going",
      user_id: id,
    }).success,
  ).toBe(false);
  expect(
    spaceCommandSchema.safeParse({
      operation: "notice-create",
      id,
      community: id,
      target: id,
      body: "Hello",
      role: "owner",
    }).success,
  ).toBe(false);
});
it("only accepts fixed resource views, UUIDs and bounded sequence cursors", () => {
  expect(readSchema.safeParse({ view: "audit" }).success).toBe(false);
  expect(
    readSchema.safeParse({ view: "prayer", resource: "username" }).success,
  ).toBe(false);
  expect(
    readSchema.safeParse({
      view: "notifications",
      before: "9999999999999999999",
    }).success,
  ).toBe(false);
  expect(readSchema.safeParse({ view: "events", user_id: id }).success).toBe(
    false,
  );
});
it("requires explicit booleans for every notification preference", () => {
  expect(
    spaceCommandSchema.safeParse({
      operation: "preferences",
      event_reminders: true,
    }).success,
  ).toBe(false);
  expect(
    spaceCommandSchema.safeParse({
      operation: "preferences",
      friend_requests: true,
      replies: true,
      mentions: false,
      community_invitations: false,
      event_reminders: false,
      event_updates: true,
      gaming_invitations: false,
      moderator_notices: true,
      daily_content: false,
    }).success,
  ).toBe(true);
});
it("formats event wall times in their selected zone without browser-zone assumptions", () => {
  expect(localInZone("2027-01-20T19:00:00Z", "America/New_York")).toBe(
    "2027-01-20T14:00",
  );
  expect(localInZone("2027-07-20T19:00:00Z", "America/New_York")).toBe(
    "2027-07-20T15:00",
  );
  expect(localInZone("2027-01-20T19:00:00Z", "UTC")).toBe("2027-01-20T19:00");
});

import { dailyScripture } from "./scripture";
it("rotates clearly curated Scripture by UTC day and stays deterministic within a day", () => {
  expect(dailyScripture("2026-10-23")).toEqual(dailyScripture("2026-10-23"));
  expect(dailyScripture("2026-10-23")).not.toEqual(
    dailyScripture("2026-10-24"),
  );
  expect(dailyScripture("2026-10-23").reference).toBeTruthy();
});
