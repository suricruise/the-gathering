"use server";
import { removeAccountSocialFiles } from "../social/cleanup";
import { removeAccountChatFiles } from "../chat/cleanup";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth/session";
import { formText, passwordSchema, profileSchema } from "../auth/validation";
import { allowAuthAttempt } from "../auth/rate-limit";
import { createAdminClient } from "../supabase/admin";
import type { ActionState } from "../auth/state";

export async function saveProfile(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser("/profile");
  const complete = formText(form, "complete") === "yes";
  const parsed = profileSchema.safeParse({
    username: formText(form, "username"),
    displayName: formText(form, "displayName"),
    bio: formText(form, "bio"),
    visibility: formText(form, "visibility"),
    interests: form.getAll("interests"),
    games: form.getAll("games"),
    platforms: form.getAll("platforms"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  if (
    complete &&
    (!p.games.length || !p.platforms.length || !p.interests.length)
  )
    return {
      error:
        "Choose at least one game, platform, and interest to finish onboarding.",
    };
  const { data, error } = await client.rpc("save_my_profile", {
    p_username: p.username,
    p_display_name: p.displayName,
    p_bio: p.bio,
    p_visibility: p.visibility,
    p_interests: p.interests,
    p_games: p.games,
    p_platforms: p.platforms,
    p_complete: complete,
  });
  if (error || data !== true)
    return {
      error:
        "We couldn’t save those details. Try another username or wait a little before trying again.",
    };
  revalidatePath("/", "layout");
  if (complete) redirect("/home");
  return { notice: "Your profile has been saved." };
}
export async function savePreferences(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser("/settings");
  const { data, error } = await client.rpc("save_my_preferences", {
    p_event_reminders: formText(form, "eventReminders") === "on",
    p_show_activity: formText(form, "showActivity") === "on",
  });
  if (error || data !== true)
    return { error: "Your preferences could not be saved. Please try again." };
  revalidatePath("/settings");
  return {
    notice:
      "Your account preferences have been saved. Manage in-app delivery in notification preferences.",
  };
}
export async function uploadAvatar(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client, user } = await requireUser("/profile");
  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024)
    return { error: "Choose a PNG, JPEG, or WebP image no larger than 2 MB." };
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return { error: "Only PNG, JPEG, and WebP images are accepted." };
  if (!(await allowAuthAttempt(`avatar:${user.id}`)))
    return { error: "Please wait before uploading another avatar." };
  let buffer: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, {
      limitInputPixels: 16_777_216,
      animated: false,
    }).metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      (metadata.pages ?? 1) > 1
    )
      return { error: "Choose a still image up to 4096 × 4096 pixels." };
    // Re-encoding strips metadata, validates bytes, and rejects SVG/polyglot payloads.
    buffer = await sharp(input, { limitInputPixels: 16_777_216 })
      .rotate()
      .resize(512, 512, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { error: "This file could not be decoded as a safe image." };
  }
  const { data: profile, error: readError } = await client
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  if (readError) return { error: "Your profile could not be loaded." };
  const admin = createAdminClient();
  const path = `${user.id}/${randomUUID()}.webp`;
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, buffer, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "0",
    });
  if (uploadError)
    return { error: "Your avatar could not be uploaded. Please try again." };
  const { data, error } = await client.rpc("set_my_avatar", { p_path: path });
  if (error || data !== true) {
    await admin.storage.from("avatars").remove([path]);
    return { error: "Your avatar could not be saved." };
  }
  if (profile.avatar_path && profile.avatar_path.startsWith(`${user.id}/`))
    await admin.storage.from("avatars").remove([profile.avatar_path]);
  revalidatePath("/", "layout");
  return { notice: "Your avatar has been updated." };
}
async function reauthenticate(password: string) {
  const identity = await requireUser("/settings");
  if (!password || password.length > 128 || !identity.user.email) return null;
  if (!(await allowAuthAttempt(`reauth:${identity.user.id}`))) return null;
  const { data, error } = await identity.client.auth.signInWithPassword({
    email: identity.user.email,
    password,
  });
  if (error || data.user?.id !== identity.user.id) return null;
  return identity;
}
export async function changePassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(formText(form, "newPassword"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data !== formText(form, "confirmPassword"))
    return { error: "Your new passwords do not match." };
  const identity = await reauthenticate(formText(form, "currentPassword"));
  if (!identity)
    return {
      error:
        "We couldn’t verify your current password. Please try again later.",
    };
  const { error } = await identity.client.auth.updateUser({
    password: parsed.data,
  });
  if (error)
    return { error: "Your password could not be changed. Please try again." };
  await identity.client.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  redirect("/login?password=updated");
}
export async function deleteAccount(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (formText(form, "confirmation") !== "DELETE")
    return { error: "Type DELETE to confirm permanent account deletion." };
  const identity = await reauthenticate(formText(form, "currentPassword"));
  if (!identity)
    return {
      error:
        "We couldn’t verify your password. Your account has not been deleted.",
    };
  const readiness = await identity.client.rpc("account_deletion_ready");
  if(readiness.error) return {error:"Account deletion checks are unavailable. Your account has not been deleted; please retry."};
  if(readiness.data!==true) return {error:"Transfer ownership of your communities and any platform ownership before deleting your account. Your account has not been deleted."};
  const admin = createAdminClient();
  // Storage objects are removed through the Storage API before deleting auth.users.
  // Do not mutate storage metadata with SQL or trust a submitted user ID.
  for (let batch = 0; batch < 20; batch++) {
    const { data, error } = await admin.storage
      .from("avatars")
      .list(identity.user.id, { limit: 1000 });
    if (error)
      return {
        error:
          "We couldn’t remove your avatar files. Your account has not been deleted; please retry.",
      };
    if (!data.length) break;
    const { error: removeError } = await admin.storage
      .from("avatars")
      .remove(data.map((file) => `${identity.user.id}/${file.name}`));
    if (removeError || batch === 19)
      return {
        error:
          "Account cleanup could not finish. Your account has not been deleted; please contact support.",
      };
  }
  if (!(await removeAccountChatFiles(identity.user.id)))
    return {
      error:
        "Your message attachments could not be removed. Your account has not been deleted; please retry.",
    };
  if (!(await removeAccountSocialFiles(identity.user.id)))
    return {
      error:
        "Your social media files could not be removed. Your account has not been deleted; please retry.",
    };
  const { error } = await admin.auth.admin.deleteUser(identity.user.id);
  if (error)
    return {
      error:
        "Your account could not be deleted. Please try again or contact support.",
    };
  await identity.client.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/login?deleted=1");
}
