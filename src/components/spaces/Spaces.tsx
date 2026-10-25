"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readSpace } from "../../lib/spaces/client";
import { spaceCommand } from "../../lib/spaces/actions";
import { dailyScripture } from "../../lib/spaces/scripture";
import { localInZone } from "../../lib/spaces/validation";
import type {
  Context,
  Preferences,
  Prayer,
  Event,
  SpaceData,
  Notice,
} from "../../lib/spaces/types";
import { SafeMarkdown } from "../chat/SafeMarkdown";
import { usePeople } from "../people/PeopleProvider";
import { useMember } from "../MemberContext";
const preferenceLabels: Record<keyof Preferences, string> = {
  friend_requests: "Friend request updates",
  replies: "Replies to my content",
  mentions: "Mentions in accessible conversations",
  community_invitations: "Community invitations from friends",
  event_reminders: "Event reminders for my Going RSVPs",
  event_updates: "Updates to events I am attending",
  gaming_invitations: "Gaming session invitations from friends",
  moderator_notices: "Notices from my community moderators",
  daily_content: "Show optional daily Scripture",
};
const notificationLabels: Record<string, string> = {
  friend_requests: "A friend request was updated",
  replies: "Someone replied to your content",
  mentions: "You were mentioned",
  community_invitations: "You have a community invitation",
  event_reminders: "An event you are attending starts within an hour",
  event_updates: "An event you are attending was updated or cancelled",
  gaming_invitations: "You have a gaming session invitation",
  moderator_notices: "You have a private moderator notice",
};
export function ZonedTime({ value, zone }: { value: string; zone?: string }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    try {
      setLocal(
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: zone,
        }).format(new Date(value)),
      );
    } catch {
      setLocal("");
    }
  }, [value, zone]);
  return (
    <time dateTime={value}>
      {local ||
        new Date(value).toISOString().slice(0, 16).replace("T", " ") + " UTC"}
      {zone ? ` (${zone})` : " (your local time)"}
    </time>
  );
}
function DailyScripture() {
  const [day, setDay] = useState("");
  useEffect(() => {
    const update = () => setDay(new Date().toISOString().slice(0, 10));
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, []);
  const verse = dailyScripture(day);
  return (
    <blockquote>
      “{verse.text}”
      <cite>
        {verse.reference} · KJV · Curated public-domain Scripture
        {day ? ` · ${day} UTC` : ""}
      </cite>
    </blockquote>
  );
}
export function PreferencesForm({
  value,
  busy,
  onSave,
}: {
  value: Preferences;
  busy: boolean;
  onSave: (p: Preferences) => void;
}) {
  const [p, setP] = useState(value);
  return (
    <form
      className="space-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <h2>Notification preferences</h2>
      <p>
        In-app notifications only. Mentions, invitations and reminders require
        your opt-in. Blocking and access rules always apply.
      </p>
      {(Object.keys(preferenceLabels) as (keyof Preferences)[]).map((k) => (
        <label className="space-check" key={k}>
          <input
            type="checkbox"
            checked={p[k]}
            onChange={(e) => setP({ ...p, [k]: e.target.checked })}
          />
          {preferenceLabels[k]}
        </label>
      ))}
      <button disabled={busy}>Save notification preferences</button>
    </form>
  );
}
function EventEditor({
  context,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  context: Context;
  initial?: Event;
  busy: boolean;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [zone, setZone] = useState(initial?.time_zone || "UTC");
  const [community, setCommunity] = useState(
    initial?.community_id || context.communities[0]?.id || "",
  );
  const [session, setSession] = useState(initial?.gaming_session_id || "");
  const [voice, setVoice] = useState(initial?.voice_channel_id || "");
  const [id] = useState(() => initial?.id || crypto.randomUUID());
  const draft = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSave({
      operation: initial ? "event-update" : "event-create",
      id,
      ...(!initial ? { community } : {}),
      title: f.get("title"),
      description: f.get("description"),
      kind: f.get("kind"),
      banner: f.get("banner"),
      starts_local: f.get("start"),
      ends_local: f.get("end"),
      time_zone: zone,
      session: session || null,
      voice: voice || null,
    });
  };
  return (
    <form className="space-form" onSubmit={draft}>
      <h2>{initial ? "Edit event" : "Create an event"}</h2>
      {!initial && (
        <label>
          Event community
          <select
            required
            value={community}
            onChange={(e) => {
              setCommunity(e.target.value);
              setSession("");
              setVoice("");
            }}
          >
            {context.communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Event title
        <input
          name="title"
          required
          minLength={3}
          maxLength={100}
          defaultValue={initial?.title}
        />
      </label>
      <label>
        Event description
        <textarea
          name="description"
          required
          maxLength={5000}
          defaultValue={initial?.description}
        />
      </label>
      <div className="space-grid">
        <label>
          Gathering type
          <select name="kind" defaultValue={initial?.kind || "gaming"}>
            <option value="gaming">Gaming night</option>
            <option value="voice">Voice hangout</option>
            <option value="discussion">Discussion gathering</option>
          </select>
        </label>
        <label>
          Event banner
          <select name="banner" defaultValue={initial?.banner || "nebula"}>
            {["nebula", "aurora", "ember", "ocean"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Event time zone
        <input
          required
          value={zone}
          maxLength={80}
          list="event-zones"
          onChange={(e) => setZone(e.target.value)}
        />
        <datalist id="event-zones">
          {[
            "UTC",
            "America/New_York",
            "America/Chicago",
            "America/Los_Angeles",
            "Europe/London",
            "Europe/Paris",
            "Australia/Sydney",
          ].map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <p>
        Enter both times in the selected IANA time zone. Guests see their local
        time and the event time zone.
      </p>
      <div className="space-grid">
        <label>
          Start time
          <input
            type="datetime-local"
            name="start"
            required
            defaultValue={
              initial ? localInZone(initial.starts_at, initial.time_zone) : ""
            }
          />
        </label>
        <label>
          End time
          <input
            type="datetime-local"
            name="end"
            required
            defaultValue={
              initial ? localInZone(initial.ends_at, initial.time_zone) : ""
            }
          />
        </label>
      </div>
      <label>
        Linked gaming session
        <select
          value={session}
          onChange={(e) => {
            setSession(e.target.value);
            if (e.target.value) setVoice("");
          }}
        >
          <option value="">None</option>
          {context.sessions
            .filter((s) => !s.community_id || s.community_id === community)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Linked voice room
        <select
          value={voice}
          onChange={(e) => {
            setVoice(e.target.value);
            if (e.target.value) setSession("");
          }}
        >
          <option value="">None</option>
          {context.channels
            .filter((c) => c.community_id === community)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <p>
        Links do not grant membership, a player slot or permission to join
        voice.
      </p>
      <div className="space-actions">
        <button disabled={busy}>
          {initial ? "Save event changes" : "Publish event"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel editing
        </button>
      </div>
    </form>
  );
}
function EventCard({ event: e }: { event: Event }) {
  return (
    <article className="space-card">
      <div className={`space-banner ${e.banner}`}>
        <span>
          {e.kind === "gaming"
            ? "GAME NIGHT"
            : e.kind === "voice"
              ? "VOICE HANGOUT"
              : "DISCUSSION"}
        </span>
        <strong>{e.state.toUpperCase()}</strong>
      </div>
      <div className="space-card-body">
        <p>
          {e.community_name} · Hosted by {e.host_name}
        </p>
        <h2>
          <Link href={`/events/${e.id}`}>{e.title}</Link>
        </h2>
        <ZonedTime value={e.starts_at} />
        <p>
          {e.going} going ·{" "}
          {e.my_rsvp ? `Your RSVP: ${e.my_rsvp}` : "RSVP to join the gathering"}
        </p>
        <Link href={`/events/${e.id}`}>View event →</Link>
      </div>
    </article>
  );
}
function EventDateBadge({ value }: { value: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => {
    setLocal(true);
  }, []);
  // Stable server/initial-client markup before switching to the viewer's locale.
  const zone = local ? undefined : "UTC";
  const locale = local ? undefined : "en-US";
  const date = new Date(value);
  const label = new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: zone,
  }).format(date);
  return <time className="event-date-badge" dateTime={value} aria-label={`Event date: ${label}`} title={label}>
    <span className="event-date-month" aria-hidden="true">{new Intl.DateTimeFormat(locale, { month: "short", timeZone: zone }).format(date)}</span>
    <span className="event-date-day" aria-hidden="true">{new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: zone }).format(date)}</span>
  </time>;
}
export function UpcomingEvents() {
  const [items, setItems] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void readSpace<{ items: Event[] }>({ view: "events" }).then((r) => {
      if (!active) return;
      if (r.data)
        setItems(
          r.data.items
            .filter((e) => e.state === "upcoming" || e.state === "live")
            .slice(0, 3),
        );
      else setError(r.error || "Events unavailable.");
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-upcoming">
      {error ? (
        <p>{error}</p>
      ) : !items ? (
        <p>Loading community events…</p>
      ) : items.length ? (
        items.map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className="space-upcoming-row"
          >
            <span className="space-upcoming-details">
              <strong>{e.title}</strong>
              <ZonedTime value={e.starts_at} />
            </span>
            <EventDateBadge value={e.starts_at} />
          </Link>
        ))
      ) : (
        <p>
          No upcoming events in your communities.{" "}
          <Link href="/events">Explore events</Link>.
        </p>
      )}
    </div>
  );
}
function InviteComposer({
  context,
  busy,
  onSend,
}: {
  context: Context;
  busy: boolean;
  onSend: (v: unknown) => void;
}) {
  const people = usePeople();
  const [community, setCommunity] = useState(context.communities[0]?.id || "");
  const [target, setTarget] = useState("");
  const [session, setSession] = useState("");
  const [recipient, setRecipient] = useState("");
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [body, setBody] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const staff = context.communities.find((c) => c.id === community)?.rank || 0;
  useEffect(() => {
    let active = true;
    setRoster([]);
    if (staff >= 20)
      void readSpace<{ items: { id: string; name: string }[] }>({
        view: "recipients",
        community,
      }).then((r) => {
        if (active && r.data) setRoster(r.data.items);
      });
    return () => {
      active = false;
    };
  }, [community, staff]);
  const friends =
    people?.home?.friends.filter((f) => f.relationship === "friends") || [];
  return (
    <details className="space-panel">
      <summary>Invitations & moderator notices</summary>
      <p>
        Invitations require an accepted friendship, recipient opt-in and current
        access. Acceptance never bypasses game limits or voice permissions.
      </p>
      <label>
        Invitation community
        <select
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
        >
          {context.communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Invite a friend
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a friend</option>
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {staff >= 20 && (
        <button
          disabled={busy || !target}
          onClick={() =>
            onSend({ operation: "invite-community", community, target })
          }
        >
          Send community invitation
        </button>
      )}
      <label>
        Gaming session to invite to
        <select value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">Choose your session</option>
          {context.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !target || !session}
        onClick={() => onSend({ operation: "invite-squad", session, target })}
      >
        Send gaming invitation
      </button>
      {staff >= 20 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend({
              operation: "notice-create",
              id,
              community,
              target: recipient,
              body,
            });
            setId(crypto.randomUUID());
          }}
        >
          <h3>Private moderator notice</h3>
          <label>
            Notice recipient
            <select
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              <option value="">Choose a community member</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Private notice body
            <textarea
              required
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p>
            Only the intended recipient can read this body. The notification
            contains a generic notice.
          </p>
          <button disabled={busy}>Send moderator notice</button>
        </form>
      )}
    </details>
  );
}
export function SpaceWorkspace({
  initialCommunity,
  view,
  resource,
  context,
  unavailable,
}: {
  initialCommunity?:string;
  view: "faith" | "events" | "notifications" | "prayer" | "event";
  resource: string | null;
  context: Context | null;
  unavailable: boolean;
}) {
  const router = useRouter(),
    people = usePeople(),
    member = useMember();
  const [community, setCommunity] = useState(context?.communities.some(c=>c.id===initialCommunity)?initialCommunity!:context?.communities[0]?.id || "");
  const [filter, setFilter] = useState("all");
  const [before, setBefore] = useState<string | null>(null);
  const [data, setData] = useState<SpaceData | Event | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [editor, setEditor] = useState(false),
    [editPrayer, setEditPrayer] = useState(false),
    [editBody, setEditBody] = useState(""),
    [editVisibility, setEditVisibility] = useState<"community" | "moderators">(
      "moderators",
    ),
    [privateNotice, setPrivateNotice] = useState("");
  const [prefs, setPrefs] = useState(context?.preferences);
  const [body, setBody] = useState(""),
    [visibility, setVisibility] = useState<"community" | "moderators">(
      "moderators",
    ),
    [agreed, setAgreed] = useState(false),
    [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!context) return;
    if (view === "faith" && !community) {
      setData({ items: [] });
      return;
    }
    const n = ++generation.current;
    setLoading(true);
    const r = await readSpace<SpaceData | Event>({
      view: view === "faith" ? "prayers" : view,
      resource,
      community:
        view === "faith" || view === "events" ? community || null : null,
      before,
      filter,
    });
    if (n !== generation.current) return;
    if (r.data) {
      setData(r.data);
      setError("");
    } else {
      setError(r.error || "This space is unavailable.");
      setData(null);
    }
    setLoading(false);
  }, [view, resource, community, before, filter, context]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => {
      // Invalidate pending fetches; this is a generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearInterval(t);
    };
  }, [load]);
  const unread = people?.home?.all_notification_unread;
  useEffect(() => {
    if (view === "notifications") void load();
  }, [unread, view, load]);
  async function run(input: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const r = await spaceCommand(input);
      if (r.error) {
        setNotice(r.error);
        return false;
      }
      setNotice("Saved.");
      const op = (input as { operation: string }).operation;
      if (r.data?.href) {
        router.push(r.data.href);
        return true;
      }
      if (r.data?.id && (op === "prayer-create" || op === "event-create")) {
        router.push(
          `/${op === "prayer-create" ? "faith" : "events"}/${r.data.id}`,
        );
        return true;
      }
      if (op === "event-update") setEditor(false);
      if (op === "prayer-edit") setEditPrayer(false);
      if (op === "prayer-comment") {
        setBody("");
        setAttempt(crypto.randomUUID());
      }
      await load();
      await people?.refresh();
      return true;
    } catch {
      setNotice("Request was not confirmed. Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const page = data as SpaceData | null;
  const prayer = page?.prayer;
  const event = view === "event" ? (data as Event | null) : null;
  const title =
    view === "faith"
      ? "Faith & Life"
      : view === "events"
        ? "Gather together."
        : view === "notifications"
          ? "Your notifications"
          : view === "prayer"
            ? "Prayer & encouragement"
            : event?.title || "Community event";
  if (unavailable || !context)
    return (
      <div className="page space-page">
        <h1>{title}</h1>
        <p role="status">
          Community spaces are unavailable. An administrator may need to apply
          the Phase 10 migrations.
        </p>
      </div>
    );
  const items = page?.items || [];
  const pageBefore =
    view === "prayer"
      ? page?.comments?.[0]?.seq
      : (items.at(-1) as Prayer | Event | undefined)?.seq ||
        (items.at(-1) as Notice | undefined)?.id;
  return (
    <div className="page space-page">
      <header className="space-heading">
        <span className="eyebrow">FAITH · FRIENDSHIP · LIFE TOGETHER</span>
        <h1>{title}</h1>
        <p>
          {view === "faith"
            ? "A kind space to ask for prayer, offer encouragement and walk together."
            : view === "events"
              ? "Game nights, voice hangouts and meaningful conversations with your communities."
              : view === "notifications"
                ? "Updates you asked for, with privacy at the center."
                : ""}
        </p>
      </header>
      <nav className="space-actions" aria-label="Community spaces">
        <Link href="/faith">Faith & Life</Link>
        <Link href="/events">Events</Link>
        <Link href="/notifications">Notifications</Link>
        <button disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </nav>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {loading && !data && <p role="status">Loading your community space…</p>}
      {view === "faith" && (
        <>
          <section className="space-panel">
            <h2>Our shared guidelines</h2>
            <p>
              Lead with kindness, respect and faith. Encourage without judgment.
              Ask before offering advice. Never copy or share another member’s
              prayer request without permission. Moderators may limit sensitive
              content to protect the community.
            </p>
            <p>
              <strong>Community requests</strong> are visible to active members.{" "}
              <strong>Private requests</strong> are visible only to you and
              current, unblocked moderators of the selected community.
            </p>
          </section>
          {prefs && (
            <section className="space-panel">
              <label className="space-check">
                <input
                  type="checkbox"
                  checked={prefs.daily_content}
                  onChange={(e) => {
                    const next = { ...prefs, daily_content: e.target.checked };
                    setPrefs(next);
                    void run({ operation: "preferences", ...next });
                  }}
                />
                Show optional daily Scripture
              </label>
              {prefs.daily_content && <DailyScripture />}
            </section>
          )}
        </>
      )}
      {(view === "faith" || view === "events") && (
        <div className="space-actions">
          <label>
            Community
            <select
              aria-label="Community"
              value={community}
              onChange={(e) => {
                setCommunity(e.target.value);
                setBefore(null);
                setData(null);
              }}
            >
              {view === "events" && (
                <option value="">All my communities</option>
              )}
              {context.communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {view === "events" && (
            <label>
              Event type
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setBefore(null);
                }}
              >
                <option value="all">All gatherings</option>
                <option value="gaming">Gaming nights</option>
                <option value="voice">Voice hangouts</option>
                <option value="discussion">Discussion gatherings</option>
              </select>
            </label>
          )}
        </div>
      )}
      {(view === "faith" || view === "events") &&
        !context.communities.length && (
          <section className="space-panel">
            <h2>Find a community first</h2>
            <p>These spaces are for active community members.</p>
            <Link href="/communities">Browse and join communities</Link>
          </section>
        )}
      {view === "faith" && community && (
        <>
          <details className="space-panel">
            <summary>Submit a prayer request</summary>
            <form
              className="space-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run({
                  operation: "prayer-create",
                  id: attempt,
                  community,
                  body,
                  visibility,
                  guidelines: agreed,
                });
              }}
            >
              <label>
                Your prayer request
                <textarea
                  required
                  maxLength={4000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <label>
                Prayer visibility
                <select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as typeof visibility)
                  }
                >
                  <option value="moderators">Private to moderators</option>
                  <option value="community">
                    Visible to community members
                  </option>
                </select>
              </label>
              <label className="space-check">
                <input
                  type="checkbox"
                  required
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                I agree to the kindness and confidentiality guidelines.
              </label>
              <button disabled={busy}>Submit prayer request</button>
            </form>
          </details>
          <section aria-label="Prayer requests">
            {(items as Prayer[]).map((p) => (
              <article className="space-card space-card-body" key={p.id}>
                <p className="space-badge">
                  {p.visibility === "moderators"
                    ? "Private to moderators"
                    : "Community prayer"}{" "}
                  · {p.status}
                </p>
                <h2>{p.author_name}</h2>
                <SafeMarkdown text={p.body} />
                <p>{p.encouragements} encouragements</p>
                <Link href={`/faith/${p.id}`}>Open prayer request →</Link>
              </article>
            ))}
            {!items.length && !loading && !error && (
              <p>No prayer requests visible here yet.</p>
            )}
          </section>
        </>
      )}
      {view === "prayer" && prayer && (
        <>
          <article className="space-panel">
            <p className="space-badge">
              {prayer.visibility === "moderators"
                ? "Private to moderators"
                : "Community prayer"}{" "}
              · {prayer.status}
            </p>
            <h2>{prayer.author_name}</h2>
            <ZonedTime value={prayer.created_at} />
            <SafeMarkdown text={prayer.body || "This request was removed."} />
            <p>{prayer.encouragements} encouragements</p>
            {["open", "answered"].includes(prayer.status) && (
              <button
                disabled={busy}
                onClick={() =>
                  void run({
                    operation: "prayer-encourage",
                    prayer: prayer.id,
                    enabled: !prayer.encouraged,
                  })
                }
              >
                {prayer.encouraged
                  ? "Withdraw encouragement"
                  : "I am praying for you"}
              </button>
            )}
            {prayer.can_manage && (
              <details className="space-moderation">
                <summary>
                  Request controls
                  {prayer.moderator ? " & sensitive-request moderation" : ""}
                </summary>
                {prayer.author_id === member?.id && (
                  <button
                    onClick={() => {
                      setEditBody(prayer.body);
                      setEditVisibility(prayer.visibility);
                      setEditPrayer(true);
                    }}
                  >
                    Edit my request
                  </button>
                )}
                {editPrayer && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run({
                        operation: "prayer-edit",
                        prayer: prayer.id,
                        body: editBody,
                        visibility: editVisibility,
                      });
                    }}
                  >
                    <label>
                      Updated request
                      <textarea
                        required
                        maxLength={4000}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                      />
                    </label>
                    <label>
                      Updated visibility
                      <select
                        value={editVisibility}
                        onChange={(e) =>
                          setEditVisibility(
                            e.target.value as typeof editVisibility,
                          )
                        }
                      >
                        <option value="moderators">
                          Private to moderators
                        </option>
                        <option value="community">
                          Visible to community members
                        </option>
                      </select>
                    </label>
                    <button disabled={busy}>Save request changes</button>
                  </form>
                )}
                {prayer.moderator && (
                  <label>
                    Moderation reason
                    <input
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                )}
                <div className="space-actions">
                  {(
                    [
                      "answered",
                      "open",
                      ...(prayer.moderator ? ["hidden"] : []),
                      "removed",
                    ] as const
                  ).map((status) => (
                    <button
                      key={status}
                      disabled={busy}
                      onClick={() => {
                        if (
                          status !== "removed" ||
                          confirm("Remove this request and its comments?")
                        )
                          void run({
                            operation: "prayer-status",
                            prayer: prayer.id,
                            status,
                            reason,
                          });
                      }}
                    >
                      {status === "answered"
                        ? "Mark answered"
                        : status === "open"
                          ? "Reopen request"
                          : status === "hidden"
                            ? "Hide sensitive request"
                            : "Remove request"}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </article>
          <section className="space-panel">
            <h2>Comments & encouragement</h2>
            {page?.comments?.map((c) => (
              <article className="space-comment" key={c.id}>
                <strong>{c.author_name}</strong>
                <SafeMarkdown text={c.body} />
                {c.can_remove && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run({
                        operation: "prayer-comment-remove",
                        prayer: prayer.id,
                        comment: c.id,
                      })
                    }
                  >
                    Remove comment
                  </button>
                )}
              </article>
            ))}
            {["open", "answered"].includes(prayer.status) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({
                    operation: "prayer-comment",
                    prayer: prayer.id,
                    id: attempt,
                    body,
                  });
                }}
              >
                <label>
                  Offer encouragement
                  <textarea
                    required
                    maxLength={2000}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Post encouragement</button>
              </form>
            )}
          </section>
        </>
      )}
      {view === "events" && (
        <>
          {context.communities.length > 0 && (
            <button onClick={() => setEditor(true)}>Create an event</button>
          )}
          {editor && (
            <section className="space-panel">
              <EventEditor
                context={context}
                busy={busy}
                onSave={(v) => void run(v)}
                onCancel={() => setEditor(false)}
              />
            </section>
          )}
          <div className="space-cards">
            {(items as Event[]).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
          {!items.length && !loading && !error && (
            <p>No events match your communities and filters.</p>
          )}
        </>
      )}
      {view === "event" && event?.id && (
        <>
          <article className="space-card">
            <div className={`space-banner ${event.banner}`}>
              <span>{event.kind.toUpperCase()} GATHERING</span>
              <strong>{event.state.toUpperCase()}</strong>
            </div>
            <div className="space-card-body">
              <p>
                {event.community_name} · Hosted by {event.host_name}
              </p>
              <SafeMarkdown text={event.description} />
              <p>
                Starts: <ZonedTime value={event.starts_at} />
              </p>
              <p>
                Ends: <ZonedTime value={event.ends_at} />
              </p>
              <p>
                Event zone:{" "}
                <ZonedTime value={event.starts_at} zone={event.time_zone} />
              </p>
              <p>
                {event.going} going · Your RSVP:{" "}
                {event.my_rsvp || "Not yet answered"}
              </p>
              {["upcoming", "live"].includes(event.state) && (
                <div className="space-actions">
                  {["going", "interested", "declined", "withdraw"].map(
                    (response) => (
                      <button
                        key={response}
                        disabled={busy}
                        onClick={() =>
                          void run({
                            operation: "rsvp",
                            id: event.id,
                            response,
                          })
                        }
                      >
                        {response === "going"
                          ? "RSVP Going"
                          : response === "interested"
                            ? "Interested"
                            : response === "declined"
                              ? "Cannot attend"
                              : "Withdraw RSVP"}
                      </button>
                    ),
                  )}
                </div>
              )}
              {event.gaming_session_id && (
                <p>
                  <Link href={`/squad-up/${event.gaming_session_id}`}>
                    Open linked gaming session
                  </Link>
                </p>
              )}
              {event.voice_channel_id && (
                <p>
                  <Link href={`/channels/${event.voice_channel_id}`}>
                    Open linked voice room
                  </Link>
                </p>
              )}
              {event.can_manage && (
                <div className="space-actions">
                  <button
                    disabled={
                      event.state === "cancelled" || event.state === "ended"
                    }
                    onClick={() => setEditor(true)}
                  >
                    Edit event
                  </button>
                  <button
                    disabled={busy || event.state === "cancelled"}
                    onClick={() => {
                      if (
                        confirm(
                          "Cancel this event? Attendees with updates enabled will be notified.",
                        )
                      )
                        void run({ operation: "event-cancel", id: event.id });
                    }}
                  >
                    Cancel event
                  </button>
                </div>
              )}
            </div>
          </article>
          {editor && (
            <section className="space-panel">
              <EventEditor
                context={context}
                initial={event}
                busy={busy}
                onSave={(v) => void run(v)}
                onCancel={() => setEditor(false)}
              />
            </section>
          )}
        </>
      )}
      {view === "notifications" && (
        <>
          <section className="space-panel">
            <h2>In-app updates</h2>
            <p>{page?.unread || 0} unread</p>
            <button
              disabled={busy}
              onClick={() => void run({ operation: "notifications-read" })}
            >
              Mark all updates read
            </button>
            {(items as Notice[]).map((n) => (
              <article className="space-notification" key={n.id}>
                <p>
                  <strong>
                    {notificationLabels[n.kind] || "Community update"}
                  </strong>{" "}
                  · {n.read ? "Read" : "Unread"}
                </p>
                <ZonedTime value={n.created_at} />
                <div className="space-actions">
                  {n.resource_type === "community_invite" ||
                  n.resource_type === "squad_invite" ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run({
                            operation:
                              n.resource_type === "community_invite"
                                ? "accept-community"
                                : "accept-squad",
                            id: n.resource_id,
                          })
                        }
                      >
                        Accept invitation
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run({
                            operation:
                              n.resource_type === "community_invite"
                                ? "decline-community"
                                : "decline-squad",
                            id: n.resource_id,
                          })
                        }
                      >
                        Decline invitation
                      </button>
                    </>
                  ) : n.resource_type === "notice" ? (
                    <button
                      onClick={() =>
                        void readSpace<{ body: string }>({
                          view: "notice",
                          resource: n.resource_id,
                        }).then((r) => {
                          if (r.data) setPrivateNotice(r.data.body);
                          else setNotice(r.error || "Notice unavailable.");
                        })
                      }
                    >
                      Read private notice
                    </button>
                  ) : (
                    <Link href={n.href}>Open update</Link>
                  )}
                  <button
                    disabled={busy || n.read}
                    onClick={() =>
                      void run({ operation: "notifications-read", id: n.id })
                    }
                  >
                    Mark read
                  </button>
                </div>
              </article>
            ))}
            {!items.length && !loading && !error && (
              <p>
                You’re all caught up. Only permitted, opted-in notifications
                appear here.
              </p>
            )}
            {privateNotice && (
              <section aria-label="Private moderator notice">
                <h3>Private moderator notice</h3>
                <SafeMarkdown text={privateNotice} />
                <button onClick={() => setPrivateNotice("")}>
                  Close private notice
                </button>
              </section>
            )}
          </section>
          {prefs && (
            <section className="space-panel">
              <PreferencesForm
                value={prefs}
                busy={busy}
                onSave={(v) => {
                  setPrefs(v);
                  void run({ operation: "preferences", ...v });
                }}
              />
            </section>
          )}
          <InviteComposer
            context={context}
            busy={busy}
            onSend={(v) => void run(v)}
          />
        </>
      )}
      {pageBefore &&
        ((view === "prayer" && (page?.comments?.length || 0) === 40) ||
          (view === "notifications" && items.length === 30) ||
          ((view === "faith" || view === "events") && items.length === 20)) && (
          <button disabled={loading} onClick={() => setBefore(pageBefore)}>
            Older {view === "prayer" ? "comments" : "items"}
          </button>
        )}
      {before && (
        <button onClick={() => setBefore(null)}>Back to newest</button>
      )}
    </div>
  );
}
