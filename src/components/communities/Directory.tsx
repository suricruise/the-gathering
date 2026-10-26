"use client";
import {LoungeHero} from "../discovery/LoungeHero";
import { useState } from "react";
import { Compass, Search } from "lucide-react";
import { LoungeCommunityCard } from "../discovery/CommunityCard";
import {interestCategories,filterCommunities,type DiscoveryCommunity} from "../../lib/discovery/model";
import { EmptyState, PageHeading } from "../ui";
import { CommandForm, CommunityFields } from "./CommunityForms";

export function Directory({
  communities,
  approved,
  memberships, initialFilter="all", initialQuery="", initialCategory="all", activityUnavailable=false,
}: {
  initialFilter?:"all"|"joined";initialQuery?:string;initialCategory?:string;activityUnavailable?:boolean;
  communities: DiscoveryCommunity[];
  approved: boolean;
  memberships: { community_id: string; role_id: string; status: string }[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const [category,setCategory]=useState(initialCategory);
  const joined = new Set(
    memberships.filter((m) => m.status === "active").map((m) => m.community_id),
  );
  const shown = filterCommunities(communities,query,category,joined,filter==="joined");
  return (
    <div className="page lounge-explore-page">
      <PageHeading
        eyebrow="FIND YOUR PEOPLE"
        title="Your next gathering."
        description="Conversations, shared interests and people who make you feel at home."
      />
      <LoungeHero/>
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
        <label className="select-field">Interest<select aria-label="Interest category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All interests</option>{interestCategories.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      </div>
      {activityUnavailable&&<p role="status" className="muted">Community categories and activity counts are temporarily unavailable. Search, community details and memberships remain available.</p>}
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
            <LoungeCommunityCard key={c.id} community={c} joined={joined.has(c.id)} heading="h2"/>
          ))}
        </div>
      ) : (
        <EmptyState
          title={activityUnavailable&&category!=="all"?"Interest filtering is unavailable":"No communities found"}
          description={activityUnavailable&&category!=="all"?"Choose All interests to browse while categories are unavailable, or refresh to retry.":"Try another search, or ask a host for an invitation. Private communities appear after you join."}
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
