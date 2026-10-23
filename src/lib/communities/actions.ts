"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import { appOrigin } from "../config";
import { parseCommand } from "./validation";
import type { ActionState } from "../auth/state";
export type CommunityState = ActionState & {
  inviteUrl?: string;
  communityUrl?: string;
};
export async function communityAction(
  _previous: CommunityState,
  form: FormData,
): Promise<CommunityState> {
  const { client } = await requireUser("/communities");
  const parsed = parseCommand(form);
  if (!parsed)
    return {
      error:
        "Check your entries. Names, permissions, and required fields must be valid.",
    };
  const { command, communityId } = parsed;
  let token: string | undefined;
  let origin: string | undefined;
  let payload: Record<string, unknown> = command.data;
  if (command.operation === "invite") {
    try {
      origin = appOrigin();
    } catch {
      return {
        error:
          "Invitation links are unavailable. Contact the site administrator.",
      };
    }
    token = randomBytes(32).toString("hex");
    payload = {
      token_digest: createHash("sha256").update(token).digest("hex"),
    };
  }
  try {
    const { data, error } = await client.rpc("community_command", {
      p_operation: command.operation,
      p_community: communityId,
      p_data: payload,
    });
    if (
      error ||
      !data ||
      typeof data.slug !== "string" ||
      !/^[a-z][a-z0-9-]{2,47}$/.test(data.slug)
    )
      return {
        error:
          "This change could not be completed. Check your permissions and entries; the name or invitation may be unavailable.",
      };
    revalidatePath("/", "layout");
    return {
      notice:
        command.operation === "invite"
          ? "Invitation created. Share this single-use link privately; it expires in 7 days."
          : "Your change has been saved.",
      communityUrl: `/communities/${data.slug}`,
      inviteUrl: token ? `${origin}/communities/invites/${token}` : undefined,
    };
  } catch {
    return {
      error: "Community services are unavailable. Please try again later.",
    };
  }
}
