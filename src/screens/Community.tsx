"use client";
import { useState } from "react";
import { Link, useParams } from "../compat/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Headphones,
  Search,
  SlidersHorizontal,
  Swords,
  Users,
  WifiOff,
} from "lucide-react";
import { communities } from "../data";
import {
  ChannelList,
  CommunityCard,
  EmptyState,
  PageHeading,
  ProfileAvatar,
  ServiceNotice,
  VoiceRoomCard,
} from "../components/ui";

export function Discovery() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All games");
  const filtered = communities.filter(
    (c) =>
      `${c.name} ${c.description} ${c.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (category === "All games" || c.category === category),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="FIND YOUR PEOPLE"
        title="A world of belonging."
        description="Find a game you love. Meet people you’ll love playing it with."
      />
      <div className="discovery-banner panel">
        <Compass size={32} />
        <div>
          <h2>Your next favorite place is here.</h2>
          <p>
            Every community starts with a shared game. The best ones become so
            much more.
          </p>
        </div>
        <span className="pill">6 demo communities</span>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search communities"
            placeholder="Search games, communities, or interests…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="select-field">
          <SlidersHorizontal size={16} />
          <span className="sr-only">Community category</span>
          <select
            aria-label="Community category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "All games",
              "FPS",
              "Sandbox",
              "Adventure",
              "Sports",
              "Casual",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="results-count" aria-live="polite">
        {filtered.length} demo{" "}
        {filtered.length === 1 ? "community" : "communities"}
      </p>
      {filtered.length ? (
        <div className="community-grid">
          {filtered.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={27} />}
          title="No communities found"
          description="Try another game, interest, or category."
        >
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setCategory("All games");
            }}
          >
            Clear filters
          </button>
        </EmptyState>
      )}
    </div>
  );
}
export function CommunityDetail() {
  const { communityId } = useParams();
  const community = communities.find((c) => c.id === communityId);
  if (!community)
    return (
      <div className="page">
        <EmptyState
          icon={<Compass size={28} />}
          title="Community not found"
          description="This community is not in the development preview."
        >
          <Link className="button primary" to="/communities">
            Explore communities
          </Link>
        </EmptyState>
      </div>
    );
  return (
    <div className="page">
      <Link to="/communities" className="back-link">
        <ArrowLeft size={16} />
        All communities
      </Link>
      <div className={`community-detail-art ${community.theme}`}>
        <span className="game-monogram">{community.initials}</span>
        <div className="terrain terrain-back" />
        <div className="terrain terrain-front" />
      </div>
      <PageHeading
        eyebrow={`${community.category.toUpperCase()} · DEMO COMMUNITY`}
        title={community.name}
        description={community.description}
      >
        <button className="button secondary" disabled>
          <WifiOff size={16} />
          Membership unavailable
        </button>
      </PageHeading>
      <div className="tag-row">
        {community.tags.map((tag) => (
          <span className="pill muted-pill" key={tag}>
            {tag}
          </span>
        ))}
        <span className="card-meta">
          <Users size={15} />
          {community.members} sample members
        </span>
      </div>
      <ServiceNotice service="Community membership" />
      <div className="two-column">
        <section className="panel padded">
          <h2>Make yourself at home</h2>
          <p className="body-copy">
            Good teammates welcome newcomers, keep comms kind, and leave room
            for everyone. Whether you’re learning the basics or chasing your
            next milestone, there’s a seat for you.
          </p>
          <Link to="/channels/general" className="button primary">
            Explore text channels
            <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel padded">
          <h2>Community spaces</h2>
          <ChannelList />
        </section>
      </div>
    </div>
  );
}
export function VoiceLounge() {
  return (
    <div className="page">
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="A little company. A lot of connection."
        description="Queue up, catch up, or simply share the quiet."
      />
      <ServiceNotice service="Voice" />
      <div className="section-heading">
        <h2>Pull up a chair</h2>
        <span className="pill muted-pill">All rooms are demo rooms</span>
      </div>
      <div className="voice-grid">
        <VoiceRoomCard
          name="The hangout"
          description="No agenda. Just good people and good conversation."
          count={3}
        />
        <VoiceRoomCard
          name="In the party"
          description="Find a few teammates and talk through your next match."
          count={2}
        />
        <VoiceRoomCard
          name="Quiet company"
          description="Study, build, or unwind. You don’t have to fill the silence."
          count={0}
          quiet
        />
      </div>
      <section className="panel voice-guidelines">
        <Headphones size={25} />
        <div>
          <h2>Good company starts with good comms.</h2>
          <p>
            Be welcoming. Respect personal boundaries. Ask before recording.
            Make room for every voice.
          </p>
        </div>
      </section>
    </div>
  );
}
export function SquadUp() {
  const [game, setGame] = useState("All games");
  const [platform, setPlatform] = useState("All platforms");
  const [showDemo, setShowDemo] = useState(true);
  const squads = [
    {
      game: "Valorant",
      title: "A few chill unrated games",
      host: "Noah",
      initials: "NK",
      platform: "PC",
      spots: "2 open spots",
      tags: "Casual · Mic optional",
    },
    {
      game: "Minecraft",
      title: "Building a little home base",
      host: "Grace",
      initials: "GR",
      platform: "Cross-platform",
      spots: "3 open spots",
      tags: "Creative · All skill levels",
    },
    {
      game: "Destiny 2",
      title: "First raid? You’re welcome here.",
      host: "Elijah",
      initials: "EL",
      platform: "Cross-platform",
      spots: "1 open spot",
      tags: "Co-op · Beginner friendly",
    },
  ];
  const filtered = showDemo
    ? squads.filter(
        (s) =>
          (game === "All games" || game === s.game) &&
          (platform === "All platforms" || platform === s.platform),
      )
    : [];
  return (
    <div className="page">
      <PageHeading
        eyebrow="BETTER TOGETHER"
        title="Your next squad starts here."
        description="A good game is great. A good team changes everything."
      >
        <button className="button primary" disabled>
          <Swords size={17} />
          Live posting unavailable
        </button>
      </PageHeading>
      <ServiceNotice service="Squad matchmaking" />
      <div className="filter-bar">
        <label className="field inline-field">
          Game
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            {["All games", "Valorant", "Minecraft", "Destiny 2"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field inline-field">
          Platform
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {["All platforms", "PC", "Cross-platform"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDemo}
            onChange={(e) => setShowDemo(e.target.checked)}
          />
          Show demo squads
        </label>
      </div>
      <div className="squad-list">
        {filtered.map((s) => (
          <article className="squad-card panel" key={s.game}>
            <div className="squad-card-head">
              <span className="pill">{s.game}</span>
              <span className="demo-inline">Demo listing</span>
            </div>
            <h2>{s.title}</h2>
            <p className="muted">{s.tags}</p>
            <div className="squad-meta">
              <ProfileAvatar name={s.host} initials={s.initials} size="small" />
              <span>{s.host}</span>
              <span>·</span>
              <span>{s.platform}</span>
              <span className="open-spots">
                <Users size={14} />
                {s.spots}
              </span>
            </div>
            <button className="button secondary full" disabled>
              Requests unavailable
            </button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState
          icon={<Swords size={28} />}
          title="No squads to show"
          description="Adjust your filters or enable sample listings to explore the layout."
        />
      )}
    </div>
  );
}
