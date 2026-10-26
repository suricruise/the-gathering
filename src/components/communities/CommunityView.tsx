import { CommunityHighlights } from "./CommunityHighlights";
import { InterestSettings } from "../discovery/InterestSettings";
import { CommunityHeaderUpload } from "./CommunityHeaderUpload";
import { CommunityBanner } from "./CommunityBanner";
import Link from "next/link";
import { MemberDirectory } from "../people/MemberDirectory";
import { Hash, Headphones, Lock, Users } from "lucide-react";
import { PageHeading, EmptyState } from "../ui";
import { CommandForm, CommunityFields, ChannelFields } from "./CommunityForms";
import type { CommunityDetailData } from "../../lib/communities/data";
export function CommunityView({ data }: { data: CommunityDetailData }) {
  const {
    community: c,
    role,
    channels,
    categories,
    roster,
    userId,
    invitations,
    overrides,
    audit,
  } = data;
  const admin = role === "owner" || role === "administrator";
  const staff = admin || role === "moderator";
  const ranks: Record<string, number> = {
    owner: 40,
    administrator: 30,
    moderator: 20,
    member: 10,
  };
  return (
    <div className="page live-community lounge-community-overview">
      <Link className="back-link" href="/communities">
        ← All communities
      </Link>
      <div className="community-landing-hero">
      <CommunityBanner community={c} />
      <PageHeading
        eyebrow={`${c.visibility.toUpperCase()} COMMUNITY`}
        title={c.name}
        description={c.description}
      >
        <span className="pill">{role ?? "Not a member"}</span>
      </PageHeading>
      {role && <><Link className="button secondary" href={`/communities/${c.slug}/posts`}>View community posts</Link><Link className="button secondary" href={`/squad-up?community=${c.id}&mode=game-nights`}>Community game nights</Link></>}
      <div className="community-membership">
        {role ? (
          role === "owner" ? (
            <p className="muted">
              Transfer ownership to another member before leaving.
            </p>
          ) : (
            <CommandForm
              communityId={c.id}
              operation="leave"
              label="Leave community"
            />
          )
        ) : c.visibility === "public" ? (
          <CommandForm
            communityId={c.id}
            operation="join"
            label="Join community"
          />
        ) : (
          <p className="body-copy">
            An invitation from a community host is required to join.
          </p>
        )}
      </div>
      </div>
      <CommunityHighlights key={c.id} community={c.id} member={!!role}/>
      {role ? (
        <>
          <div className="two-column">
            <section className="panel padded">
              <h2>Community channels</h2>
              {staff && <Link className="button secondary" href={`/communities/${c.slug}/manage`}>Manage channels & moderation</Link>}
              <nav aria-label="Community channels">
                {[
                  ...categories,
                  { id: "", name: "Uncategorized", position: 999 },
                ].map((category) => {
                  const group = channels.filter(
                    (ch) => (ch.category_id ?? "") === category.id,
                  );
                  return group.length ? (
                    <div className="live-channel-category" key={category.id}>
                      <h3>{category.name}</h3>
                      {group.map((ch) => (
                        <Link
                          className="live-channel-link"
                          href={`/channels/${ch.id}`}
                          key={ch.id}
                        >
                          {ch.kind === "voice" ? (
                            <Headphones size={18} />
                          ) : (
                            <Hash size={18} />
                          )}
                          <span>{ch.name}</span>
                          {ch.is_private && (
                            <>
                              <Lock size={14} />
                              <span className="sr-only">Private</span>
                            </>
                          )}
                        </Link>
                      ))}
                    </div>
                  ) : null;
                })}
              </nav>
              {!channels.length && (
                <EmptyState
                  title="No accessible channels"
                  description="A community administrator can create channels or grant access."
                />
              )}
              <p className="muted">
                Choose a conversation or pull up a chair in a voice room.
              </p>
            </section>
            <section className="panel padded">
              <h2>
                <Users size={18} /> Members
              </h2>
              <Link className="button secondary" href={`/members?community=${c.id}`}>Open full member list · Add friends</Link>
              <MemberDirectory key={c.id} community={c.id} />
              {staff && <details><summary>Moderation and member roles</summary>
              <ul className="community-roster">
                {roster.map((m) => (
                  <li key={m.user_id}>
                    <div>
                      <strong>
                        {m.display_name || m.username || "Member"}
                      </strong>
                      <small>
                        {m.username ? `@${m.username} · ` : ""}
                        {m.role_id}
                        {m.status === "banned" ? " · Banned" : ""}
                      </small>
                    </div>
                    {staff &&
                      m.user_id !== userId &&
                      ranks[m.role_id] < ranks[role] && (
                        <details>
                          <summary>Manage member</summary>
                          {admin && m.status === "active" && (
                            <CommandForm
                              communityId={c.id}
                              key={`role-${m.user_id}`}
                              operation="role"
                              label="Update role"
                            >
                              <input
                                type="hidden"
                                name="user_id"
                                value={m.user_id}
                              />
                              <label className="field">
                                Member role
                                <select name="role" defaultValue={m.role_id}>
                                  {[
                                    "member",
                                    "moderator",
                                    ...(role === "owner"
                                      ? ["administrator"]
                                      : []),
                                  ].map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </CommandForm>
                          )}
                          <CommandForm
                            key={`moderation-${m.user_id}`}
                            communityId={c.id}
                          >
                            <input
                              type="hidden"
                              name="user_id"
                              value={m.user_id}
                            />
                            <div className="button-row">
                              {m.status === "banned" ? (
                                <button
                                  className="button secondary"
                                  name="operation"
                                  value="unban"
                                >
                                  Unban member
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="button secondary"
                                    name="operation"
                                    value="kick"
                                  >
                                    Remove member
                                  </button>
                                  <button
                                    className="button secondary"
                                    name="operation"
                                    value="ban"
                                  >
                                    Ban member
                                  </button>
                                </>
                              )}
                            </div>
                          </CommandForm>
                          {role === "owner" && m.status === "active" && (
                            <details>
                              <summary>Transfer ownership</summary>
                              <p>
                                This gives this member full control. You become
                                an administrator.
                              </p>
                              <CommandForm
                                communityId={c.id}
                                key={`transfer-${m.user_id}`}
                                operation="transfer"
                                label="Confirm ownership transfer"
                              >
                                <input
                                  type="hidden"
                                  name="user_id"
                                  value={m.user_id}
                                />
                              </CommandForm>
                            </details>
                          )}
                        </details>
                      )}
                  </li>
                ))}
              </ul>
              </details>}
            </section>
          </div>
          {staff && (
            <section className="panel padded community-section">
              <h2>Invitations</h2>
              <CommandForm
                communityId={c.id}
                operation="invite"
                label="Create invitation link"
              />
              <p className="muted">
                Single-use links grant the member role only. Keep links private;
                expire after 7 days. Existing links cannot be recovered.
              </p>
              <ul className="community-roster">
                {invitations.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.accepted_at
                        ? "Accepted"
                        : i.revoked_at
                          ? "Revoked"
                          : new Date(i.expires_at).getTime() < Date.now()
                            ? "Expired"
                            : "Pending"}{" "}
                      · Expires {i.expires_at.slice(0, 10)}
                    </span>
                    {!i.accepted_at && !i.revoked_at && (
                      <CommandForm
                        communityId={c.id}
                        operation="revoke_invite"
                        label="Revoke invitation"
                      >
                        <input type="hidden" name="id" value={i.id} />
                      </CommandForm>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {admin && (
            <section id="community-settings" className="panel padded community-section">
              <h2>Community settings</h2>
              {c.community_headers !== undefined ? <CommunityHeaderUpload communityId={c.id} hasImage={!!c.community_headers} /> : <p role="status">Header uploads need the community-header database update. Existing cover artwork remains available.</p>}
              <details>
                <summary>Edit community</summary>
                <CommandForm communityId={c.id} operation="settings">
                  <CommunityFields community={c} />
                </CommandForm>
              </details>
              <InterestSettings community={c.id} category={c.interest_category}/>
              <details>
                <summary>Categories and ordering</summary>
                {[...categories, { id: "", name: "", position: 0 }].map(
                  (cat) => (
                    <CommandForm
                      key={cat.id}
                      communityId={c.id}
                      operation="category"
                      label={cat.id ? "Save category" : "Create category"}
                    >
                      <input type="hidden" name="id" value={cat.id} />
                      <label className="field">
                        Category name
                        <input
                          name="name"
                          required
                          maxLength={60}
                          defaultValue={cat.name}
                        />
                      </label>
                      <label className="field">
                        Category order
                        <input
                          name="position"
                          type="number"
                          min={0}
                          max={999}
                          required
                          defaultValue={cat.position}
                        />
                      </label>
                    </CommandForm>
                  ),
                )}
              </details>
              <details>
                <summary>Create channel</summary>
                <CommandForm
                  communityId={c.id}
                  operation="channel"
                  label="Create channel"
                >
                  <ChannelFields categories={categories} />
                </CommandForm>
              </details>
              {channels.map((ch) => (
                <details key={ch.id}>
                  <summary>Edit {ch.name}</summary>
                  <CommandForm communityId={c.id} operation="channel">
                    <ChannelFields channel={ch} categories={categories} />
                  </CommandForm>
                </details>
              ))}
              <details>
                <summary>Channel permission overrides</summary>
                <p className="body-copy">
                  Deny wins over grants. A private channel requires an explicit
                  view grant; owners and administrators always retain access.
                  Overrides cannot grant management powers. Leaving or being
                  banned removes channel access immediately.
                </p>
                <CommandForm
                  communityId={c.id}
                  operation="override"
                  label="Save permission override"
                >
                  <label className="field">
                    Channel
                    <select name="channel_id" required>
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Role target
                    <select name="role" defaultValue="">
                      <option value="">Choose a role, or a member below</option>
                      {["moderator", "member"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Member target
                    <select name="user_id" defaultValue="">
                      <option value="">No individual member</option>
                      {roster
                        .filter((m) => m.status === "active")
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name || m.username || "Member"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="community-check">
                    <input type="checkbox" name="can_view" defaultChecked />{" "}
                    Allow view
                  </label>
                  <label className="community-check">
                    <input type="checkbox" name="can_post" defaultChecked />{" "}
                    Allow future text posting
                  </label>
                  <label className="community-check">
                    <input type="checkbox" name="can_connect" defaultChecked />{" "}
                    Allow voice connection
                  </label>
                  <label className="community-check">
                    <input type="checkbox" name="reset_override" /> Reset target
                    to channel defaults
                  </label>
                </CommandForm>
                <ul>
                  {overrides.map((o) => (
                    <li key={o.id}>
                      {channels.find((ch) => ch.id === o.channel_id)?.name}:{" "}
                      {o.role_id ??
                        roster.find((m) => m.user_id === o.user_id)
                          ?.display_name ??
                        "Member"}{" "}
                      · view {o.can_view ? "allow" : "deny"}, post{" "}
                      {o.can_post ? "allow" : "deny"}, connect{" "}
                      {o.can_connect ? "allow" : "deny"}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
          {staff && (
            <section className="panel padded community-section">
              <h2>Security activity</h2>
              <p className="muted">
                Latest 50 changes. Membership and role changes are recorded by
                the database.
              </p>
              <ul className="community-roster">
                {audit.map((a) => (
                  <li key={a.id}>
                    <span>
                      {a.action}
                      {a.detail.new_role
                        ? ` · ${String(a.detail.old_role ?? "new")} → ${String(a.detail.new_role)}`
                        : ""}
                    </span>
                    <time dateTime={a.created_at}>
                      {a.created_at.slice(0, 16).replace("T", " ")} UTC
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="panel padded community-section">
          <h2>There’s a seat for you.</h2>
          <p className="body-copy">
            Join to see this community’s channels and members.
          </p>
        </section>
      )}
    </div>
  );
}
