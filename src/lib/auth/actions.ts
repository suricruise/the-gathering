"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { appOrigin, authConfigured } from "../config";
import { allowAuthAttempt } from "./rate-limit";
import {
  emailSchema,
  formText,
  loginSchema,
  passwordSchema,
  registrationSchema,
  safeNext,
} from "./validation";
import { requireUser } from "./session";
import type { ActionState } from "./state";
const unavailable = {
  error:
    "Authentication is unavailable. Please try again later or contact the community team.",
};
export async function register(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = registrationSchema.safeParse({
    email: formText(form, "email"),
    password: formText(form, "password"),
    dateOfBirth: formText(form, "dateOfBirth"),
    adultConsent: formText(form, "adultConsent") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!authConfigured()) return unavailable;
  try {
    if (!(await allowAuthAttempt(parsed.data.email)))
      return { error: "Please wait before trying again." };
    const client = await createClient();
    const { data, error } = await client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { date_of_birth: parsed.data.dateOfBirth },
        emailRedirectTo: `${appOrigin()}/auth/callback`,
      },
    });
    if (data.session) {
      await client.auth.signOut({ scope: "local" });
      return {
        error:
          "Email verification must be enabled before registration can continue. Please contact the community team.",
      };
    }
    if (
      error &&
      !["user_already_exists", "email_exists"].includes(error.code ?? "")
    )
      return unavailable;
    return {
      notice:
        "If registration is available for this address, check your email for a verification link. You must verify your email before joining.",
    };
  } catch {
    return unavailable;
  }
}
export async function login(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formText(form, "email"),
    password: formText(form, "password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  if (!authConfigured()) return unavailable;
  try {
    if (!(await allowAuthAttempt(parsed.data.email)))
      return {
        error: "Sign-in is unavailable. Check your details or try again later.",
      };
    const client = await createClient();
    const { data, error } = await client.auth.signInWithPassword(parsed.data);
    if (error || !data.user?.email_confirmed_at)
      return {
        error:
          "Sign-in is unavailable. Check your details or try again later. If you recently registered, verify your email first.",
      };
  } catch {
    return unavailable;
  }
  revalidatePath("/", "layout");
  redirect(safeNext(formText(form, "next")));
}
export async function forgotPassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formText(form, "email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  if (!authConfigured()) return unavailable;
  try {
    if (await allowAuthAttempt(parsed.data)) {
      const client = await createClient();
      const { error } = await client.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${appOrigin()}/auth/callback?next=/reset-password`,
      });
      if (
        error &&
        !["over_email_send_rate_limit", "email_not_found"].includes(
          error.code ?? "",
        )
      )
        return unavailable;
    }
    return {
      notice:
        "If an account exists for this address, check its inbox for a password reset link. You may need to wait before requesting another.",
    };
  } catch {
    return unavailable;
  }
}
export async function resetPassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser("/settings");
  const parsed = passwordSchema.safeParse(formText(form, "password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data !== formText(form, "confirmPassword"))
    return { error: "Your passwords do not match." };
  const { error } = await client.auth.updateUser({ password: parsed.data });
  if (error)
    return {
      error:
        "Could not change your password. Request a fresh recovery link and try again.",
    };
  await client.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  redirect("/login?password=updated");
}
export async function logout(): Promise<void> {
  if (authConfigured()) {
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error("Sign-out could not complete. Please retry.");
  }
  revalidatePath("/", "layout");
  redirect("/login?loggedOut=1");
}

export async function resendVerification(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formText(form, "email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  if (!authConfigured()) return unavailable;
  const notice = "If this address has an account awaiting verification, a new email can be sent. Check your inbox and spam folder, and allow a few minutes before trying again. If you already verified, sign in instead.";
  try {
    if (await allowAuthAttempt(parsed.data)) {
      const client = await createClient();
      // Do not expose whether an address exists, is already verified or is limited.
      await client.auth.resend({ type: "signup", email: parsed.data, options: { emailRedirectTo: `${appOrigin()}/auth/callback` } });
    }
    return { notice };
  } catch { return unavailable; }
}
