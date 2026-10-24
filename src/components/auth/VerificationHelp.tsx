"use client";
import { useActionState } from "react";
import Link from "next/link";
import { resendVerification } from "../../lib/auth/actions";
export function VerificationHelp({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(resendVerification, {});
  return <>
    <form action={action} className="auth-form">
      <label className="field">Email address<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={!configured || pending} /></label>
      <button className="button primary full auth-submit" disabled={!configured || pending}>{pending ? "Requesting email…" : "Resend verification email"}</button>
      {pending && <p role="status">Requesting a verification email…</p>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.notice && <p className="form-notice" role="status">{state.notice}</p>}
    </form>
    <div className="auth-links"><Link href="/login">Already verified? Sign in</Link><Link href="/forgot-password">Recover your password</Link></div>
  </>;
}
