"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  memberAnnouncements,
  submitAppeal,
  submitReport,
} from "../../lib/admin/actions";
import { PageHeading } from "../ui";
export function MemberSafety({
  appeal = false,
  target = "",
  type = "message",
}: {
  appeal?: boolean;
  target?: string;
  type?: string;
}) {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="page admin-live">
      <PageHeading
        eyebrow="A KINDER COMMUNITY"
        title={appeal ? "Your appeals" : "Report a concern"}
        description="Share only the details needed for a fair review."
      />
      <section className="panel padded">
        <p>
          {appeal
            ? "An administrator will review your appeal. Acceptance records a decision; any restored access receives a separate audit entry."
            : "Reports preserve a limited snapshot of the reported item for authorized reviewers. Private message reports can also be submitted from the conversation."}
        </p>
        {appeal && (
          <p>
            If a suspension prevents you from signing in, ask the platform
            operator to lodge your appeal using their verified support process.
            Do not send passwords. This release does not provide anonymous
            identity verification.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSuccess("");
            const f = new FormData(e.currentTarget);
            try {
              const r = appeal
                ? await submitAppeal({
                    body: f.get("body"),
                    case_id: f.get("case_id") || null,
                  })
                : await submitReport({
                    type: f.get("type"),
                    target: f.get("target"),
                    reason: f.get("body"),
                  });
              if (r.error) setError(r.error);
              else
                setSuccess(
                  appeal
                    ? "Appeal submitted for review."
                    : "Report submitted. Reference: " + String(r.data),
                );
            } catch {
              setError("Unable to submit. Check your connection and retry.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {!appeal && (
            <label>
              Reported item type
              <select name="type" defaultValue={type}>
                <option value="message">Channel message</option>
                <option value="post">Social post</option>
                <option value="user">Member</option>
                <option value="session">Gaming session</option>
              </select>
            </label>
          )}
          <label>
            {appeal ? "Case reference (optional)" : "Item identifier"}
            <input
              name={appeal ? "case_id" : "target"}
              required={!appeal}
              defaultValue={target}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
          <label>
            {appeal ? "Your appeal" : "What happened?"}
            <textarea
              name="body"
              required
              minLength={appeal ? 10 : 5}
              maxLength={appeal ? 2000 : 1000}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {success && <p role="status">{success}</p>}
          <button className="button primary" disabled={busy}>
            {busy ? "Submitting…" : appeal ? "Submit appeal" : "Submit report"}
          </button>
        </form>
        <p>
          <Link href={appeal ? "/reports" : "/appeals"}>
            {appeal ? "Report a concern" : "Appeal a moderation decision"}
          </Link>
        </p>
      </section>
    </div>
  );
}
export function Announcements({community}:{community?:string} = {}) {
  const [items, setItems] = useState<
    Array<{ id: string; title: string; body: string }>
  >([]);
  useEffect(() => {
    let live = true;
    setItems([]);
    void memberAnnouncements(community)
      .then((r) => {
        if (live && r.data) setItems(r.data);
      })
      .catch(() => {if(live)setItems([]);});
    return () => {
      live = false;
    };
  }, [community]);
  return items.length ? (
    <section className="panel padded">
      <h2>Community announcements</h2>
      {items.map((a) => (
        <article key={a.id}>
          <h3>{a.title}</h3>
          <p className="admin-wrap">{a.body}</p>
        </article>
      ))}
    </section>
  ) : null;
}
