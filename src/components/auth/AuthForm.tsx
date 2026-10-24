"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  forgotPassword,
  login,
  register,
  resetPassword,
} from "../../lib/auth/actions";
import type { ActionState } from "../../lib/auth/state";
type Mode = "login" | "register" | "forgot" | "reset";
const copy = {
  login: {
    title: "Welcome back.",
    text: "Your people are right where you left them.",
    button: "Sign in",
  },
  register: {
    title: "Your gathering starts here.",
    text: "Create an account. Find your people. Come as you are.",
    button: "Create account",
  },
  forgot: {
    title: "Let’s get you back in.",
    text: "We’ll help you recover access to your account.",
    button: "Request recovery link",
  },
  reset: {
    title: "A fresh start.",
    text: "Choose a strong password you haven’t used elsewhere.",
    button: "Update password",
  },
};
export function AuthForm({
  mode,
  configured = true,
  next = "/home",
}: {
  mode: Mode;
  configured?: boolean;
  next?: string;
}) {
  const actions = {
    login,
    register,
    forgot: forgotPassword,
    reset: resetPassword,
  };
  const [state, action, pending] = useActionState<ActionState, FormData>(
    actions[mode],
    {},
  );
  const text = copy[mode];
  return (
    <>
      <span className="eyebrow">
        {mode === "register"
          ? "BECOME PART OF SOMETHING GOOD"
          : "THE GATHERING"}
      </span>
      <h1>{text.title}</h1>
      <p className="auth-description">{text.text}</p>
      {!configured && (
        <div className="auth-alert" role="alert">
          <LockKeyhole size={20} />
          <div>
            <strong>Authentication isn’t configured yet.</strong>
            <p>
              Connect the Supabase project in environment settings to enable
              secure accounts. Sign-in is unavailable until then.
            </p>
          </div>
        </div>
      )}
      {mode === "register" && state.notice && <p><Link href="/verify-email">Need another verification email?</Link></p>}
      <form action={action} className="auth-form">
        <input type="hidden" name="next" value={next} />
        {mode !== "reset" && (
          <label className="field">
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              required
              disabled={!configured}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label className="field">
            {mode === "reset" ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
              required
              disabled={!configured}
            />
            {mode !== "login" && (
              <small>12–128 characters. Make it long and unique.</small>
            )}
          </label>
        )}
        {mode === "reset" && (
          <label className="field">
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
        )}
        {mode === "register" && (
          <>
            <label className="field">
              Date of birth
              <input
                name="dateOfBirth"
                type="date"
                autoComplete="bday"
                required
                disabled={!configured}
              />
              <small>
                You must be 18 or older. Your birth date is never shown on your
                profile.
              </small>
            </label>
            <label className="checkbox-label adult-check">
              <input
                name="adultConsent"
                type="checkbox"
                required
                disabled={!configured}
              />
              <span>
                I confirm I’m at least 18 and will help keep this community
                welcoming and respectful.
              </span>
            </label>
          </>
        )}
        {mode === "login" && (
          <Link href="/forgot-password" className="auth-forgot">
            Forgot your password?
          </Link>
        )}
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p className="form-notice" role="status">
            {state.notice}
          </p>
        )}
        <button
          type="submit"
          className="button primary full auth-submit"
          disabled={pending || !configured}
        >
          {pending ? (
            <>
              <LoaderCircle className="spin" size={18} />
              Please wait…
            </>
          ) : (
            <>
              {text.button}
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
      <div className="auth-switch">
        {mode === "login" ? (
          <>
            New around here? <Link href="/register">Find your gathering</Link>
          </>
        ) : mode === "register" ? (
          <>
            Already have a place here? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <Link href="/login">Back to sign in</Link>
        )}
      </div>
      <p className="auth-privacy">
        Your email and birth date stay out of public profiles.
        <br />
        You choose what to share with the community.
      </p>
    </>
  );
}
