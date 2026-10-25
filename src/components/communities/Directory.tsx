"use client";
import { useState } from "react";
import Link from "next/link";
import { Compass, Search } from "lucide-react";
import { EmptyState, PageHeading } from "../ui";
import { CommandForm, CommunityFields } from "./CommunityForms";
import type { Community } from "../../lib/communities/data";
export function Directory({
  communities,
  approved,
  memberships, initialFilter="all", initialQuery="",
}: {
  initialFilter?:"all"|"joined";initialQuery?:string;
  communities: Community[];
  approved: boolean;
  memberships: { community_id: string; role_id: string; status: string }[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const joined = new Set(
    memberships.filter((m) => m.status === "active").map((m) => m.community_id),
  );
  const shown = communities.filter(
    (c) =>
      (filter !== "joined" || joined.has(c.id)) &&
      `${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="FIND YOUR PEOPLE"
        title="Your next gathering."
        description="A shared game. A good conversation. A place to belong."
      />
      <section className="discovery-banner panel">
        <Compass size={32} />
        <div>
          <h2>Make yourself at home.</h2>
          <p>Join a public community or ask a host for an invitation.</p>
        </div>
        <span className="pill">Live memberships</span>
      </section>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search communities"
            placeholder="Search communities or interests…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="select-field">
          Show
          <select
            aria-label="Community filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all"|"joined")}
          >
            <option value="all">All communities</option>
            <option value="joined">My communities</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Showing up to 200 accessible communities. Private communities appear
        after you join.
      </p>
      <p className="results-count" aria-live="polite">
        {shown.length} communities
      </p>
      {shown.length ? (
        <div className="community-grid">
          {shown.map((c) => (
            <article className="panel live-community-card" key={c.id}>
              <div
                className="community-cover"
                style={{ backgroundImage: c.community_headers ? `url(/api/communities/${c.id}/header?v=${c.community_headers.version})` : `url(/covers/${c.cover}.svg)` }}
              />
              <div className="padded">
                <span className="pill muted-pill">
                  {c.visibility}
                  {joined.has(c.id) ? " · Joined" : ""}
                </span>
                <h2>
                  <Link href={`/communities/${c.slug}`}>{c.name}</Link>
                </h2>
                <p className="body-copy">{c.description}</p>
                <Link
                  className="button secondary"
                  href={`/communities/${c.slug}`}
                >
                  Explore community
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No communities found"
          description="Try another search, or ask a host for an invitation. Private communities appear after you join."
        />
      )}
      <section className="panel padded community-section">
        <h2>Start something together.</h2>
        {approved ? (
          <details>
            <summary>Create a community</summary>
            <CommandForm operation="create" label="Create community">
              <CommunityFields />
            </CommandForm>
          </details>
        ) : (
          <p className="body-copy">
            Community creation is limited to approved hosts. Contact a Gathering
            administrator to request approval.
          </p>
        )}
      </section>
    </div>
  );
}
