"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Gamepad2,
  Users,
  Headphones,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { EmptyState, ProfileAvatar } from "../ui";
import { SafeMarkdown } from "../chat/SafeMarkdown";
import { VoiceRoomPanel } from "../voice/VoiceControls";
import { useVoice } from "../voice/VoiceProvider";
import {
  getSquads,
  getSquad,
  getSquadBlocks,
  squadCommand,
} from "../../lib/squads/actions";
import type { SquadFilters } from "../../lib/squads/validation";
import type { Squad, SquadOptions, Page, Block } from "../../lib/squads/types";
function date(value: string) {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
function state(s: Squad, now: number) {
  return s.state === "cancelled" || s.state === "expired"
    ? s.state
    : new Date(s.expires_at).getTime() <= now
      ? "expired"
      : s.state;
}
function useClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
function Identity({
  name,
  id,
  avatar,
}: {
  name: string;
  id: string | null;
  avatar: boolean;
}) {
  return (
    <div className="squad-identity">
      {avatar && id ? (
        <img
          src={`/api/avatars/${id}`}
          width={36}
          height={36}
          alt={`${name} avatar`}
        />
      ) : (
        <ProfileAvatar name={name} />
      )}
      <span>{name}</span>
    </div>
  );
}
export function SquadCard({ s }: { s: Squad }) {
  const now = useClock();
  const current = state(s, now);
  return (
    <article
      className={`panel squad-card squad-${s.play_style}`}
      data-session-id={s.id}
    >
      <div className="squad-card-art">
        <Gamepad2 size={42} />
        <span>{s.game_name}</span>
        <span className={`pill squad-state ${current}`}>
          {current === "open" ? "Looking for players" : current}
        </span>
      </div>
      <div className="squad-card-body">
        <div className="squad-tags">
          <span className="pill">{s.platform_name}</span>
          <span className="pill">
            {s.cross_play ? "Cross-play welcome" : "Same platform"}
          </span>
          <span className="pill">{s.play_style}</span>
          {s.game_night && <span className="pill">Community game night</span>}
        </div>
        <h2>
          <Link href={`/squad-up/${s.id}`}>{s.title}</Link>
        </h2>
        <p className="squad-excerpt">{s.description}</p>
        <Identity name={s.host_name} id={s.host_id} avatar={s.host_avatar} />
        <div className="squad-card-facts">
          <span>
            <Users size={16} />
            {s.accepted_count}/{s.max_players} reserved ·{" "}
            {Math.max(0, s.max_players - s.accepted_count)} slots
          </span>
          <span>
            <CalendarDays size={16} />
            {s.starts_at ? date(s.starts_at) : "Starting now"}
          </span>
        </div>
        <p className="muted">
          {s.community_name ??
            (s.visibility === "friends"
              ? "Friends · accepted friends"
              : "All verified members")}
          {s.requires_approval ? " · Host approval" : ""}
        </p>
        <Link className="button secondary" href={`/squad-up/${s.id}`}>
          {s.is_host
            ? "Manage session"
            : s.my_status === "accepted"
              ? "Open your group"
              : s.my_status === "pending"
                ? "Request pending"
                : current === "full"
                  ? "View full group"
                  : current === "expired" || current === "cancelled"
                    ? "View session"
                    : "View & join"}
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}
function CreateSession({
  options,
  onCreated,
}: {
  options: SquadOptions;
  onCreated: (id: string) => void;
}) {
  const [game, setGame] = useState(
      options.games.find((g) =>
        options.compatibility.some((m) => m.game_id === g.id),
      )?.id ?? "",
    ),
    [platform, setPlatform] = useState(""),
    [cross, setCross] = useState(false),
    [visibility, setVisibility] = useState("public"),
    [community, setCommunity] = useState(""),
    [night, setNight] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [operationId, setOperationId] = useState<string | null>(null);
  const compatible = options.compatibility.filter((m) => m.game_id === game);
  const selectedPlatform = platform || compatible[0]?.platform_id || "";
  const pool = compatible.find(
    (m) => m.platform_id === selectedPlatform,
  )?.crossplay_pool;
  const crossAvailable =
    !!pool &&
    compatible.some(
      (m) => m.platform_id !== selectedPlatform && m.crossplay_pool === pool,
    );
  const staff = options.communities.find((c) => c.id === community)?.staff;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const id = operationId ?? crypto.randomUUID();
    setOperationId(id);
    try {
      const rawStart = String(form.get("starts") ?? "");
      const start = rawStart ? new Date(rawStart).toISOString() : null;
      const r = await squadCommand({
        operation: "create",
        id,
        title: form.get("title"),
        description: form.get("description"),
        game,
        platform: selectedPlatform,
        cross_play: cross && crossAvailable,
        style: form.get("style"),
        max_players: Number(form.get("maximum")),
        approval: form.get("approval") === "on",
        visibility,
        community: visibility === "community" ? community : null,
        game_night: visibility === "community" && !!staff && night,
        starts_at: start,
      });
      if (!r.data)
        setError(r.error ?? "Squad Up is unavailable. Please retry.");
      else if (r.data.id) onCreated(r.data.id);
    } catch {
      setError(
        "Creation could not be confirmed. Retry the unchanged session to avoid duplicates.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded squad-create">
      <h2>Create your gaming session</h2>
      <p>
        Pick your game and your pace. Your host spot counts toward the player
        limit.
      </p>
      <form onSubmit={submit} onChange={() => setOperationId(null)}>
        <fieldset disabled={busy}>
          <div className="squad-form-grid">
            <label className="field">
              Session title
              <input
                name="title"
                required
                minLength={3}
                maxLength={80}
                placeholder="A good game with good people"
              />
            </label>
            <label className="field">
              Game
              <select
                aria-label="Game"
                value={game}
                required
                onChange={(e) => {
                  setGame(e.target.value);
                  setPlatform("");
                  setCross(false);
                }}
              >
                {options.games
                  .filter((g) =>
                    options.compatibility.some((m) => m.game_id === g.id),
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Host platform
              <select
                aria-label="Host platform"
                value={selectedPlatform}
                required
                onChange={(e) => {
                  setPlatform(e.target.value);
                  setCross(false);
                }}
              >
                {compatible.map((m) => (
                  <option key={m.platform_id} value={m.platform_id}>
                    {
                      options.platforms.find((p) => p.id === m.platform_id)
                        ?.name
                    }
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Play style
              <select name="style" aria-label="Play style">
                <option value="casual">Casual · good company</option>
                <option value="competitive">Competitive · play to win</option>
              </select>
            </label>
            <label className="field">
              Maximum players
              <input
                name="maximum"
                type="number"
                min={2}
                max={50}
                defaultValue={4}
                required
              />
            </label>
            <label className="field">
              Scheduled start (optional)
              <input name="starts" type="datetime-local" />
            </label>
            <label className="field">
              Audience
              <select
                aria-label="Session audience"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="public">All verified members</option>
                <option value="friends">Friends · accepted friends</option>
                <option
                  value="community"
                  disabled={!options.communities.length}
                >
                  Community members
                </option>
              </select>
            </label>
            {visibility === "community" && (
              <label className="field">
                Community
                <select
                  aria-label="Session community"
                  value={community}
                  required
                  onChange={(e) => {
                    setCommunity(e.target.value);
                    setNight(false);
                  }}
                >
                  <option value="">Choose a community</option>
                  {options.communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="field">
            Session description
            <textarea
              name="description"
              required
              maxLength={2000}
              rows={4}
              placeholder="What are we playing? What should your teammates know?"
            />
          </label>
          <label className="squad-check">
            <input
              type="checkbox"
              checked={cross && crossAvailable}
              disabled={!crossAvailable}
              onChange={(e) => setCross(e.target.checked)}
            />
            Allow supported cross-play
          </label>
          <p className="helper-text">
            Check game editions, generations and regional availability with your
            group. Minecraft cross-play requires compatible Bedrock editions.
          </p>
          <label className="squad-check">
            <input type="checkbox" name="approval" />
            Approve members before they join
          </label>
          {visibility === "community" && staff && (
            <label className="squad-check">
              <input
                type="checkbox"
                checked={night}
                onChange={(e) => setNight(e.target.checked)}
              />
              List as a community game night
            </label>
          )}
          <p className="helper-text">
            Times use your device’s local timezone and are displayed in UTC
            after creation. The session page shows its start, voice opening and
            expiration times. Your group sees your display name. Discovery host
            identity follows your profile and gaming-activity settings.
          </p>
          <button
            className="button primary"
            disabled={busy || !selectedPlatform}
          >
            {busy ? "Creating…" : "Create session"}
          </button>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
function Blocks() {
  const [rows, setRows] = useState<Block[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await getSquadBlocks();
      if (!r.data)
        setError(r.error ?? "Squad Up is unavailable. Please retry.");
      else setRows(r.data);
    } catch {
      setError("Your block list could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded squad-blocks">
      <h2>Blocked members</h2>
      <p>
        These blocks govern Squad Up discovery, membership and voice. Blocking a
        host hides their sessions. Blocking separates shared squads and revokes
        their voice access. Unblocking does not restore withdrawn or removed
        places.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        Load blocked members
      </button>
      {error && <p role="alert">{error}</p>}
      {rows && !rows.length && <p>No blocked members.</p>}
      <ul>
        {rows?.map((b) => (
          <li key={b.blocked_id}>
            <strong>{b.label}</strong>
            <small>Blocked {date(b.created_at)}</small>
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await squadCommand({
                    operation: "unblock",
                    target: b.blocked_id,
                  });
                  if (!r.data)
                    setError(
                      r.error ?? "Squad Up is unavailable. Please retry.",
                    );
                  else await load();
                } catch {
                  setError("Unblocking could not be saved.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
export function SquadDirectory({
  options,
  initial,
  filters: initialFilters,
  unavailable,
}: {
  options: SquadOptions;
  initial: Page;
  filters: SquadFilters;
  unavailable: boolean;
}) {
  const [page, setPage] = useState(initial),
    [filters, setFilters] = useState(initialFilters),
    [view, setView] = useState("browse"),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState<string | null>(null),
    [error, setError] = useState(
      unavailable
        ? "Squad Up is unavailable. An administrator may need to apply the Phase 8 migrations."
        : "",
    );
  async function load(next = filters, older = false) {
    setBusy(true);
    setError("");
    try {
      const r = await getSquads({ ...next, before: older ? page.next : null });
      if (!r.data)
        setError(r.error ?? "Squad Up is unavailable. Please retry.");
      else {
        setFilters(next);
        setPage((v) => ({
          items: older
            ? [
                ...v.items,
                ...r.data.items.filter(
                  (s) => !v.items.some((x) => x.id === s.id),
                ),
              ]
            : r.data.items,
          next: r.data.next,
        }));
      }
    } catch {
      setError("Sessions could not be loaded. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  if (created)
    return (
      <section className="panel padded">
        <h2>Your session is ready.</h2>
        <p role="status">Your session was saved. Your host spot is reserved.</p>
        <Link className="button primary" href={`/squad-up/${created}`}>
          Open your session
          <ArrowUpRight size={16} />
        </Link>
        <button
          className="button secondary"
          onClick={() => {
            setCreated(null);
            setView("browse");
            void load({ ...filters, mode: "mine" });
          }}
        >
          Back to your sessions
        </button>
      </section>
    );
  return (
    <div className="squad-workspace">
      <section className="squad-hero panel padded">
        <div>
          <span className="eyebrow">GOOD COMMS. GREAT TEAMMATES.</span>
          <h2>Less scrolling. More playing.</h2>
          <p>
            Browse real sessions, reserve a place, and meet your group in voice.
          </p>
        </div>
        <Gamepad2 size={64} aria-hidden="true" />
      </section>
      <nav className="squad-tabs" aria-label="Squad Up views">
        {[
          ["browse", "Find a session"],
          ["create", "Create a session"],
          ["blocks", "Blocked members"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={view === key ? "page" : undefined}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p className="squad-privacy-note">
        <ShieldCheck size={16} />
        Friends-only means accepted friendships.{" "}
        <Link href="/messages?tab=discover">Find and add friends.</Link> Counts
        update on refresh; joining always rechecks space.
      </p>
      {view === "create" ? (
        <CreateSession options={options} onCreated={setCreated} />
      ) : view === "blocks" ? (
        <Blocks />
      ) : (
        <>
          <section
            className="panel padded squad-filters"
            aria-label="Filter gaming sessions"
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            <fieldset disabled={busy}>
              <label className="field">
                Show
                <select
                  aria-label="Session listing"
                  value={filters.mode}
                  onChange={(e) =>
                    void load({
                      ...filters,
                      mode: e.target.value as SquadFilters["mode"],
                    })
                  }
                >
                  <option value="discover">All sessions</option>
                  <option value="mine">My sessions</option>
                  <option value="game-nights">Community game nights</option>
                </select>
              </label>
              <label className="field">
                Game
                <select
                  aria-label="Filter game"
                  value={filters.game ?? ""}
                  onChange={(e) =>
                    void load({ ...filters, game: e.target.value || null })
                  }
                >
                  <option value="">All games</option>
                  {options.games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Platform
                <select
                  aria-label="Filter platform"
                  value={filters.platform ?? ""}
                  onChange={(e) =>
                    void load({ ...filters, platform: e.target.value || null })
                  }
                >
                  <option value="">All platforms</option>
                  {options.platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Player slots
                <select
                  aria-label="Filter player slots"
                  value={filters.slots}
                  onChange={(e) =>
                    void load({ ...filters, slots: Number(e.target.value) })
                  }
                >
                  {[
                    [0, "Any availability"],
                    [1, "At least 1 slot"],
                    [2, "At least 2 slots"],
                    [3, "At least 3 slots"],
                    [4, "At least 4 slots"],
                  ].map(([n, label]) => (
                    <option key={n} value={n}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Time
                <select
                  aria-label="Filter time"
                  value={filters.when}
                  onChange={(e) =>
                    void load({
                      ...filters,
                      when: e.target.value as SquadFilters["when"],
                    })
                  }
                >
                  {[
                    ["any", "Any time"],
                    ["now", "Now / next 15 minutes"],
                    ["day", "Next 24 hours"],
                    ["week", "Next 7 days"],
                    ["scheduled", "Scheduled ahead"],
                  ].map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Style
                <select
                  aria-label="Filter play style"
                  value={filters.style ?? ""}
                  onChange={(e) =>
                    void load({
                      ...filters,
                      style: (e.target.value || null) as SquadFilters["style"],
                    })
                  }
                >
                  <option value="">Any style</option>
                  <option value="casual">Casual</option>
                  <option value="competitive">Competitive</option>
                </select>
              </label>
              <label className="field">
                Community
                <select
                  aria-label="Filter session community"
                  value={filters.community ?? ""}
                  onChange={(e) =>
                    void load({ ...filters, community: e.target.value || null })
                  }
                >
                  <option value="">All accessible communities</option>
                  {options.communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button secondary" onClick={() => void load()}>
                Refresh sessions
              </button>
            </fieldset>
          </section>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {busy && <p role="status">Loading sessions…</p>}
          {!busy && !page.items.length && (
            <EmptyState
              title="Your next party is waiting to happen"
              description="Create a session or try another game, platform or time."
            />
          )}
          <div className="squad-grid">
            {page.items.map((s) => (
              <SquadCard key={s.id} s={s} />
            ))}
          </div>
          {page.next && (
            <button
              className="button secondary squad-more"
              disabled={busy}
              onClick={() => void load(filters, true)}
            >
              Older sessions
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function SquadDetail({
  initial,
  voiceConfigured,
}: {
  initial: Squad;
  voiceConfigured: boolean;
}) {
  const [s, setSquad] = useState(initial),
    [platform, setPlatform] = useState(initial.platform_id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [missing, setMissing] = useState(false);
  const now = useClock(),
    v = useVoice();
  const current = state(s, now),
    ended = ["expired", "cancelled"].includes(current);
  const accepted = s.my_status === "accepted";
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const r = await getSquad(s.id);
      if (!r.data) {
        setMissing(true);
        setError(r.error ?? "Squad Up is unavailable. Please retry.");
      } else {
        setSquad(r.data);
        setMissing(false);
      }
    } catch {
      setError("Session could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }
  async function command(operation: string, target?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await squadCommand({
        operation,
        ...(operation === "unblock" ? {} : { session: s.id }),
        ...(target ? { target } : {}),
        ...(operation === "join" ? { platform } : {}),
      });
      if (!r.data) {
        setError(r.error ?? "Squad Up is unavailable. Please retry.");
        return;
      }
      if (
        ["withdraw", "cancel", "block-host", "block-member", "remove"].includes(
          operation,
        ) &&
        v?.session?.channel === s.id &&
        operation !== "remove" &&
        operation !== "block-member"
      ) {
        await v.leave();
        // The committed membership command has already revoked this reservation.
        v.setError("");
      }
      setNotice(
        operation === "join"
          ? r.data.status === "pending"
            ? "Your request is saved. Host approval is required before voice access."
            : "Your place is reserved."
          : operation === "cancel"
            ? "Session cancelled. Voice access has ended."
            : operation === "block-host"
              ? "Host blocked. Shared squad reservations have been withdrawn."
              : operation === "withdraw"
                ? "You have withdrawn from the session."
                : "Your change was saved.",
      );
      await refresh();
    } catch {
      setError("The change could not be confirmed. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="squad-detail">
      <header className="panel padded squad-detail-header">
        <span className="eyebrow">
          {s.game_name} · {s.game_night ? "COMMUNITY GAME NIGHT" : "SQUAD UP"}
        </span>
        <h1>{s.title}</h1>
        <div className="squad-tags">
          <span className="pill">{current}</span>
          <span className="pill">{s.play_style}</span>
          <span className="pill">{s.platform_name}</span>
          <span className="pill">
            {s.cross_play ? "Supported cross-play" : "Same platform"}
          </span>
          <span className="pill">
            {s.community_name ??
              (s.visibility === "friends"
                ? "Friends · accepted friends"
                : "Verified members")}
          </span>
        </div>
        <p>
          <Users size={16} />
          {s.accepted_count}/{s.max_players} reserved ·{" "}
          {Math.max(0, s.max_players - s.accepted_count)} slots available
        </p>
        <p>
          <CalendarDays size={16} />
          {s.starts_at ? date(s.starts_at) : "Starting now"} · Expires{" "}
          {date(s.expires_at)}
        </p>
        <Identity name={s.host_name} id={s.host_id} avatar={s.host_avatar} />
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh session
        </button>
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {missing ? (
        <EmptyState
          title="This session is no longer accessible"
          description="Return to Squad Up to discover another group."
        />
      ) : (
        <>
          <section className="panel padded">
            <h2>The plan</h2>
            <SafeMarkdown text={s.description} />
            <p>
              {s.requires_approval
                ? "The host approves every new member."
                : "Open joining while a place is available."}{" "}
              Creating or joining shares your display name with accepted group
              members. Share this page only with your intended audience; a link
              does not grant access.
            </p>
            {!s.is_host && !ended && s.can_join && (
              <div className="squad-join">
                <label className="field">
                  Your platform
                  <select
                    aria-label="Your platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    {s.compatible_platforms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void command("join")}
                >
                  {s.requires_approval ? "Request to join" : "Join session"}
                </button>
              </div>
            )}
            {!s.is_host && s.my_status === "pending" && (
              <p className="squad-pending" role="status">
                Request pending · voice opens after host approval.
              </p>
            )}
            {!s.is_host && accepted && !ended && (
              <p className="squad-joined" role="status">
                You are in the squad. Your place is reserved.
              </p>
            )}
            {!s.is_host &&
              ["accepted", "pending"].includes(s.my_status ?? "") && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void command("withdraw")}
                >
                  Withdraw from session
                </button>
              )}
            {!s.can_join &&
              !accepted &&
              s.my_status !== "pending" &&
              !s.is_host &&
              !ended && (
                <p>
                  {current === "full"
                    ? "This group is full. Refresh later to check for a free place."
                    : "Joining is unavailable. A host restriction or block may apply."}
                </p>
              )}
            {s.is_host && !ended && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Cancel this gaming session and end voice access for everyone?",
                    )
                  )
                    void command("cancel");
                }}
              >
                Cancel session
              </button>
            )}
            {!s.is_host && (
              <button
                className="button ghost"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Block this host? You will withdraw from shared squads and lose their session access.",
                    )
                  )
                    void command("block-host");
                }}
              >
                Block host
              </button>
            )}
          </section>
          {s.members.length > 0 && (
            <section className="panel padded squad-roster">
              <h2>{s.is_host ? "Manage your group" : "Your group"}</h2>
              {s.is_host && (
                <p>
                  {s.pending_count} pending approval. Pending requests do not
                  reserve a player slot.
                </p>
              )}
              <ul>
                {s.members.map((m) => (
                  <li key={m.id} data-member-id={m.id}>
                    <Identity name={m.name} id={m.id} avatar={m.avatar} />
                    <div>
                      <strong>{m.host ? "Host" : m.status}</strong>
                      <small>{m.platform}</small>
                    </div>
                    {s.is_host && !m.host && (
                      <div className="squad-member-controls">
                        {m.status === "pending" && !ended && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => void command("approve", m.id)}
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void command("reject", m.id)}
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {m.status === "accepted" && !ended && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Remove this member and end their session voice access?",
                                )
                              )
                                void command("remove", m.id);
                            }}
                          >
                            Remove
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Block this member and remove shared squad access?",
                              )
                            )
                              void command("block-member", m.id);
                          }}
                        >
                          Block member
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {accepted && !ended && (
            <section>
              <h2 className="squad-voice-title">
                <Headphones size={22} />
                Squad voice
              </h2>
              {s.voice_allowed ? (
                <VoiceRoomPanel
                  channel={s.id}
                  name={s.title}
                  description="This room is reserved for approved session members. Remove a member using the session controls to revoke their voice access."
                  configured={voiceConfigured}
                  role={null}
                  limit={s.max_players}
                />
              ) : (
                <div className="panel padded">
                  <h3>Voice is not available yet</h3>
                  <p>
                    Scheduled rooms open at {date(s.voice_opens_at)}. Refresh at
                    that time. Current membership, audience and block
                    permissions also apply.
                  </p>
                </div>
              )}
            </section>
          )}
          {ended && (
            <section className="panel padded">
              <h2>
                {current === "cancelled"
                  ? "Session cancelled"
                  : "Session expired"}
              </h2>
              <p>
                Joining and new voice tokens are disabled. Connected voice is
                being closed by the enforcement worker.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
