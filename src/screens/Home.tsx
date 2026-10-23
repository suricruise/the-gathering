"use client";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Compass,
  Gamepad2,
  HeartHandshake,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";
import { Link } from "../compat/navigation";
import { useMember } from "../components/MemberContext";
import { events } from "../data";
import {
  Brand,
  DemoNotice,
  EventCard,
  FeedPost,
  SectionHeading,
} from "../components/ui";

export function Home({
  featured = [],
}: {
  featured?: import("../lib/communities/data").Community[];
}) {
  const member = useMember();
  return (
    <div className="page home-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
          <h1>
            Good to see you, {member?.name.split(" ")[0] || "friend"}{" "}
            <span className="wave" aria-hidden="true">
              ✦
            </span>
          </h1>
          <p className="muted">There’s a place for you here. Let’s find it.</p>
        </div>
        <span className="date-label">
          <CalendarDays size={15} />
          Thursday, October 22<span>Demo day</span>
        </span>
      </div>
      <section className="home-hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-illustration" aria-hidden="true">
          <span className="star star-one">✦</span>
          <span className="star star-two">✧</span>
          <span className="planet" />
          <div className="hero-mountain back" />
          <div className="hero-mountain front" />
          <span className="hero-emblem">
            <Gamepad2 size={54} strokeWidth={1.3} />
          </span>
        </div>
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span />
            MORE THAN A GAMING COMMUNITY
          </span>
          <h2>
            Good games.
            <br />
            Even better people.
          </h2>
          <p>
            Find your squad. Share your story.
            <br />
            Build connections that go beyond the game.
          </p>
          <Link className="button light" to="/communities">
            Find your community
            <ArrowRight size={17} />
          </Link>
        </div>
        <span className="hero-caption">PLAY TOGETHER. GROW TOGETHER.</span>
      </section>
      <div className="quick-actions">
        <Link to="/squad-up">
          <span className="quick-icon purple">
            <Swords size={21} />
          </span>
          <span>
            <strong>Find your squad</strong>
            <small>The next game is better together</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link to="/voice">
          <span className="quick-icon cyan">
            <Users size={21} />
          </span>
          <span>
            <strong>Come hang out</strong>
            <small>A little company goes a long way</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link to="/faith">
          <span className="quick-icon pink">
            <HeartHandshake size={21} />
          </span>
          <span>
            <strong>A little encouragement</strong>
            <small>For life beyond the screen</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <section className="home-section">
        <SectionHeading
          title="Find your kind of people"
          to="/communities"
          label="Explore communities"
        />
        <p className="section-subtitle">
          Different games. Shared values. A place to belong.
        </p>
        <div className="community-grid home-communities">
          {featured.slice(0, 3).map((community) => (
            <article className="panel live-community-card" key={community.id}>
              <div
                className="community-cover"
                style={{
                  backgroundImage: `url(/covers/${community.cover}.svg)`,
                }}
              />
              <div className="padded">
                <h3>{community.name}</h3>
                <p className="body-copy">{community.description}</p>
                <Link
                  className="button secondary"
                  to={`/communities/${community.slug}`}
                >
                  Explore community
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="home-lower-grid">
        <section>
          <SectionHeading
            title="On the horizon"
            to="/events"
            label="All events"
          />
          <div className="panel upcoming-events">
            {events.slice(0, 2).map((event) => (
              <EventCard key={event.id} event={event} compact />
            ))}
          </div>
        </section>
        <section>
          <SectionHeading
            title="From the gathering"
            to="/feed"
            label="Open feed"
          />
          <FeedPost
            text="Just a reminder: you don’t have to be the best player in the lobby to be the best teammate. Show up. Be kind. That’s the win. 💜"
            name="Noah"
            initials="NK"
            color="purple"
            category="Community"
            likes={18}
          />
        </section>
      </div>
      <footer className="page-footer">
        <span>
          <Sparkles size={13} />
          You belong here. Just as you are.
        </span>
        <Link to="/">
          About The Gathering
          <ChevronRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
export function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#welcome-content">
        Skip to content
      </a>
      <header className="landing-header">
        <Brand />
        <nav aria-label="Welcome navigation">
          <Link to="/communities">Discover</Link>
          <Link to="/faith">Our heart</Link>
          <Link className="button secondary" to="/login">
            Sign in
            <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main id="welcome-content" className="landing-main">
        <DemoNotice compact />
        <div className="welcome-hero">
          <div className="welcome-copy">
            <span className="hero-eyebrow">
              <span />A PLACE TO PLAY. A PLACE TO BELONG.
            </span>
            <h1>
              Your people.
              <br />
              Your purpose.
              <br />
              <span>Your gathering.</span>
            </h1>
            <p>
              Some connections are bigger than the game.
              <br />A welcoming home for gamers to find friendship,
              <br className="desktop-break" /> grow in faith, and do life
              together.
            </p>
            <div className="welcome-actions">
              <Link to="/register" className="button primary large-button">
                Find your gathering
                <ArrowRight size={19} />
              </Link>
              <Link to="/communities" className="text-link">
                Find your people
                <Compass size={18} />
              </Link>
            </div>
            <span className="welcome-note">
              An 18+ community. Verify your email to get started.
            </span>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="welcome-orbit orbit-a" />
            <div className="welcome-orbit orbit-b" />
            <div className="welcome-core">
              <span className="core-star">✦</span>
              <Gamepad2 size={98} strokeWidth={1} />
            </div>
            <span className="floating-label label-one">
              <Users size={18} />A place to belong
            </span>
            <span className="floating-label label-two">
              <HeartHandshake size={18} />
              Grounded in faith
            </span>
            <span className="welcome-spark">✦</span>
          </div>
        </div>
        <div className="welcome-values">
          <article>
            <span>01 / PLAY</span>
            <h2>Find your next squad.</h2>
            <p>
              From ranked matches to cozy builds, meet people who make every
              session better.
            </p>
          </article>
          <article>
            <span>02 / CONNECT</span>
            <h2>More than a username.</h2>
            <p>
              Share the wins, the real conversations, and all the little moments
              in between.
            </p>
          </article>
          <article>
            <span>03 / GROW</span>
            <h2>Room for your whole life.</h2>
            <p>
              A faith-rooted community with open doors. Come as you are,
              questions and all.
            </p>
          </article>
        </div>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Good games. Even better people.</span>
        <Link to="/home">
          Enter The Gathering
          <ArrowRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
