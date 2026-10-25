"use client";
import { useActionState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { communityAction } from "../../lib/communities/actions";
import type { Community, Channel, Category } from "../../lib/communities/data";
export function CommandForm({
  operation,
  communityId,
  children,
  label = "Save changes",
  className = "",
}: {
  operation?: string;
  communityId?: string;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(communityAction, {});
  useEffect(()=>{if(state.notice)window.dispatchEvent(new Event("gathering:communities-changed"));},[state]);
  return (
    <form action={action} className={`community-form ${className}`}>
      {operation && <input type="hidden" name="operation" value={operation} />}
      {communityId && (
        <input type="hidden" name="community_id" value={communityId} />
      )}
      <fieldset disabled={pending}>
        {children}
        {operation && (
          <button className="button primary" type="submit">
            {pending ? "Saving…" : label}
          </button>
        )}
      </fieldset>
      {pending && <p role="status">Saving your change…</p>}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="form-notice" role="status">
          {state.notice}
          {state.communityUrl && (
            <>
              {" "}
              <Link href={state.communityUrl}>Open community</Link>
            </>
          )}
        </p>
      )}
      {state.inviteUrl && (
        <label className="field">
          Single-use invitation link
          <input
            readOnly
            value={state.inviteUrl}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </form>
  );
}
export function CommunityFields({ community }: { community?: Community }) {
  return (
    <>
      <label className="field">
        Community name
        <input
          name="name"
          required
          minLength={3}
          maxLength={80}
          defaultValue={community?.name}
        />
      </label>
      {!community && (
        <label className="field">
          Community address
          <input
            name="slug"
            required
            pattern="[a-z][a-z0-9-]{2,47}"
            maxLength={48}
            placeholder="your-community"
          />
          <small>
            3–48 lowercase letters, numbers, or hyphens; start with a letter.
          </small>
        </label>
      )}
      <label className="field">
        Description
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={community?.description}
        />
      </label>
      <label className="field">
        Visibility
        <select
          name="visibility"
          defaultValue={community?.visibility ?? "public"}
        >
          <option value="public">Public · browse and join</option>
          <option value="discoverable">
            Discoverable · browse, invitation to join
          </option>
          <option value="private">
            Private · members and invitations only
          </option>
        </select>
      </label>
      <label className="field">
        Cover artwork
        <select name="cover" defaultValue={community?.cover ?? "nebula"}>
          {["nebula", "aurora", "ember", "ocean"].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Choose fallback artwork. After creating the community, upload a custom header in Community controls.
      </p>
    </>
  );
}
export function ChannelFields({
  channel,
  categories,
}: {
  channel?: Channel;
  categories: Category[];
}) {
  return (
    <>
      {channel && <input type="hidden" name="id" value={channel.id} />}
      <label className="field">
        Channel name
        <input
          name="name"
          required
          maxLength={48}
          pattern="[a-z0-9][a-z0-9-]{0,47}"
          defaultValue={channel?.name}
        />
      </label>
      <label className="field">
        Channel description
        <textarea
          name="description"
          maxLength={1000}
          defaultValue={channel?.description ?? ""}
        />
      </label>
      <label className="field">
        Channel type
        <select name="kind" defaultValue={channel?.kind ?? "text"}>
          <option value="text">Text</option>
          <option value="voice">Voice</option>
        </select>
      </label>
      <label className="field">
        Category
        <select name="category_id" defaultValue={channel?.category_id ?? ""}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Channel order
        <input
          name="position"
          type="number"
          min={0}
          max={999}
          required
          defaultValue={channel?.position ?? 0}
        />
      </label>
      <label className="community-check">
        <input
          type="checkbox"
          name="is_private"
          defaultChecked={channel?.is_private}
        />{" "}
        Private channel
      </label>
      <p className="muted">
        Private channels require an explicit grant. Owners and administrators
        always have access.
      </p>
    </>
  );
}
