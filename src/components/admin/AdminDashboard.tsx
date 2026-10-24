"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Users,
  Flag,
  Activity,
  Hash,
  Calendar,
  ScrollText,
  Megaphone,
  Settings,
  Scale,
  Building2,
} from "lucide-react";
import { adminCommand, adminRead } from "../../lib/admin/actions";
import { PageHeading, EmptyState } from "../ui";
type Context = {
  rank: number;
  communities: { id: string; name: string; rank: number; archived: boolean }[];
  retention_days: number | null;
};
type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const sections = [
  ["overview", "Overview", Activity],
  ["members", "Members", Users],
  ["reports", "Reports", Flag],
  ["communities", "Communities", Building2],
  ["channels", "Channels & voice", Hash],
  ["events", "Events", Calendar],
  ["announcements", "Announcements", Megaphone],
  ["appeals", "Appeals", Scale],
  ["audit", "Audit history", ScrollText],
  ["settings", "Settings", Settings],
] as const;
export function AdminDashboard({ initial }: { initial: Context | null }) {
  const [context, setContext] = useState(initial),
    [view, setView] = useState("overview"),
    [community, setCommunity] = useState(""),
    [search, setSearch] = useState(""),
    [rows, setRows] = useState<Row[]>([]),
    [metrics, setMetrics] = useState<Row>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [before, setBefore] = useState<number | null>(null),
    [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const active = context?.communities.find((c) => c.id === community);
  const rank = context?.rank || 0,
    manager = rank >= 30 || (active?.rank || 0) >= 30;
  useEffect(() => {
    let alive = true;
    void adminRead({ view: "context" })
      .then((r) => {
        if (!alive) return;
        if (r.data) {
          const c = r.data as Context;
          setContext(c);
          if (c.rank < 20)
            setCommunity((previous) =>
              c.communities.some((item) => item.id === previous)
                ? previous
                : c.communities[0]?.id || "",
            );
        } else setError(r.error || "Administration unavailable.");
      })
      .catch(() => {
        if (alive)
          setError(
            "Unable to reach administration. Check your connection and retry.",
          );
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  useEffect(() => {
    const n = ++generation.current;
    if (!context || (context.rank < 20 && !community)) return;
    if (view === "settings") {
      setRows([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    void adminRead({ view, community: community || null, before, search })
      .then((r) => {
        if (n !== generation.current) return;
        if (r.error) {
          setError(r.error);
          setRows([]);
        } else if (view === "overview") setMetrics(r.data as Row);
        else {
          const records = r.data as Row[];
          setRows(view === "communities" ? [...records].sort((a, b) => Number(a.display_order ?? 1000)-Number(b.display_order ?? 1000) || String(a.name).localeCompare(String(b.name))) : records);
        }
        setBusy(false);
      })
      .catch(() => {
        if (n === generation.current) {
          setError("Unable to load records. Check your connection and retry.");
          setBusy(false);
          setRows([]);
        }
      });
    return () => {
      // A monotonically increasing request counter, never a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [view, community, search, before, revision, context]);
  async function act(data: Row) {
    setNotice("");
    const r = await adminCommand(data);
    if (r.error) throw Error(r.error);
    setNotice("Saved. The action was recorded in audit history.");
    if (data.operation === "community_delete" && community === data.community_id) setCommunity("");
    setRevision((x) => x + 1);
  }
  function choose(v: string) {
    setView(v);
    setBefore(null);
    setSearch("");
    setNotice("");
  }
  const capable = rank >= 20 || (context?.communities.length || 0) > 0;
  return (
    <div className="page admin-live">
      <PageHeading
        eyebrow="CARE FOR THE GATHERING"
        title="Administration"
        description="Real community health. Clear permissions. Accountable decisions."
      >
        <span className="pill">
          <ShieldCheck size={16} />
          {rank === 40
            ? "Platform owner"
            : rank === 30
              ? "Platform administrator"
              : rank === 20
                ? "Platform moderator"
                : capable
                  ? "Community team"
                  : "Member"}
        </span>
      </PageHeading>
      {!context ? (
        <section className="panel padded">
          <p role="alert">
            {error ||
              "Administration is unavailable. Apply the Phase 11 migrations."}
          </p>
        </section>
      ) : !capable ? (
        <section className="panel padded">
          <EmptyState
            icon={<ShieldCheck />}
            title="Staff access required"
            description="Your account has no platform or community moderation role."
          />
          <Link href="/reports" className="button secondary">
            Report a concern
          </Link>{" "}
          <Link href="/appeals" className="button secondary">
            Your appeals
          </Link>
        </section>
      ) : (
        <>
          <div className="admin-scope panel padded">
            <label>
              Administrative scope
              <select
                aria-label="Administrative scope"
                value={community}
                onChange={(e) => {
                  setCommunity(e.target.value);
                  setBefore(null);
                }}
              >
                {rank >= 20 && <option value="">Platform</option>}
                {context.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? " · archived" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Community roles apply only within their community. Platform roles
              never come from community ownership.
            </p>
          </div>
          <nav className="tabs admin-tabs" aria-label="Administration sections">
            {sections.map(([key, label, Icon]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                aria-pressed={view === key}
                onClick={() => choose(key)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          {notice && (
            <p className="admin-feedback" role="status">
              {notice}
            </p>
          )}
          {error && (
            <div role="alert" className="panel padded">
              {error}
              <button
                className="button secondary"
                onClick={() => setRevision((x) => x + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {busy ? (
            <p role="status">Loading authorized records…</p>
          ) : view === "overview" ? (
            <>
              <div className="admin-stats">
                {Object.entries(metrics).map(([key, value]) => (
                  <div className="panel stat-card" key={key}>
                    <Activity size={20} />
                    <span>{key.replaceAll("_", " ")}</span>
                    <strong>{String(value)}</strong>
                    <small>Current scope · database totals</small>
                  </div>
                ))}
              </div>
              <section className="panel padded">
                <h2>Moderate with care</h2>
                <p>
                  Review the reported evidence, choose the least intrusive
                  action and explain your reason. Never put passwords, email
                  addresses or unnecessary personal details in audit reasons.
                </p>
                <Link href="/reports">Submit a report</Link> ·{" "}
                <Link href="/appeals">Your appeals</Link>
              </section>
            </>
          ) : (
            <>
              {view === "members" && (
                <label className="admin-search">
                  Find an account by username
                  <input
                    value={search}
                    maxLength={48}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Username prefix"
                  />
                </label>
              )}
              {view === "channels" && !community && (
                <p>Select a community to manage channels and voice rooms.</p>
              )}
              <div className="admin-records">
                {rows.map((r, index) => (
                  <article
                    className="panel padded admin-record"
                    key={str(r, "id") || String(index)}
                  >
                    {view === "members" ? (
                      <>
                        <h2>{str(r, "display_name") || str(r, "username") || "Profile setup pending"}</h2>
                        <p>
                          {r.username ? `@${str(r, "username")}` : "No username selected"} · Account: {str(r, "status")} · Role: {" "}
                          {str(r, "platform_role") ||
                            str(r, "community_role") ||
                            "member"}
                        </p>
                        {!r.username && <p className="muted">This member has not selected a username yet. “Active” describes account restrictions, not completion of email verification or profile setup.</p>}
                        <details>
                          <summary>Account identifier</summary>
                          <code>{str(r, "id")}</code>
                        </details>
                        {rank >= 30 && (
                          <Control
                            title="Account status"
                            operation="account_status"
                            fixed={{ user_id: r.id }}
                            act={act}
                          >
                            <Select
                              name="status"
                              label="Status"
                              options={["active", "suspended", "banned"]}
                            />
                            <Field
                              name="days"
                              label="Suspension days"
                              type="number"
                              value="7"
                              min={1}
                              max={365}
                            />
                          </Control>
                        )}
                        {rank >= 30 && (
                          <Control
                            title="Lodge verified external appeal"
                            operation="appeal_lodge"
                            fixed={{ user_id: r.id }}
                            act={act}
                          >
                            <Area
                              name="body"
                              label="Verified member’s appeal"
                              max={2000}
                              min={10}
                            />
                            <p>
                              Use only after independently verifying the member
                              through your support process. Record verification
                              context without sensitive personal information.
                            </p>
                          </Control>
                        )}
                        {rank === 40 && (
                          <Control
                            title="Platform role"
                            operation="platform_role"
                            fixed={{ user_id: r.id }}
                            act={act}
                          >
                            <Select
                              name="role"
                              label="Platform role"
                              options={["member", "moderator", "administrator"]}
                            />
                            <p>
                              Owner cannot be assigned here. You cannot change
                              your own role.
                            </p>
                          </Control>
                        )}
                        {community && manager && (
                          <Control
                            title="Community role"
                            operation="community_role"
                            fixed={{ community_id: community, user_id: r.id }}
                            act={act}
                          >
                            <Select
                              name="role"
                              label="Community role"
                              options={["member", "moderator", "administrator"]}
                            />
                          </Control>
                        )}
                        {community && (
                          <Control
                            title="Community membership status"
                            operation="community_status"
                            fixed={{ community_id: community, user_id: r.id }}
                            act={act}
                          >
                            <Select
                              name="status"
                              label="Membership status"
                              options={["banned", "active"]}
                            />
                          </Control>
                        )}
                      </>
                    ) : null}
                    {view === "reports" ? (
                      <>
                        <span className="pill">
                          {str(r, "target_type")} · {str(r, "status")}
                        </span>
                        <h2>Reported concern</h2>
                        <p className="admin-wrap">{str(r, "reason")}</p>
                        <details>
                          <summary>Protected reported evidence</summary>
                          <p>
                            Only this reported item was captured. Evidence
                            expires{" "}
                            {new Date(
                              str(r, "retain_until"),
                            ).toLocaleDateString()}
                            .
                          </p>
                          <blockquote className="admin-evidence">
                            {str(r, "evidence") ||
                              "Evidence has expired or is unavailable."}
                          </blockquote>
                          {Array.isArray(r.media) &&
                            r.media.map((f: Row) => (
                              <p key={str(f, "id")}>
                                <a
                                  href={`/api/admin/evidence/${str(f, "id")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Open reported attachment: {str(f, "filename")}
                                </a>
                              </p>
                            ))}
                          <p>
                            Case: <code>{str(r, "id")}</code>
                          </p>
                        </details>
                        <Control
                          title="Review decision"
                          operation="case_decision"
                          fixed={{ id: r.id }}
                          act={act}
                        >
                          <Select
                            name="decision"
                            label="Decision"
                            options={["dismissed", "actioned"]}
                          />
                          <Check
                            name="remove"
                            label="Remove reported content (messages, posts, comments or sessions only)"
                          />
                          <p>
                            Account penalties use Members. Reported DMs are
                            evidence-only. You cannot decide reports about
                            yourself or your own reports.
                          </p>
                        </Control>
                      </>
                    ) : null}
                    {view === "communities" ? (
                      <>
                        <h2>{str(r, "name")}</h2>
                        <p>{str(r, "description")}</p>
                        <span className="pill">
                          {str(r, "visibility")}
                          {r.archived ? " · archived" : ""}
                        </span>
                        {rank >= 30 && (
                          <Control title="Display order" operation="community_order" fixed={{ community_id: r.id }} act={act}>
                            <p>Lower numbers appear first on Home and Discover. Matching numbers sort by community name.</p>
                            <Field name="position" label="Community display position" type="number" min={0} max={999999} value={String(r.display_order ?? 1000)} />
                          </Control>
                        )}
                        {(rank >= 30 || (community === r.id && active?.rank === 40)) && (
                          <Control title="Permanently delete community" operation="community_delete" fixed={{ community_id: r.id }} act={act} submitLabel="Permanently delete community" destructive>
                            <p>This permanently deletes this community and its memberships, channels, messages, posts, events, prayer requests and gaming sessions. This cannot be undone. Limited moderation evidence, audit records and backups follow their retention rules. Voice access is revoked; the voice worker removes the deleted rooms.</p>
                            <p>To confirm, type the community address: <strong>{str(r, "slug")}</strong></p>
                            <Field name="confirmation" label="Community address to confirm deletion" />
                          </Control>
                        )}
                        {(rank >= 30 || (community && manager)) && (
                          <>
                            <CommunityForm row={r} act={act} />
                            <Control
                              title="Community-wide settings"
                              operation="community_settings"
                              fixed={{ community_id: r.id }}
                              act={act}
                            >
                              <Area
                                name="guidelines"
                                label="Community guidelines"
                                value={str(r, "guidelines")}
                                max={3000}
                              />
                              <Check
                                name="allow_events"
                                label="Members may create events"
                                checked={!!r.allow_events}
                              />
                              <Check
                                name="allow_prayers"
                                label="Members may submit prayer requests"
                                checked={!!r.allow_prayers}
                              />
                            </Control>
                          </>
                        )}
                      </>
                    ) : null}
                    {view === "channels" ? (
                      <>
                        <h2>
                          {str(r, "kind") === "voice" ? "🎧" : "#"}{" "}
                          {str(r, "name")}
                        </h2>
                        <p>{str(r, "description")}</p>
                        <span className="pill">
                          Position {str(r, "position")} ·{" "}
                          {r.disabled
                            ? "Disabled"
                            : r.is_private
                              ? "Private"
                              : "Open to community"}
                        </span>
                        {manager && (
                          <>
                            <ChannelForm
                              community={community}
                              row={r}
                              act={act}
                            />
                            <Control
                              title="Role access override"
                              operation="channel_access"
                              fixed={{ community_id: community, id: r.id }}
                              act={act}
                            >
                              <Select
                                name="role"
                                label="Role"
                                options={[
                                  "member",
                                  "moderator",
                                  "administrator",
                                ]}
                              />
                              <Check
                                name="can_view"
                                label="Allow viewing"
                                checked
                              />
                              <Check
                                name="can_post"
                                label="Allow posting"
                                checked
                              />
                              <Check
                                name="can_connect"
                                label="Allow voice connection"
                                checked
                              />
                              <Check
                                name="reset"
                                label="Remove override and restore default"
                              />
                              <p>
                                Explicit denial wins. Administrators retain
                                existing community management access.
                              </p>
                            </Control>
                          </>
                        )}
                        {Array.isArray(r.participants) &&
                          r.participants.map((p: Row) => (
                            <Control
                              key={str(p, "user_id")}
                              title={`Remove ${str(p, "username")} from voice`}
                              operation="voice_remove"
                              fixed={{
                                community_id: community,
                                id: r.id,
                                user_id: p.user_id,
                              }}
                              act={act}
                            >
                              <p>
                                Removes the current voice admission and prevents
                                rejoining for 15 minutes.
                              </p>
                            </Control>
                          ))}
                      </>
                    ) : null}
                    {view === "events" ? (
                      <>
                        <h2>{str(r, "title")}</h2>
                        <p>
                          {str(r, "status")} ·{" "}
                          {r.moderation_hidden
                            ? "Hidden by moderation"
                            : "Visible to community"}
                        </p>
                        <Control
                          title="Event visibility"
                          operation="event_visibility"
                          fixed={{ community_id: r.community_id, id: r.id }}
                          act={act}
                        >
                          <Check
                            name="hidden"
                            label="Hide this event from member views"
                            checked={!!r.moderation_hidden}
                          />
                        </Control>
                      </>
                    ) : null}
                    {view === "announcements" ? (
                      <>
                        <h2>{str(r, "title")}</h2>
                        <p className="admin-wrap">{str(r, "body")}</p>
                        <span className="pill">
                          {r.published ? "Published" : "Draft"}
                        </span>
                        {manager && (
                          <AnnouncementForm
                            community={str(r, "community_id")}
                            row={r}
                            act={act}
                          />
                        )}
                      </>
                    ) : null}
                    {view === "appeals" ? (
                      <>
                        <h2>Appeal · {str(r, "status")}</h2>
                        <p className="admin-wrap">{str(r, "body")}</p>
                        {r.decision && <p>Decision: {str(r, "decision")}</p>}
                        <Control
                          title="Review appeal"
                          operation="appeal_decision"
                          fixed={{ id: r.id }}
                          act={act}
                        >
                          <Select
                            name="decision"
                            label="Appeal decision"
                            options={["accepted", "declined"]}
                          />
                          <p>
                            Acceptance records your decision. Apply any restored
                            account or content access separately with its own
                            audited action.
                          </p>
                        </Control>
                      </>
                    ) : null}
                    {view === "audit" ? (
                      <>
                        <h2>{str(r, "action").replaceAll("_", " ")}</h2>
                        <p>{str(r, "reason")}</p>
                        <p>
                          <time>
                            {new Date(str(r, "created_at")).toLocaleString()}
                          </time>{" "}
                          · Actor{" "}
                          <code>{str(r, "actor_id") || "deleted account"}</code>
                        </p>
                        {r.target_id && (
                          <p>
                            Target <code>{str(r, "target_id")}</code>
                          </p>
                        )}
                      </>
                    ) : null}
                  </article>
                ))}
              </div>
              {!rows.length && view !== "settings" && !error && (
                <EmptyState
                  title="No records in this scope"
                  description="Try another community or username. No demonstration records are shown."
                />
              )}
              {["reports", "audit", "appeals", "events", "members"].includes(view) &&
                rows.length === (view === "members" ? 50 : 30) && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      setBefore(Number(rows.at(-1)?.seq || rows.at(-1)?.id))
                    }
                  >
                    Older records
                  </button>
                )}
              {view === "communities" && rank >= 30 && (
                <CommunityForm act={act} />
              )}
              {view === "channels" && community && manager && (
                <ChannelForm community={community} act={act} />
              )}
              {view === "announcements" && manager && (
                <AnnouncementForm community={community} act={act} />
              )}
              {view === "settings" && (
                <section className="panel padded">
                  <h2>Evidence retention</h2>
                  <p>
                    Reported-item evidence is available for{" "}
                    {context.retention_days || "the configured number of"} days.
                    The service-only retention job erases expired evidence;
                    reads conceal it immediately. Audit actions retain minimal
                    identifiers, reasons and timestamps.
                  </p>
                  {rank >= 30 && (
                    <Control
                      title="Set evidence retention"
                      operation="retention"
                      fixed={{}}
                      act={act}
                    >
                      <Field
                        name="days"
                        label="Retention days"
                        type="number"
                        value={String(context.retention_days || 90)}
                        min={7}
                        max={365}
                      />
                      <p>
                        Shortening retention applies to existing evidence.
                        Increasing it never restores expired evidence.
                      </p>
                    </Control>
                  )}
                  <h3>Least privilege</h3>
                  <p>
                    Platform owners appoint platform staff. Community
                    administrators manage only their own community. Moderators
                    cannot grant themselves roles.
                  </p>
                  <Link href="/notifications">Notification preferences</Link>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
type Action = (data: Row) => Promise<void>;
function Control({
  title,
  operation,
  fixed,
  act,
  children,
  submitLabel,
  destructive = false,
}: {
  title: string;
  operation: string;
  fixed: Row;
  act: Action;
  children?: React.ReactNode;
  submitLabel?: string;
  destructive?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="admin-control">
      <summary>{title}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data: Row = { operation, ...fixed };
          for (const element of Array.from(form.elements)) {
            if (element instanceof HTMLInputElement && element.name)
              data[element.name] =
                element.type === "checkbox"
                  ? element.checked
                  : element.type === "number"
                    ? Number(element.value)
                    : element.name === "expires_at"
                      ? new Date(element.value).toISOString()
                      : element.value;
            else if (
              (element instanceof HTMLSelectElement ||
                element instanceof HTMLTextAreaElement) &&
              element.name
            )
              data[element.name] = element.value;
          }
          setPending(true);
          setError("");
          try {
            await act(data);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save.");
          } finally {
            setPending(false);
          }
        }}
      >
        {children}
        <Area name="reason" label="Reason for this action" max={500} min={5} />
        <p className="muted">
          Use a concise reason without sensitive personal details.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className={`button ${destructive ? "danger" : "primary"}`} disabled={pending}>
          {pending ? "Saving…" : submitLabel || `Save ${title.toLowerCase()}`}
        </button>
      </form>
    </details>
  );
}
function Field({
  name,
  label,
  type = "text",
  value = "",
  min,
  max,
  readOnly = false,
}: {
  name: string;
  label: string;
  type?: string;
  readOnly?: boolean;
  value?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        readOnly={readOnly}
        defaultValue={value}
        required
        min={min}
        max={max}
        maxLength={type === "text" ? 100 : undefined}
      />
    </label>
  );
}
function Area({
  name,
  label,
  value = "",
  max = 2000,
  min = 1,
}: {
  name: string;
  label: string;
  value?: string;
  max?: number;
  min?: number;
}) {
  return (
    <label>
      {label}
      <textarea
        name={name}
        defaultValue={value}
        required
        minLength={min}
        maxLength={max}
      />
    </label>
  );
}
function Select({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: string[];
  value?: string;
}) {
  return (
    <label>
      {label}
      <select aria-label={label} name={name} defaultValue={value || options[0]}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function Check({
  name,
  label,
  checked = false,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="admin-check">
      <input name={name} type="checkbox" defaultChecked={checked} />
      {label}
    </label>
  );
}
function CommunityForm({ row, act }: { row?: Row; act: Action }) {
  return (
    <Control
      title={row ? "Edit community" : "Create community"}
      operation="community"
      fixed={{ community_id: row?.id || null, user_id: null }}
      act={act}
    >
      <Field
        name="name"
        label="Community name"
        value={row ? str(row, "name") : ""}
      />
      <Field
        name="slug"
        label="Community slug"
        readOnly={!!row}
        value={row ? str(row, "slug") : ""}
      />
      <Area
        name="description"
        label="Description"
        value={row ? str(row, "description") : ""}
      />
      <Select
        name="visibility"
        label="Visibility"
        options={["public", "discoverable", "private"]}
        value={row ? str(row, "visibility") : undefined}
      />
      {!row && (
        <Field name="user_id" label="Initial owner's account identifier" />
      )}
      <Check
        name="archived"
        label="Archive community and disable member access"
        checked={!!row?.archived}
      />
    </Control>
  );
}
function ChannelForm({
  community,
  row,
  act,
}: {
  community: string;
  row?: Row;
  act: Action;
}) {
  return (
    <Control
      title={row ? "Edit channel" : "Create channel"}
      operation="channel"
      fixed={{
        community_id: community,
        id: row?.id || null,
        ...(row ? { kind: row.kind } : {}),
      }}
      act={act}
    >
      <Field
        name="name"
        label="Channel name"
        value={row ? str(row, "name") : ""}
      />
      <Area
        name="description"
        label="Description"
        value={row ? str(row, "description") : ""}
        max={1000}
      />
      {row ? (
        <p>Channel type: {str(row, "kind")} (fixed)</p>
      ) : (
        <Select name="kind" label="Channel type" options={["text", "voice"]} />
      )}
      <Field
        name="position"
        label="Order position"
        type="number"
        min={0}
        max={999}
        value={row ? str(row, "position") : "0"}
      />
      <Check
        name="is_private"
        label="Private channel"
        checked={!!row?.is_private}
      />
      <Check
        name="disabled"
        label="Disable channel or voice room"
        checked={!!row?.disabled}
      />
    </Control>
  );
}
function AnnouncementForm({
  community,
  row,
  act,
}: {
  community: string;
  row?: Row;
  act: Action;
}) {
  return (
    <Control
      title={row ? "Edit announcement" : "Create announcement"}
      operation="announcement"
      fixed={{ community_id: community || null, id: row?.id || null }}
      act={act}
    >
      <Field name="title" label="Title" value={row ? str(row, "title") : ""} />
      <Area
        name="body"
        label="Announcement"
        max={3000}
        value={row ? str(row, "body") : ""}
      />
      <Field
        name="expires_at"
        label="Expires at (your device time)"
        type="datetime-local"
        value={localDate(
          row
            ? str(row, "expires_at")
            : new Date(Date.now() + 7 * 86400000).toISOString(),
        )}
      />
      <Check
        name="published"
        label="Publish to permitted members"
        checked={!!row?.published}
      />
    </Control>
  );
}

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
