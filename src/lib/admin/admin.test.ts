import { describe, it, expect } from "vitest";
import {
  adminCommandSchema,
  adminReadSchema,
  reportSchema,
  appealSchema,
} from "./validation";
const id = "83117fa4-a337-4b40-93df-617d9d8e8014";
describe("administration input boundary", () => {
  it("never permits client owner assignment or actor injection", () => {
    expect(
      adminCommandSchema.safeParse({
        operation: "platform_role",
        user_id: id,
        role: "owner",
        reason: "Promote myself",
      }).success,
    ).toBe(false);
    expect(
      adminCommandSchema.safeParse({
        operation: "platform_role",
        user_id: id,
        role: "moderator",
        reason: "Approved team",
        actor_id: id,
      }).success,
    ).toBe(false);
  });
  it("requires bounded action reasons and retention", () => {
    expect(
      adminCommandSchema.safeParse({
        operation: "retention",
        days: 1,
        reason: "Policy updated",
      }).success,
    ).toBe(false);
    expect(
      adminCommandSchema.safeParse({
        operation: "retention",
        days: 90,
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      adminCommandSchema.safeParse({
        operation: "retention",
        days: 90,
        reason: "Policy updated",
      }).success,
    ).toBe(true);
  });
  it("rejects arbitrary read identities and invalid cursors", () => {
    expect(
      adminReadSchema.safeParse({ view: "reports", user_id: id }).success,
    ).toBe(false);
    expect(
      adminReadSchema.safeParse({ view: "reports", before: -1 }).success,
    ).toBe(false);
  });
  it("reports cannot supply evidence or reporter identity", () => {
    expect(
      reportSchema.safeParse({
        type: "message",
        target: id,
        reason: "Harassment concern",
        evidence: "invented",
      }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        type: "dm",
        target: id,
        reason: "Harassment concern",
      }).success,
    ).toBe(false);
  });
  it("appeals require a meaningful bounded explanation", () => {
    expect(appealSchema.safeParse({ body: "short" }).success).toBe(false);
    expect(
      appealSchema.safeParse({ body: "Please review the decision carefully." })
        .success,
    ).toBe(true);
  });
  it("channel scope, ordering and boolean permissions are validated", () => {
    expect(
      adminCommandSchema.safeParse({
        operation: "channel_access",
        community_id: id,
        id,
        role: "member",
        can_view: "true",
        can_post: true,
        can_connect: true,
        reset: false,
        reason: "New role policy",
      }).success,
    ).toBe(false);
  });
});
