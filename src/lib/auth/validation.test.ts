import { describe, expect, it } from "vitest";
import {
  eligibleAdult,
  profileSchema,
  registrationSchema,
  safeNext,
} from "./validation";
describe("Server input validation", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it.each([
    ["2008-10-22", true],
    ["2008-10-23", false],
    ["2026-10-22", false],
    ["2027-01-01", false],
    ["2008-02-30", false],
    ["2000-02-29", true],
    ["1900-01-01", false],
    ["not-a-date", false],
  ])("validates age %s", (dob, valid) =>
    expect(eligibleAdult(dob, now)).toBe(valid),
  );
  it("handles leap birthdays at the 18-year boundary", () => {
    expect(eligibleAdult("2008-02-29", new Date("2026-02-28T12:00:00Z"))).toBe(
      false,
    );
    expect(eligibleAdult("2008-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(
      true,
    );
  });
  it("rejects missing consent and short passwords", () => {
    expect(
      registrationSchema.safeParse({
        email: "member@example.test",
        password: "short",
        dateOfBirth: "1990-01-01",
        adultConsent: true,
      }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        email: "member@example.test",
        password: "long-passphrase-2026",
        dateOfBirth: "1990-01-01",
        adultConsent: false,
      }).success,
    ).toBe(false);
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/home?next=https://evil.test",
    "/auth/callback",
    "javascript:alert(1)",
    null,
  ])("rejects redirect target %s", (target) =>
    expect(safeNext(target)).toBe("/home"),
  );
  it("accepts intended internal destinations", () =>
    expect(safeNext("/channels/general")).toBe("/channels/general"));
  const valid = {
    username: "gamer_123",
    displayName: "Member",
    bio: "Hello",
    visibility: "private",
    interests: ["co-op"],
    games: ["minecraft"],
    platforms: ["pc"],
  };
  it.each([
    "ad",
    "ADMIN",
    "name with spaces",
    "123start",
    "gamer<script>",
    "x".repeat(25),
  ])("rejects reserved or invalid username %s", (username) =>
    expect(profileSchema.safeParse({ ...valid, username }).success).toBe(false),
  );
  it("normalizes handles and rejects unrecognized privacy and interests", () => {
    expect(
      profileSchema.parse({ ...valid, username: " Gamer_123 " }).username,
    ).toBe("gamer_123");
    expect(
      profileSchema.safeParse({ ...valid, visibility: "everybody" }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...valid, interests: ["admin"] }).success,
    ).toBe(false);
  });
});
