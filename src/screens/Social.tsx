"use client";
import { useState } from "react";
import { Link, useParams } from "../compat/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  HeartHandshake,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Search,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { events, friends } from "../data";
import {
  EmptyState,
  EventCard,
  FeedPost,
  PageHeading,
  ProfileAvatar,
  ServiceNotice,
} from "../components/ui";

export function SocialFeed() {
  const [filter, setFilter] = useState("All posts");
  return (
    <div className="page narrow-page">
      <PageHeading
        eyebrow="LIFE, IN GOOD COMPANY"
        title="From the gathering."
        description="Little wins, big moments, and everything in between."
      />
      <div className="panel post-composer">
        <ProfileAvatar name="Alex Morgan" initials="AM" />
        <p>What’s on your mind, Alex?</p>
        <button className="button secondary" disabled>
          <LockKeyhole size={15} />
          Posting unavailable
        </button>
      </div>
      <p className="helper-text">
        Demo feed · Reactions only change this local preview. Publishing and
        replies are not connected.
      </p>
      <div className="tabs" role="group" aria-label="Filter feed">
        {["All posts", "Gaming", "Life & faith"].map((tab) => (
          <button
            key={tab}
            aria-pressed={filter === tab}
            className={filter === tab ? "active" : ""}
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="feed-list">
        {filter !== "Life & faith" && (
          <>
            <FeedPost />
            <FeedPost
              name="Noah"
              initials="NK"
              color="purple"
              category="Gaming"
              text="First time helping someone through a raid instead of chasing a personal best. Best session I’ve had all month. Anyone else have a small win to share?"
              likes={18}
            />
          </>
        )}
        {filter !== "Gaming" && (
          <FeedPost
            name="Sarah"
            initials="SM"
            color="orange"
            category="Life & faith"
            text="Learning that rest isn’t something you have to earn. Taking a quiet evening and being grateful for the people in my corner. Hope you find a little peace today too. 🌙"
            likes={23}
          />
        )}
      </div>
    </div>
  );
}
export function Events() {
  const [category, setCategory] = useState("All events");
  const filtered =
    category === "All events"
      ? events
      : events.filter((e) =>
          category === "Faith & Life" ? e.id === "sunday" : e.id !== "sunday",
        );
  return (
    <div className="page">
      <PageHeading
        eyebrow="MAKE TIME FOR WHAT MATTERS"
        title="Something to look forward to."
        description="Put a little community on your calendar."
      />
      <div className="events-feature panel">
        <CalendarDays size={36} />
        <div>
          <span className="eyebrow">BETTER WHEN WE SHOW UP</span>
          <h2>The best plans include your people.</h2>
          <p>
            Game nights, honest conversations, and reasons to come together.
          </p>
        </div>
      </div>
      <p className="helper-text">
        All events, dates, and attendee counts are demo data. Times are shown in
        America/New_York.
      </p>
      <div className="tabs" role="group" aria-label="Filter events">
        {["All events", "Gaming", "Faith & Life"].map((tab) => (
          <button
            key={tab}
            className={category === tab ? "active" : ""}
            aria-pressed={category === tab}
            onClick={() => setCategory(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="event-list">
        {filtered.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
export function EventDetail() {
  const { eventId } = useParams();
  const event = events.find((e) => e.id === eventId);
  const [saved, setSaved] = useState(false);
  if (!event)
    return (
      <div className="page">
        <EmptyState
          title="Event not found"
          description="This event is not in the development preview."
        >
          <Link className="button primary" to="/events">
            See all events
          </Link>
        </EmptyState>
      </div>
    );
  return (
    <div className="page narrow-page">
      <Link className="back-link" to="/events">
        <ArrowLeft size={16} />
        All events
      </Link>
      <div className="event-detail-cover">
        <CalendarDays size={70} strokeWidth={1} />
        <span>MAKE A LITTLE TIME FOR TOGETHER.</span>
      </div>
      <PageHeading
        eyebrow={`${event.category} · DEMO EVENT`}
        title={event.title}
        description={event.description}
      />
      <section className="panel padded event-details">
        <p>
          <CalendarDays size={19} />
          {event.time} · America/New_York
        </p>
        <p>
          <MapPin size={19} />
          The Gathering · Online · Demo location
        </p>
        <p>
          <Users size={19} />
          {event.attendees} sample attendees
        </p>
      </section>
      <ServiceNotice service="Event registration" />
      <div className="button-row">
        <button className="button primary" disabled>
          RSVP unavailable
        </button>
        <button
          className="button secondary"
          aria-pressed={saved}
          onClick={() => setSaved(!saved)}
        >
          {saved ? <Check size={17} /> : <CalendarDays size={17} />}{" "}
          {saved ? "Saved for this preview" : "Save in local preview"}
        </button>
      </div>
      <p className="helper-text" role="status">
        {saved
          ? "Saved only while this screen is open. You have not registered for this event."
          : "Saving here does not create a calendar entry or register attendance."}
      </p>
    </div>
  );
}
export function FaithLife() {
  const [topic, setTopic] = useState("Encouragement");
  const content: Record<
    string,
    { title: string; text: string; verse: string }
  > = {
    Encouragement: {
      title: "You don’t have to have it all figured out.",
      text: "Some days, the brave thing is simply showing up. Bring your questions, your hopes, and your unfinished story. There’s room for all of it here.",
      verse: "“Let all that you do be done in love.” — 1 Corinthians 16:14",
    },
    Reflection: {
      title: "Make a little room for stillness.",
      text: "Between the next match and the next notification, take a breath. What is one small thing you’re grateful for today? You don’t need the perfect answer.",
      verse: "“Be still, and know that I am God.” — Psalm 46:10",
    },
    Community: {
      title: "We were made for life together.",
      text: "A kind word, a listening ear, an invitation to the next game. Small acts of care can make someone’s whole day feel different. Who could you encourage today?",
      verse:
        "“Encourage one another and build one another up.” — 1 Thessalonians 5:11",
    },
  };
  return (
    <div className="page narrow-page">
      <PageHeading
        eyebrow="FOR LIFE BEYOND THE SCREEN"
        title="A little space for your soul."
        description="Faith-rooted. Open-hearted. You’re welcome wherever you are on the journey."
      />
      <section className="faith-hero">
        <HeartHandshake size={35} strokeWidth={1.5} />
        <span className="eyebrow">COME AS YOU ARE</span>
        <h2>
          There’s more to your story
          <br />
          than your next achievement.
        </h2>
        <p>
          A place to ask honest questions, find encouragement,
          <br />
          and grow alongside people who care.
        </p>
        <span className="faith-star" aria-hidden="true">
          ✦
        </span>
      </section>
      <div className="tabs" role="group" aria-label="Reflection topics">
        {Object.keys(content).map((t) => (
          <button
            key={t}
            aria-pressed={topic === t}
            className={topic === t ? "active" : ""}
            onClick={() => setTopic(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <article className="panel reflection">
        <span className="eyebrow">
          <BookOpen size={14} />
          DEMO COMMUNITY REFLECTION
        </span>
        <h2>{content[topic].title}</h2>
        <p>{content[topic].text}</p>
        <blockquote>{content[topic].verse}</blockquote>
      </article>
      <div className="two-column">
        <Link className="panel feature-link" to="/channels/prayer-requests">
          <HeartHandshake size={25} />
          <h3>A place for prayer</h3>
          <p>Explore the prayer request channel preview.</p>
          <ArrowRight size={18} />
        </Link>
        <Link className="panel feature-link" to="/events/sunday">
          <Sparkles size={25} />
          <h3>Sunday Reset</h3>
          <p>A sample gathering to pause and reconnect.</p>
          <ArrowRight size={18} />
        </Link>
      </div>
      <p className="helper-text">
        <Shield size={14} />
        Respect privacy and personal boundaries. This community is not an
        emergency or crisis service.
      </p>
    </div>
  );
}
export function Messages() {
  const { friendId } = useParams();
  const [query, setQuery] = useState("");
  const friend = friends.find((f) => f.handle === friendId);
  const filtered = friends.filter((f) =>
    `${f.name} ${f.handle}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR PEOPLE, A LITTLE CLOSER"
        title="Friends & messages"
        description="The best connections go beyond the lobby."
      />
      <ServiceNotice service="Direct messaging" />
      <div className="messages-layout panel">
        <aside className="conversation-list">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search demo friends"
              placeholder="Find a friend…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="eyebrow">DEMO FRIENDS</p>
          {filtered.map((f) => (
            <Link
              className={`friend-row ${friendId === f.handle ? "selected" : ""}`}
              key={f.handle}
              to={`/messages/${f.handle}`}
            >
              <ProfileAvatar {...f} />
              <span>
                <strong>{f.name}</strong>
                <small>@{f.handle}</small>
              </span>
            </Link>
          ))}
          {!filtered.length && (
            <p className="helper-text">No demo friends match your search.</p>
          )}
        </aside>
        <section className="conversation-detail">
          {friendId && !friend ? (
            <EmptyState
              title="Friend not found"
              description="Choose someone from the sample friend list."
            />
          ) : friend ? (
            <>
              <div className="conversation-heading">
                <ProfileAvatar {...friend} />
                <div>
                  <h2>{friend.name}</h2>
                  <p>Sample profile · {friend.activity}</p>
                </div>
              </div>
              <EmptyState
                icon={<LockKeyhole size={28} />}
                title={`Your space with ${friend.name}`}
                description="No direct messages have been loaded. Messaging is unavailable until a real service is connected."
              />
              <div className="dm-composer">
                <input
                  aria-label="Direct message unavailable"
                  placeholder="Direct messages are not connected"
                  disabled
                />
                <button className="button secondary" disabled>
                  Send
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<MessageCircle size={30} />}
              title="A conversation starts with connection."
              description="Select a demo friend to explore the message layout. No messages will be sent."
            />
          )}
        </section>
      </div>
    </div>
  );
}
