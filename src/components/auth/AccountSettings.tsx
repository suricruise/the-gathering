"use client";
import { useActionState, useState } from "react";
import {
  changePassword,
  deleteAccount,
  savePreferences,
} from "../../lib/profiles/actions";
import { ShieldCheck } from "lucide-react";
export function AccountSettings({
  email,
  eventReminders,
  showActivity,
}: {
  email: string;
  eventReminders: boolean;
  showActivity: boolean;
}) {
  const [preferenceState, preferenceAction, preferencePending] = useActionState(
    savePreferences,
    {},
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePassword,
    {},
  );
  const [deletionState, deletionAction, deletionPending] = useActionState(
    deleteAccount,
    {},
  );
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="account-sections">
      <section className="panel padded">
        <div className="settings-title">
          <ShieldCheck size={23} />
          <div>
            <h2>Account & privacy</h2>
            <p>Your verified email: {email}</p>
          </div>
        </div>
        <form action={preferenceAction}>
          <label className="checkbox-label preference-check">
            <input
              type="checkbox"
              name="eventReminders"
              defaultChecked={eventReminders}
            />
            <span>
              Event reminders
              <small>
                Save your preference. Notification delivery is not connected
                yet.
              </small>
            </span>
          </label>
          <label className="checkbox-label preference-check">
            <input
              type="checkbox"
              name="showActivity"
              defaultChecked={showActivity}
            />
            <span>
              Show gaming activity
              <small>
                Show your host identity on Squad Up discovery cards, subject to profile visibility. Joined groups can see your display name.
              </small>
            </span>
          </label>
          <button className="button primary" disabled={preferencePending}>
            Save preferences
          </button>
          {preferenceState.error && (
            <p className="form-error" role="alert">
              {preferenceState.error}
            </p>
          )}
          {preferenceState.notice && (
            <p className="form-notice" role="status">
              {preferenceState.notice}
            </p>
          )}
        </form>
      </section>
      <section className="panel padded">
        <h2>Change your password</h2>
        <p className="helper-text">
          Verify your current password first. After a change, sign in again.
          Other refresh sessions are revoked; issued access tokens expire
          according to your project’s JWT lifetime.
        </p>
        <form action={passwordAction}>
          <label className="field">
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <div className="profile-fields">
            <label className="field">
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <label className="field">
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
          </div>
          <button className="button secondary" disabled={passwordPending}>
            Update password
          </button>
          {passwordState.error && (
            <p className="form-error" role="alert">
              {passwordState.error}
            </p>
          )}
        </form>
      </section>
      <section className="panel padded danger-zone">
        <h2>Leave The Gathering</h2>
        <p>
          Delete your account, profile, preferences, favorite games, platforms,
          and uploaded avatars permanently. This cannot be undone.
        </p>
        {!deleting ? (
          <button className="button danger" onClick={() => setDeleting(true)}>
            Delete my account
          </button>
        ) : (
          <form action={deletionAction}>
            <p className="helper-text">
              Confirm your current password and type DELETE. Cleanup must finish
              before your identity is removed. If cleanup fails, your account
              remains and you can retry.
            </p>
            <label className="field">
              Current password for deletion
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label className="field">
              Type DELETE to confirm
              <input
                name="confirmation"
                required
                pattern="DELETE"
                autoComplete="off"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeleting(false)}
              >
                Keep my account
              </button>
              <button
                type="submit"
                className="button danger"
                disabled={deletionPending}
              >
                {deletionPending
                  ? "Deleting…"
                  : "Permanently delete my account"}
              </button>
            </div>
            {deletionState.error && (
              <p className="form-error" role="alert">
                {deletionState.error}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
