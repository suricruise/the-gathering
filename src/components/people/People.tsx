"use client";
import { CommunityPresencePreference } from "./CommunityPresencePreference";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePeople } from "./PeopleProvider";
import { searchPeople, peopleCommand } from "../../lib/people/actions";
import { fetchDirectHistory as directHistory } from "../../lib/people/client";
import type { Person, Privacy, History } from "../../lib/people/types";
import { mergeDirectMessages } from "../../lib/people/validation";
import { usePrivateUpdates } from "./usePrivateUpdates";
import { SafeMarkdown } from "../chat/SafeMarkdown";
import { useMember } from "../MemberContext";
function Avatar({ person }: { person: Person }) {
  return person.avatar ? (
    <img
      className="people-avatar"
      src={`/api/avatars/${person.id}`}
      alt=""
      width={40}
      height={40}
    />
  ) : (
    <span className="people-avatar" aria-hidden="true">
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function PeoplePage({ tab: initial = "friends" }: { tab?: string }) {
  const ctx = usePeople();
  const router = useRouter();
  const tab = initial;
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Person[] | null>(null),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function chooseTab(value: string) {
    router.replace(`/messages?tab=${value}`, { scroll: false });
  }
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const savedPrivacy = ctx?.home?.privacy;
  useEffect(() => {
    if (savedPrivacy) setPrivacy((previous) => previous ?? savedPrivacy);
  }, [savedPrivacy]);
  if (!ctx) return null;
  const { home, refresh, error } = ctx;
  async function run(input: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const r = await peopleCommand(input);
      if (r.error) setNotice(r.error);
      else {
        await refresh();
        setNotice("Saved.");
        if (r.data?.id) router.push(`/messages/${r.data.id}`);
        if (results) {
          const updated = await searchPeople({ query, before: null });
          if (updated.data) { setResults(updated.data.items.slice(0,20));setNext(updated.data.items.length>20?updated.data.items[19].username:null); }
          else { setResults(null);setNext(null); }
        }
      }
    } catch {
      setNotice("Request failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function search(more = false) {
    setBusy(true);
    setNotice("");
    try {
      const r = await searchPeople({ query, before: more ? next : null });
      if (r.data) {
        const rows = r.data.items;
        setResults((old) =>
          more ? [...(old || []), ...rows.slice(0, 20)] : rows.slice(0, 20),
        );
        setNext(rows.length > 20 ? rows[19].username : null);
      } else setNotice(r.error || "Search unavailable.");
    } catch {
      setNotice("Search unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  function person(p: Person) {
    return (
      <article className="people-card" key={p.id}>
        <Avatar person={p} />
        <div>
          <h3>{p.name}</h3>
          <p>
            @{p.username} ·{" "}
            {p.online === null
              ? "Status hidden"
              : p.online
                ? "Online"
                : "Offline"}
          </p>
          {p.shared.length > 0 && (
            <small>Shared interests: {p.shared.join(", ")}</small>
          )}
        </div>
        <div className="people-actions">
          {p.relationship === "none" && (
            <button
              disabled={busy}
              onClick={() => void run({ operation: "request", target: p.id })}
            >
              Add friend
            </button>
          )}
          {p.relationship === "incoming" && (
            <>
              <button
                disabled={busy}
                onClick={() => void run({ operation: "accept", target: p.id })}
              >
                Accept request
              </button>
              <button
                disabled={busy}
                onClick={() => void run({ operation: "decline", target: p.id })}
              >
                Decline request
              </button>
            </>
          )}
          {p.relationship === "outgoing" && (
            <button
              disabled={busy}
              onClick={() => void run({ operation: "cancel", target: p.id })}
            >
              Cancel request
            </button>
          )}
          {p.relationship === "friends" && (
            <button
              disabled={busy}
              onClick={() => void run({ operation: "remove", target: p.id })}
            >
              Remove friend
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => void run({ operation: "open", target: p.id })}
          >
            Message
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `Block ${p.name}? This removes your friendship and prevents contact.`,
                )
              )
                void run({ operation: "block", target: p.id });
            }}
          >
            Block
          </button>
          <Link href={`/reports?type=user&target=${p.id}`}>Report member</Link>
        </div>
      </article>
    );
  }
  return (
    <div className="page people-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR PEOPLE · YOUR PRIVACY</span>
        <h1>Friends & messages</h1>
        <p>
          Find shared interests. Build friendships. Keep the conversation going.
        </p>
        <div className="button-row"><button className="button primary" onClick={()=>chooseTab("discover")}>Add friends</button><Link className="button secondary" href="/members">Browse community members</Link></div>
      </div>
      <nav className="people-tabs" aria-label="Friends and messages sections">
        {[
          "friends",
          "discover",
          "conversations",
          "notifications",
          "privacy",
          "blocks",
        ].map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              chooseTab(t);
              setNotice("");
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <p className="muted" role="status">
        {ctx.status} · Private updates
      </p>
      {(notice || error) && <p role="status">{notice || error}</p>}
      {!home && !error && <p role="status">Loading your connections…</p>}
      {error && <button onClick={() => void refresh()}>Retry</button>}
      {tab === "friends" && home && (
        <section aria-label="Friends and requests">
          <h2>Your connections</h2>
          {home.friends.length ? (
            home.friends.map(person)
          ) : (
            <p>
              No friends or requests yet. Use Add friends to search by username, or browse your community members and send a request directly.
            </p>
          )}
        </section>
      )}
      {tab === "discover" && (
        <section>
          <h2>Find your people</h2>
          <p><Link href="/members">Browse community members</Link> to add people you share a community with, even when their full profile is private.</p>
          <p>
            Only members who enable discovery and share a member-visible profile
            appear here. Emails are never searched or displayed.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label>
              Find by username
              <input
                value={query}
                maxLength={25}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setNext(null);
                  setResults(null);
                }}
                placeholder="Username or @username"
              />
            </label>
            <button disabled={busy} type="submit">
              Search members
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                setQuery("");
                setResults(null);
                void (async () => {
                  setBusy(true);
                  try {
                    const r = await searchPeople({ query: "", before: null });
                    if (r.data) {
                      setResults(r.data.items.slice(0, 20));
                      setNext(
                        r.data.items.length > 20
                          ? r.data.items[19].username
                          : null,
                      );
                    } else setNotice(r.error || "Discovery unavailable");
                  } catch {
                    setNotice("Discovery unavailable. Please retry.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Shared interests
            </button>
          </form>
          {results?.map(person)}
          {results?.length === 0 && (
            <p>
              No discoverable members matched. Try another username or shared
              interests.
            </p>
          )}
          {next && (
            <button disabled={busy} onClick={() => void search(true)}>
              More members
            </button>
          )}
        </section>
      )}
      {tab === "conversations" && home && (
        <section>
          <h2>Private conversations</h2>
          {home.conversations.length ? (
            home.conversations.map((c) => (
              <article className="people-card" key={c.id}>
                <Avatar person={c.member} />
                <Link href={`/messages/${c.id}`}>
                  {c.member.name} · {c.unread} unread
                </Link>
                <span>{c.muted ? "Muted" : ""}</span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run({
                      operation: "mute",
                      conversation: c.id,
                      muted: !c.muted,
                    })
                  }
                >
                  {c.muted ? "Unmute" : "Mute"}
                </button>
              </article>
            ))
          ) : (
            <p>No conversations yet. Message a friend to begin.</p>
          )}
          <p>
            Muted conversations keep their unread counts, but do not add to the
            notification badge.
          </p>
        </section>
      )}
      {tab === "notifications" && home && (
        <section>
          <h2>Friend notifications</h2>
          <button
            disabled={busy}
            onClick={() => void run({ operation: "notifications-read" })}
          >
            Mark notifications read
          </button>
          {home.notifications.length ? (
            home.notifications.map((n) => (
              <article className="people-card" key={n.id}>
                <p>
                  {n.member?.name || "Member"}{" "}
                  {n.kind === "friend_request"
                    ? "sent a friend request."
                    : "accepted your friend request."}{" "}
                  {n.read ? "Read" : "Unread"}
                </p>
              </article>
            ))
          ) : (
            <p>You’re all caught up.</p>
          )}
          <button onClick={() => chooseTab("friends")}>Manage requests</button>
        </section>
      )}
      {tab === "blocks" && home && (
        <section>
          <h2>Blocked members</h2>
          <p>
            Blocks work both ways across friendships, direct messages,
            discovery, invitations and Squad Up. Unblocking does not restore a
            friendship.
          </p>
          {home.blocks.length ? (
            home.blocks.map((b) => (
              <article className="people-card" key={b.id}>
                <span>{b.name}</span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run({ operation: "unblock", target: b.id })
                  }
                >
                  Unblock
                </button>
              </article>
            ))
          ) : (
            <p>No blocked members.</p>
          )}
        </section>
      )}
      {tab === "privacy" && privacy && (
        <section>
          <h2>Discovery & contact privacy</h2>
          <CommunityPresencePreference />
          <p>Your name and handle remain visible to fellow community members. Private profile details stay private; global discovery is a separate choice.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run({ operation: "privacy", ...privacy });
            }}
          >
            <label>
              <input
                type="checkbox"
                checked={privacy.discoverable}
                onChange={(e) =>
                  setPrivacy({ ...privacy, discoverable: e.target.checked })
                }
              />
              Allow member discovery
            </label>
            <p>
              Your profile must also be visible to members or public in{" "}
              <Link href="/profile">profile settings</Link>. Shared interests
              are shown only in discovery.
            </p>
            <label>
              <input
                type="checkbox"
                checked={privacy.allow_requests}
                onChange={(e) =>
                  setPrivacy({ ...privacy, allow_requests: e.target.checked })
                }
              />
              Allow friend requests
            </label>
            <label>
              Who may send direct messages?
              <select
                value={privacy.dm_policy}
                onChange={(e) =>
                  setPrivacy({
                    ...privacy,
                    dm_policy: e.target.value as Privacy["dm_policy"],
                  })
                }
              >
                <option value="friends">Friends only (default)</option>
                <option value="members">
                  Any verified adult member (opt-in)
                </option>
                <option value="nobody">Nobody</option>
              </select>
            </label>
            <p>
              Changing this setting immediately controls incoming messages,
              including existing conversations.
            </p>
            <label>
              <input
                type="checkbox"
                checked={privacy.share_presence}
                onChange={(e) =>
                  setPrivacy({ ...privacy, share_presence: e.target.checked })
                }
              />
              Share online status with friends
            </label>
            <p>
              Status is based on recent activity in a visible browser tab.
              Closing a tab may take up to 90 seconds to appear offline. We
              never show last-seen timestamps.
            </p>
            <button disabled={busy}>Save contact privacy</button>
          </form>
        </section>
      )}
    </div>
  );
}
export function DirectConversation({
  initial,
  config,
}: {
  initial: History;
  config: { url: string; key: string };
}) {
  const ctx = usePeople(),
    member = useMember();
  const [history, setHistory] = useState(initial),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [older, setOlder] = useState(initial.items.length === 50),
    [reason, setReason] = useState(""),
    [reportNotice, setReportNotice] = useState(""),
    [report, setReport] = useState<string | null>(null);
  const attempt = useRef<string | null>(null);
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  const refresh = useCallback(async () => {
    try {
      const r = await directHistory({ conversation: initial.id });
      if (r.data) {
        const previous = historyRef.current.items;
        const incoming = r.data.items;
        const gap =
          previous.length > 0 &&
          incoming.length > 0 &&
          BigInt(previous.at(-1)!.seq) < BigInt(incoming[0].seq);
        setHistory((h) => ({
          ...r.data!,
          items: gap ? incoming : mergeDirectMessages(h.items, incoming),
        }));
        if (gap) setOlder(incoming.length === 50);
        setError("");
        setDenied(false);
      } else {
        setError(r.error || "Messages unavailable.");
        if (r.denied) {
          setDenied(true);
          setHistory((h) => ({ ...h, items: [], can_send: false }));
        }
      }
    } catch {
      setError("Messages unavailable. Please retry.");
    }
  }, [initial.id]);
  const status = usePrivateUpdates(config, initial.id, refresh);
  // Read only messages actually rendered in a visible tab; server caps the cursor.
  const latest = history.items.at(-1)?.seq;
  const seen = useRef("0");
  const messageList = useRef<HTMLElement>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    const list = messageList.current;
    if (
      list &&
      (firstScroll.current ||
        list.scrollHeight - list.scrollTop - list.clientHeight < 140)
    )
      list.scrollTop = list.scrollHeight;
    firstScroll.current = false;
  }, [latest]);
  useEffect(() => {
    const read = () => {
      if (
        latest &&
        messageList.current &&
        messageList.current.scrollHeight -
          messageList.current.scrollTop -
          messageList.current.clientHeight <
          20 &&
        document.visibilityState === "visible" &&
        BigInt(latest) > BigInt(seen.current)
      ) {
        seen.current = latest;
        void peopleCommand({
          operation: "read",
          conversation: initial.id,
          seq: latest,
        })
          .then((r) => {
            if (r.error) seen.current = "0";
            else void ctx?.refresh();
          })
          .catch(() => {
            seen.current = "0";
          });
      }
    };
    read();
    const list = messageList.current;
    list?.addEventListener("scroll", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      list?.removeEventListener("scroll", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [latest, initial.id, ctx]);
  async function send() {
    setBusy(true);
    setError("");
    attempt.current ??= crypto.randomUUID();
    try {
      const r = await peopleCommand({
        operation: "send",
        conversation: initial.id,
        id: attempt.current,
        body: draft,
      });
      if (r.error) setError(r.error);
      else {
        setDraft("");
        attempt.current = null;
        await refresh();
        await ctx?.refresh();
      }
    } catch {
      setError(
        "Message was not confirmed. Retry to check the same message ID.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadOlder() {
    setBusy(true);
    try {
      const r = await directHistory({
        conversation: initial.id,
        before: history.items[0]?.seq ?? null,
      });
      if (r.data) {
        setHistory((h) => ({
          ...h,
          items: mergeDirectMessages(r.data!.items, h.items),
        }));
        setOlder(r.data.items.length === 50);
      } else {
        setError(r.error || "History unavailable.");
        if (r.denied) {
          setDenied(true);
          setHistory((h) => ({ ...h, items: [], can_send: false }));
        }
      }
    } catch {
      setError("History unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page people-page">
      <Link href="/messages?tab=conversations">← All conversations</Link>
      <h1>{denied ? "Conversation unavailable" : history.member.name}</h1>
      <p role="status">{status} · Private conversation</p>
      {error && <p role="alert">{error}</p>}
      {reportNotice && <p role="status">{reportNotice}</p>}
      {!denied && (
        <>
          <div className="people-actions">
            <button
              onClick={() => {
                if (confirm("Block this member and prevent contact?"))
                  void peopleCommand({
                    operation: "block",
                    target: history.member.id,
                  })
                    .then((r) => {
                      if (r.error) setError(r.error);
                      else {
                        void refresh();
                        void ctx?.refresh();
                      }
                    })
                    .catch(() =>
                      setError("Block was not confirmed. Please retry."),
                    );
              }}
            >
              Block member
            </button>
            <button onClick={() => void refresh()}>Refresh messages</button>
          </div>
          {older && (
            <button disabled={busy} onClick={() => void loadOlder()}>
              Load older messages
            </button>
          )}
          <section
            ref={messageList}
            className="direct-history"
            aria-label="Direct messages"
            aria-live="polite"
          >
            {history.items.length ? (
              history.items.map((m) => (
                <article className="direct-message" key={m.id}>
                  <strong>
                    {m.sender === member?.id ? "You" : history.member.name}
                  </strong>
                  <time dateTime={m.created_at}>
                    {new Date(m.created_at)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}{" "}
                    UTC
                  </time>
                  <SafeMarkdown text={m.body} />
                  {m.sender !== member?.id && (
                    <button onClick={() => setReport(m.id)}>
                      Report message
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p>No messages yet. Start with a hello.</p>
            )}
          </section>
          {report && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                void peopleCommand({
                  operation: "report",
                  conversation: initial.id,
                  message: report,
                  reason,
                })
                  .then((r) => {
                    if (r.error) setError(r.error);
                    else
                      setReportNotice("Report received for moderator review.");
                    if (!r.error) {
                      setReport(null);
                      setReason("");
                    }
                  })
                  .catch(() =>
                    setError("Report was not confirmed. Please retry."),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Why are you reporting this message?
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button disabled={busy}>Submit report</button>
              <button type="button" onClick={() => setReport(null)}>
                Cancel report
              </button>
            </form>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label>
              Private message
              <textarea
                required
                disabled={!history.can_send || busy}
                maxLength={4000}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  attempt.current = null;
                }}
              />
            </label>
            <button
              disabled={
                busy ||
                !history.can_send ||
                !draft.trim() ||
                status === "Offline"
              }
            >
              {busy ? "Sending…" : "Send message"}
            </button>
            {!history.can_send && (
              <p>
                This member’s current privacy settings do not permit messages
                from you.
              </p>
            )}
          </form>
          <p>
            Messages are stored securely with participant-only access. They are
            not end-to-end encrypted; authorized operators can review reported
            abuse.
          </p>
        </>
      )}
    </div>
  );
}
