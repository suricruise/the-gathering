import { describe, it, expect } from "vitest";
import {
  peopleCommandSchema,
  searchSchema,
  historySchema,
  mergeDirectMessages,
} from "./validation";
const id = "a8000000-0000-4000-8000-000000000001";
describe("contact validation", () => {
  it("rejects client identities, grants and unknown fields", () => {
    for (const extra of [
      { sender: id },
      { user_id: id },
      { role: "admin" },
      { grants: ["dm"] },
    ])
      expect(
        peopleCommandSchema.safeParse({
          operation: "send",
          conversation: id,
          id,
          body: "Hi",
          ...extra,
        }).success,
      ).toBe(false);
  });
  it("bounds message length and rejects unsafe controls", () => {
    for (const body of ["", " ", "a".repeat(4001), "Hello\u0001"])
      expect(
        peopleCommandSchema.safeParse({
          operation: "send",
          conversation: id,
          id,
          body,
        }).success,
      ).toBe(false);
    expect(
      peopleCommandSchema.safeParse({
        operation: "send",
        conversation: id,
        id,
        body: "Hello\n**friend**",
      }).success,
    ).toBe(true);
  });
  it("requires explicit valid privacy preferences", () => {
    expect(
      peopleCommandSchema.safeParse({
        operation: "privacy",
        dm_policy: "everyone",
      }).success,
    ).toBe(false);
    expect(
      peopleCommandSchema.safeParse({
        operation: "privacy",
        discoverable: false,
        allow_requests: true,
        share_presence: false,
        dm_policy: "friends",
      }).success,
    ).toBe(true);
  });
  it("search never accepts an email or wildcard and normalizes usernames", () => {
    for (const query of ["a", "%", "alice@example.test", "x' or true--"])
      expect(searchSchema.safeParse({ query }).success).toBe(false);
    expect(searchSchema.parse({ query: " ALICE_42 " }).query).toBe("alice_42");
    expect(searchSchema.parse({}).query).toBe("");
  });
  it("validates conversation IDs, bounded cursors and report reason", () => {
    expect(historySchema.safeParse({ conversation: "alice" }).success).toBe(
      false,
    );
    expect(
      historySchema.safeParse({ conversation: id, before: "9".repeat(19) })
        .success,
    ).toBe(false);
    expect(
      peopleCommandSchema.safeParse({
        operation: "report",
        conversation: id,
        message: id,
        reason: "bad",
      }).success,
    ).toBe(false);
  });
  it("reconciles retries and reconnect messages by stable IDs using bigint order", () => {
    const m = (id: string, seq: string) => ({
      id,
      seq,
      sender: "x",
      body: "Hi",
      created_at: "2026-10-23",
    });
    expect(
      mergeDirectMessages(
        [m("a", "9007199254740993")],
        [m("a", "9007199254740993"), m("b", "9007199254740992")],
      ).map((m) => m.id),
    ).toEqual(["b", "a"]);
  });
});

it("accepts an @ prefix without changing discovery privacy",()=>{expect(searchSchema.parse({query:" @Gamer_123 "}).query).toBe("gamer_123");expect(searchSchema.safeParse({query:"email@example.test"}).success).toBe(false);});
