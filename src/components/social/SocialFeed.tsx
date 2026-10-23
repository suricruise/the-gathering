"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ImagePlus, Gamepad2, MessageCircle, Flag, Link2 } from "lucide-react";
import { ProfileAvatar, EmptyState } from "../ui";
import { SafeMarkdown } from "../chat/SafeMarkdown";
import {
  socialCommand,
  getSocialFeed,
  getSocialPost,
  getSocialComments,
  getSocialReports,
  socialPreviews,
} from "../../lib/social/actions";
import { reactions, reasons, clipLink } from "../../lib/social/validation";
import { messageLinks } from "../../lib/chat/validation";
import { interests } from "../../lib/auth/validation";
import type {
  SocialPost,
  SocialPage,
  SocialComment,
  SocialMedia,
  SocialOptions,
  SocialReport,
} from "../../lib/social/types";
type Filters = {
  mode: "for-you" | "explore" | "following" | "mine";
  community: string | null;
  interest: (typeof interests)[number] | null;
  author: string | null;
};
function Avatar({
  id,
  name,
  avatar,
}: {
  id: string | null;
  name: string;
  avatar: boolean;
}) {
  return avatar && id ? (
    <img
      src={`/api/avatars/${id}`}
      className="social-avatar"
      width={40}
      height={40}
      alt={`${name} avatar`}
    />
  ) : (
    <ProfileAvatar name={name} />
  );
}
function timestamp(value: string) {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
function ReportForm({
  post,
  comment = null,
  onDone,
}: {
  post: string;
  comment?: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await socialCommand({
        operation: "report",
        post,
        comment,
        reason: form.get("reason"),
        detail: form.get("detail"),
      });
      if (r.error) setError(r.error);
      else onDone();
    } catch {
      setError("Report could not be saved. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="social-report">
      <summary>
        <Flag size={14} /> Report {comment ? "comment" : "post"}
      </summary>
      <form onSubmit={submit}>
        <label className="field">
          Report reason
          <select name="reason">
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Report details
          <textarea name="detail" maxLength={500} />
        </label>
        <button className="button secondary" disabled={busy}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
function Comments({
  post,
  userId,
  onChange,
}: {
  post: SocialPost;
  userId: string;
  onChange: () => Promise<void>;
}) {
  const [page, setPage] = useState<SocialPage<SocialComment> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [body, setBody] = useState(""),
    [edit, setEdit] = useState<string | null>(null),
    [draft, setDraft] = useState(""),
    [notice, setNotice] = useState("");
  async function load(older = false) {
    setBusy(true);
    try {
      const r = await getSocialComments({
        id: post.id,
        before: older ? (page?.next ?? null) : null,
      });
      if (r.data)
        setPage({
          items: older
            ? [...(page?.items ?? []), ...r.data.items]
            : r.data.items,
          next: r.data.next,
        });
      else setError(r.error);
    } catch {
      setError("Comments could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  async function command(input: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await socialCommand(input);
      if (r.error) {
        setError(r.error);
        return false;
      }
      await load();
      await onChange();
      return true;
    } catch {
      setError("The comment could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-comments">
      <button
        className="button ghost"
        disabled={busy}
        onClick={() => void load()}
      >
        <MessageCircle size={16} />
        {page ? "Refresh comments" : `View comments (${post.comment_count})`}
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {page && (
        <>
          <ul>
            {[...page.items].reverse().map((c) => (
              <li key={c.id} data-comment-id={c.id}>
                <div className="social-author">
                  <Avatar
                    id={c.author_id}
                    name={c.author_name}
                    avatar={c.avatar}
                  />
                  <div>
                    <strong>{c.author_name}</strong>
                    <small>
                      {timestamp(c.created_at)}
                      {c.edited_at ? " · edited" : ""}
                    </small>
                  </div>
                </div>
                {edit === c.id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await command({
                          operation: "edit-comment",
                          post: post.id,
                          comment: c.id,
                          body: draft,
                        })
                      )
                        setEdit(null);
                    }}
                  >
                    <label className="field">
                      Edit comment
                      <textarea
                        aria-label="Edit comment"
                        value={draft}
                        maxLength={2000}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                    </label>
                    <button className="button secondary" disabled={busy}>
                      Save comment
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setEdit(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <SafeMarkdown
                    text={c.status === "removed" ? "Comment removed." : c.body}
                  />
                )}{" "}
                {c.status !== "published" && (
                  <span className="pill">{c.status}</span>
                )}
                {c.author_id === userId ? (
                  <div className="social-small-actions">
                    {c.status === "published" && (
                      <button
                        onClick={() => {
                          setEdit(c.id);
                          setDraft(c.body);
                        }}
                      >
                        Edit comment
                      </button>
                    )}
                    <button
                      disabled={busy || c.status === "removed"}
                      onClick={() => {
                        if (window.confirm("Delete your comment?"))
                          void command({
                            operation: "delete-comment",
                            post: post.id,
                            comment: c.id,
                          });
                      }}
                    >
                      Delete comment
                    </button>
                  </div>
                ) : (
                  c.status === "published" && (
                    <ReportForm
                      post={post.id}
                      comment={c.id}
                      onDone={() =>
                        setNotice(
                          "Report saved. View its moderation status in My reports.",
                        )
                      }
                    />
                  )
                )}
              </li>
            ))}
          </ul>
          {!page.items.length && (
            <p className="muted">No comments yet. Start the conversation.</p>
          )}
          {page.next && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void load(true)}
            >
              Older comments
            </button>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await command({
                  operation: "comment",
                  id: crypto.randomUUID(),
                  post: post.id,
                  body,
                })
              )
                setBody("");
            }}
          >
            <label className="field">
              Write a comment
              <textarea
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </label>
            <button className="button primary" disabled={busy || !body.trim()}>
              {busy ? "Saving…" : "Post comment"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
export function SocialPostCard({
  post,
  userId,
  onUpdated,
  onFeedChanged,
}: {
  post: SocialPost;
  userId: string;
  onUpdated: (p: SocialPost) => void;
  onFeedChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(post.body),
    [notice, setNotice] = useState("");
  async function refresh() {
    const r = await getSocialPost(post.id);
    if (r.data) onUpdated(r.data);
    else setError(r.error);
  }
  async function mutate(input: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await socialCommand(input);
      if (r.error) {
        setError(r.error);
        return false;
      }
      await refresh();
      return true;
    } catch {
      setError("The change could not be saved. Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (post.status === "removed")
    return (
      <article className="panel padded" data-post-id={post.id}>
        <p>This post was removed.</p>
      </article>
    );
  return (
    <article className="social-post panel" data-post-id={post.id}>
      <header className="social-post-header">
        <Avatar
          id={post.author_id}
          name={post.author_name}
          avatar={post.avatar}
        />
        <div>
          <strong>
            {post.username ? (
              <Link href={`/people/${post.username}`}>{post.author_name}</Link>
            ) : (
              post.author_name
            )}
          </strong>
          <small>
            <Link href={`/feed/${post.id}`}>{timestamp(post.created_at)}</Link>
            {post.edited_at ? " · edited" : ""} ·{" "}
            {post.audience === "members" ? "All members" : post.audience}
          </small>
        </div>
        {post.author_id && post.author_id !== userId && (
          <button
            className="button secondary"
            disabled={busy}
            aria-pressed={post.following}
            onClick={async () => {
              if (
                await mutate({
                  operation: "follow",
                  target: post.author_id,
                  active: !post.following,
                })
              )
                await onFeedChanged();
            }}
          >
            {post.following ? "Following" : "Follow"}
          </button>
        )}
      </header>
      {post.community_slug && (
        <Link
          className="social-community"
          href={`/communities/${post.community_slug}/posts`}
        >
          <Gamepad2 size={15} />
          {post.community_name}
        </Link>
      )}
      {post.status === "hidden" && (
        <p role="status" className="social-moderation-status">
          Hidden by moderation. Visible only to the author and authorized staff.
        </p>
      )}
      {editing ? (
        <form
          className="social-post-body"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await mutate({ operation: "edit", post: post.id, body: draft }))
              setEditing(false);
          }}
        >
          <label className="field">
            Edit post
            <textarea
              aria-label="Edit post"
              maxLength={5000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Save post
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="social-post-body">
          <SafeMarkdown text={post.body} />
        </div>
      )}
      <div className="social-tags">
        {post.game_tags.map((g) => (
          <span className="pill" key={g}>
            <Gamepad2 size={12} />
            {g.replaceAll("-", " ")}
          </span>
        ))}
        {post.interest_tags.map((i) => (
          <span className="pill muted-pill" key={i}>
            #{i}
          </span>
        ))}
      </div>
      {post.media.length > 0 && (
        <div className={`social-media-grid media-${post.media.length}`}>
          {post.media.map((m) =>
            m.kind === "video" ? (
              <video
                key={m.id}
                controls
                playsInline
                preload="metadata"
                src={`/api/social/media/${m.id}`}
                aria-label={`Gaming clip: ${m.filename}`}
              />
            ) : (
              <a
                key={m.id}
                href={`/api/social/media/${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={`/api/social/media/${m.id}`}
                  alt={m.filename}
                  loading="lazy"
                />
              </a>
            ),
          )}
        </div>
      )}
      {messageLinks(post.body)
        .map((url) => clipLink(url))
        .filter((v) => v !== null)
        .map((v) => (
          <a
            className="social-clip-card"
            key={v.url}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
          >
            <Gamepad2 size={22} />
            <span>
              <strong>{v.label}</strong>
              <small>Open on the original platform · external link</small>
            </span>
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      {post.previews.map((p) => (
        <a
          key={p.url}
          href={p.url}
          className="social-link-preview"
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
        >
          <small>{p.hostname}</small>
          <strong>{p.title}</strong>
          <p>{p.description}</p>
        </a>
      ))}
      <div className="social-post-actions">
        {reactions.map((emoji) => {
          const reaction = post.reactions.find((r) => r.emoji === emoji);
          return (
            <button
              key={emoji}
              disabled={busy || post.status !== "published"}
              aria-label={`React ${emoji}`}
              aria-pressed={reaction?.mine ?? false}
              onClick={() =>
                void mutate({
                  operation: "react",
                  post: post.id,
                  emoji,
                  active: !reaction?.mine,
                })
              }
            >
              {emoji}
              <span>{reaction?.count ?? 0}</span>
            </button>
          );
        })}
        {messageLinks(post.body).length > 0 && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await socialPreviews(post.id);
                if (r.data) onUpdated(r.data);
                else setError(r.error);
              } catch {
                setError("Preview unavailable.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Link2 size={14} />
            Load safe previews
          </button>
        )}
      </div>
      {post.author_id === userId && (
        <div className="social-small-actions">
          {post.status === "published" && (
            <button
              disabled={busy}
              onClick={() => {
                setDraft(post.body);
                setEditing(true);
              }}
            >
              Edit post
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Delete this post and its media?"))
                void mutate({ operation: "delete", post: post.id });
            }}
          >
            Delete post
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {post.author_id !== userId && post.status === "published" && (
        <ReportForm
          post={post.id}
          onDone={() =>
            setNotice("Report saved. View its moderation status in My reports.")
          }
        />
      )}
      <Comments post={post} userId={userId} onChange={refresh} />
    </article>
  );
}
function Composer({
  options,
  community,
  onCreated,
}: {
  options: SocialOptions;
  community: string | null;
  onCreated: () => Promise<void>;
}) {
  const [body, setBody] = useState(""),
    [audience, setAudience] = useState(community ? "community" : "members"),
    [selectedCommunity, setCommunity] = useState(community ?? ""),
    [media, setMedia] = useState<SocialMedia[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [rights, setRights] = useState(false),
    [notice, setNotice] = useState("");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [games, setGames] = useState<string[]>([]),
    [tags, setTags] = useState<string[]>([]);
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("rights", rights ? "yes" : "no");
      const response = await fetch("/api/social/upload", {
        method: "POST",
        body: form,
      });
      const r = await response.json();
      if (!response.ok) throw Error(r.error);
      setMedia((v) => [...v, r]);
      setOperationId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload unavailable.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="social-composer panel padded">
      <h2>Share a little of your world.</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const id = operationId ?? crypto.randomUUID();
          setOperationId(id);
          try {
            const r = await socialCommand({
              operation: "create",
              id,
              body,
              audience,
              community: audience === "community" ? selectedCommunity : null,
              games,
              interests: tags,
              media: media.map((m) => m.id),
            });
            if (r.error) setError(r.error);
            else {
              setBody("");
              setMedia([]);
              setOperationId(null);
              setNotice(
                "Your post has been published to the selected audience.",
              );
              await onCreated();
            }
          } catch {
            setError(
              "Publishing could not be confirmed. Retry the unchanged post to avoid duplicates.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Your post
          <textarea
            name="body"
            placeholder="A clutch play, a new build, or something worth sharing…"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setOperationId(null);
            }}
          />
        </label>
        <div className="social-composer-options">
          <label className="field">
            Audience
            <select
              aria-label="Audience"
              value={audience}
              disabled={!!community}
              onChange={(e) => {
                setAudience(e.target.value);
                setOperationId(null);
              }}
            >
              <option value="members">All members</option>
              <option value="followers">My followers</option>
              <option value="community" disabled={!options.communities.length}>
                Community members
              </option>
              <option value="private">Only me</option>
            </select>
          </label>
          {audience === "community" && (
            <label className="field">
              Post community
              <select
                aria-label="Post community"
                value={selectedCommunity}
                disabled={!!community}
                required
                onChange={(e) => {
                  setCommunity(e.target.value);
                  setOperationId(null);
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
          <label className="field">
            Game tags (up to 4)
            <select
              multiple
              value={games}
              onChange={(e) => {
                setGames(
                  [...e.target.selectedOptions].map((o) => o.value).slice(0, 4),
                );
                setOperationId(null);
              }}
            >
              {options.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Interest tags (up to 4)
            <select
              multiple
              value={tags}
              onChange={(e) => {
                setTags(
                  [...e.target.selectedOptions].map((o) => o.value).slice(0, 4),
                );
                setOperationId(null);
              }}
            >
              {interests.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          Photos, GIFs, and H.264 MP4 clips up to 3 MB each (4 files per post).
          Clips: up to 90 seconds, 1080p. YouTube and Twitch clip links open on
          their original platforms.
        </p>
        <label className="social-rights">
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
          />{" "}
          I own the videos I upload or have permission to share them.
        </label>
        <div className="social-upload-row">
          <label className="button secondary">
            <ImagePlus size={16} />
            {uploading ? "Validating media…" : "Add photo or clip"}
            <input
              aria-label="Upload post media"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
              disabled={uploading || busy || media.length >= 4}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || uploading || (!body.trim() && !media.length)}
          >
            {busy ? "Publishing…" : "Publish post"}
          </button>
        </div>
        {media.length > 0 && (
          <ul className="social-staged-media">
            {media.map((m) => (
              <li key={m.id}>
                <span>{m.filename}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${m.filename}`}
                  onClick={() => {
                    setMedia((v) => v.filter((x) => x.id !== m.id));
                    setOperationId(null);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </form>
    </section>
  );
}
function Reports({ mine }: { mine: boolean }) {
  const [page, setPage] = useState<SocialPage<SocialReport> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(older = false) {
    setBusy(true);
    try {
      const r = await getSocialReports({
        mine,
        before: older ? (page?.next ?? null) : null,
      });
      if (r.data)
        setPage({
          items: older
            ? [...(page?.items ?? []), ...r.data.items]
            : r.data.items,
          next: r.data.next,
        });
      else setError(r.error);
    } catch {
      setError("Reports could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded social-reports">
      <h2>{mine ? "My reports" : "Moderation queue"}</h2>
      <p>
        {mine
          ? "Only you and authorized moderators can see your report details."
          : "Community staff see reports in their communities. Platform posts require operator-approved social moderation access."}
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Loading…" : "Refresh reports"}
      </button>
      {error && <p role="alert">{error}</p>}
      {page && !page.items.length && <p>No accessible reports.</p>}
      <ul>
        {page?.items.map((r) => (
          <li key={r.id} data-report-id={r.id}>
            <span className="pill">{r.status}</span>
            <strong>
              {r.reason}
              {r.comment_id ? " · Comment report" : " · Post report"}
            </strong>
            <p>{r.detail}</p>
            {r.post ? (
              <>
                <Link href={`/feed/${r.post_id}`}>Open reported post</Link>
                {r.can_moderate && (
                  <div className="social-report-content">
                    <SafeMarkdown
                      text={
                        r.comment_id
                          ? (r.comment_body ?? "Removed comment")
                          : r.post.body
                      }
                    />
                  </div>
                )}
              </>
            ) : (
              <p>Content is no longer accessible.</p>
            )}
            {r.can_moderate && (
              <div className="social-small-actions">
                {(["dismiss", "hide", "remove", "restore"] as const).map(
                  (decision) => (
                    <button
                      key={decision}
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(`${decision} this reported content?`)
                        )
                          return;
                        setBusy(true);
                        try {
                          const result = await socialCommand({
                            operation: "moderate",
                            report: r.id,
                            decision,
                          });
                          if (result.error) setError(result.error);
                          else await load();
                        } catch {
                          setError("Moderation could not be saved.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {decision[0].toUpperCase() + decision.slice(1)}
                    </button>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {page?.next && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Older reports
        </button>
      )}
    </section>
  );
}
export function SocialFeed({
  initial,
  options,
  userId,
  initialFilters,
  unavailable = false,
}: {
  initial: SocialPage<SocialPost>;
  options: SocialOptions;
  userId: string;
  initialFilters: Filters;
  unavailable?: boolean;
}) {
  const [page, setPage] = useState(initial),
    [filters, setFilters] = useState(initialFilters),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      unavailable
        ? "Social sharing is unavailable. An administrator may need to apply the Phase 7 migrations."
        : "",
    ),
    [view, setView] = useState("feed");
  async function load(nextFilters = filters, older = false) {
    setBusy(true);
    setError("");
    try {
      const r = await getSocialFeed({
        ...nextFilters,
        before: older ? page.next : null,
      });
      if (r.data) {
        setPage({
          items: older
            ? [
                ...page.items,
                ...r.data.items.filter(
                  (p) => !page.items.some((x) => x.id === p.id),
                ),
              ]
            : r.data.items,
          next: r.data.next,
        });
        setFilters(nextFilters);
      } else setError(r.error);
    } catch {
      setError("Feed could not be loaded. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-feed-workspace">
      <nav className="social-tabs" aria-label="Social feed views">
        {["feed", "reports", "moderation"].map((v) => (
          <button
            key={v}
            aria-current={view === v ? "page" : undefined}
            onClick={() => setView(v)}
          >
            {v === "feed"
              ? "Your feed"
              : v === "reports"
                ? "My reports"
                : "Moderation queue"}
          </button>
        ))}
      </nav>
      {view !== "feed" ? (
        <Reports key={view} mine={view === "reports"} />
      ) : (
        <>
          <Composer
            options={options}
            community={initialFilters.community}
            onCreated={() =>
              load({
                ...filters,
                mode: initialFilters.community ? "explore" : "mine",
              })
            }
          />
          <section
            className="social-feed-filters panel padded"
            aria-label="Feed filters"
          >
            <label className="field">
              Feed
              <select
                aria-label="Feed"
                value={filters.mode}
                disabled={busy}
                onChange={(e) =>
                  void load({
                    ...filters,
                    mode: e.target.value as Filters["mode"],
                  })
                }
              >
                <option value="for-you">For you</option>
                <option value="explore">Explore members</option>
                <option value="following">Following</option>
                <option value="mine">My posts</option>
              </select>
            </label>
            <label className="field">
              Filter community
              <select
                value={filters.community ?? ""}
                disabled={busy || !!initialFilters.community}
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
            <label className="field">
              Filter interest
              <select
                value={filters.interest ?? ""}
                disabled={busy}
                onChange={(e) =>
                  void load({
                    ...filters,
                    interest: (e.target.value as Filters["interest"]) || null,
                  })
                }
              >
                <option value="">All interests</option>
                {interests.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void load()}
            >
              Refresh feed
            </button>
          </section>
          <p className="social-feed-explanation">
            For you brings together your follows, communities, favorite games,
            and selected interests. All audiences are checked before a post
            appears.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {busy && <p role="status">Loading posts…</p>}
          {!page.items.length && !busy && (
            <EmptyState
              title="Your next conversation starts here"
              description="Publish a post, follow someone, explore members, or choose another filter."
            />
          )}
          <div className="social-post-list">
            {page.items.map((p) => (
              <SocialPostCard
                key={p.id}
                post={p}
                userId={userId}
                onUpdated={(updated) =>
                  setPage((v) => ({
                    ...v,
                    items: v.items.map((x) =>
                      x.id === updated.id ? updated : x,
                    ),
                  }))
                }
                onFeedChanged={() => load()}
              />
            ))}
          </div>
          {page.next && (
            <button
              className="button secondary social-load-more"
              disabled={busy}
              onClick={() => void load(filters, true)}
            >
              Load older posts
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function SocialPostDetail({
  initial,
  userId,
}: {
  initial: SocialPost;
  userId: string;
}) {
  const [post, setPost] = useState(initial);
  return (
    <SocialPostCard
      post={post}
      userId={userId}
      onUpdated={setPost}
      onFeedChanged={async () => {
        const r = await getSocialPost(post.id);
        if (r.data) setPost(r.data);
      }}
    />
  );
}
