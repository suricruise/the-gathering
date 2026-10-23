"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "../compat/navigation";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Gamepad2,
  Hash,
  Headphones,
  Heart,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Radio,
  RefreshCw,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import type { Community, GatheringEvent } from "../data";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="The Gathering welcome">
      <span className="brand-mark" aria-hidden="true">
        g<span>✦</span>
      </span>
      {!compact && (
        <span>
          the gathering<span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}
export function OnlineStatus({
  status = "online",
}: {
  status?: "online" | "away" | "offline";
}) {
  return (
    <span className={`status-dot ${status}`} role="img" aria-label={status} />
  );
}
export function ProfileAvatar({
  name,
  initials,
  color = "purple",
  status,
  size = "",
}: {
  name: string;
  initials?: string;
  color?: string;
  status?: "online" | "away" | "offline";
  size?: "large" | "small" | "";
}) {
  return (
    <span
      className={`avatar ${color} ${size}`}
      role="img"
      aria-label={`${name}${status ? `, ${status}` : ""}`}
    >
      <span aria-hidden="true">
        {initials ??
          name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
      </span>
      {status && <OnlineStatus status={status} />}
    </span>
  );
}
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`demo-notice ${compact ? "compact" : ""}`}>
      <span className="demo-tag">DEMO</span>
      <span>
        {compact
          ? "Community content preview · Sample people and activity"
          : "Community content is sample data. Accounts and gamer profiles use Supabase; chat and voice services are not connected."}
      </span>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function SectionHeading({
  title,
  to,
  label = "View all",
}: {
  title: string;
  to?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {to && (
        <Link className="text-link" to={to}>
          {label}
          <ChevronRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function EmptyState({
  icon = <MessageCircle size={28} />,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function LoadingState({
  label = "Loading content…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <WifiOff size={26} />
      <h2>We couldn’t load this content</h2>
      <p>Your work is safe. Check your connection and try again.</p>
      <button className="button secondary" onClick={onRetry}>
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  );
}
export function ServiceNotice({ service }: { service: string }) {
  return (
    <div className="service-notice">
      <WifiOff size={18} />
      <div>
        <strong>{service} is not connected</strong>
        <p>
          This is a development preview. No messages are sent and no live
          sessions are created.
        </p>
      </div>
    </div>
  );
}
export function CommunityCard({ community }: { community: Community }) {
  return (
    <Link
      className={`community-card ${community.theme}`}
      to={`/communities/${community.id}`}
    >
      <div className="community-art">
        <div className="terrain terrain-back" />
        <div className="terrain terrain-front" />
        <span className="game-monogram" aria-hidden="true">
          {community.initials}
        </span>
        <span className="art-category">{community.category}</span>
        <ArrowUpRight size={17} className="art-arrow" />
      </div>
      <div className="community-body">
        <h3>{community.name}</h3>
        <p>{community.description}</p>
        <div className="card-meta">
          <span>
            <Users size={13} />
            {community.members} members
          </span>
          <span>
            <i className="tiny-dot" />
            {community.online} online
          </span>
        </div>
      </div>
    </Link>
  );
}
export function ChannelList({
  base = "/channels",
  onSelect,
}: {
  base?: string;
  onSelect?: () => void;
}) {
  return (
    <nav className="channel-list" aria-label="Community channels">
      <p className="eyebrow">TEXT CHANNELS</p>
      {[
        "general",
        "introductions",
        "gaming",
        "prayer-requests",
        "wins-and-highlights",
      ].map((channel) => (
        <NavLink key={channel} to={`${base}/${channel}`} onClick={onSelect}>
          <Hash size={16} />
          <span>{channel}</span>
          {channel === "general" && <span className="unread-dot" />}
        </NavLink>
      ))}
      <p className="eyebrow">VOICE CHANNELS</p>
      <Link to="/voice" onClick={onSelect}>
        <Headphones size={16} />
        The hangout
      </Link>
      <Link to="/voice" onClick={onSelect}>
        <Headphones size={16} />
        Quiet company
      </Link>
      <p className="channel-note">
        <LockKeyhole size={14} />
        Community spaces are in preview.
      </p>
    </nav>
  );
}
export function VoiceRoomCard({
  name,
  description,
  count,
  quiet = false,
}: {
  name: string;
  description: string;
  count: number;
  quiet?: boolean;
}) {
  return (
    <article className="voice-card panel">
      <div className="room-top">
        <span className={`room-icon ${quiet ? "cyan" : ""}`}>
          <Headphones size={23} />
        </span>
        <span className="pill muted-pill">Preview room</span>
      </div>
      <h3>{name}</h3>
      <p className="muted">{description}</p>
      <div className="room-members">
        <span className="avatar-stack">
          {["NK", "GR", "EL"]
            .slice(0, Math.min(3, count))
            .map((initials, i) => (
              <ProfileAvatar
                key={initials}
                name={`Demo member ${initials}`}
                initials={initials}
                color={["purple", "pink", "cyan"][i]}
                size="small"
              />
            ))}
        </span>
        <span>{count} sample members</span>
      </div>
      <button className="button secondary full" disabled>
        <WifiOff size={16} />
        Voice unavailable
      </button>
    </article>
  );
}
export function FeedPost({
  name = "Grace",
  initials = "GR",
  color = "pink",
  text = "Finished our community spawn build tonight. It’s wild what a few people and a lot of patience can create. Grateful for this little corner of the internet. 💜",
  category = "Minecraft",
  likes = 12,
}: {
  name?: string;
  initials?: string;
  color?: string;
  text?: string;
  category?: string;
  likes?: number;
}) {
  const [liked, setLiked] = useState(false);
  return (
    <article className="feed-post panel">
      <div className="post-author">
        <ProfileAvatar name={name} initials={initials} color={color} />
        <div>
          <Link to="/profile">{name}</Link>
          <span>
            2 hours ago · <span className="demo-inline">Demo post</span>
          </span>
        </div>
        <span className="pill muted-pill">{category}</span>
      </div>
      <p className="post-text">{text}</p>
      <div className="post-actions">
        <button
          aria-pressed={liked}
          onClick={() => setLiked(!liked)}
          title="Local demo reaction only"
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
          {likes + Number(liked)}
          <span className="sr-only"> demo reactions</span>
        </button>
        <Link to="/feed">
          <MessageCircle size={17} />
          View conversation
        </Link>
        <span className="post-save-note">Local preview</span>
      </div>
    </article>
  );
}
export function EventCard({
  event,
  compact = false,
}: {
  event: GatheringEvent;
  compact?: boolean;
}) {
  return (
    <Link
      className={`event-card ${compact ? "compact" : "panel"}`}
      to={`/events/${event.id}`}
    >
      <span className={`event-date ${event.theme}`}>
        <small>{event.month}</small>
        <strong>{event.day}</strong>
      </span>
      <div className="event-info">
        <span className="eyebrow">{event.category}</span>
        <h3>{event.title}</h3>
        <p>
          <Clock3 size={13} />
          {event.time}
        </p>
        {!compact && (
          <>
            <p className="event-description">{event.description}</p>
            <span className="card-meta">
              <Users size={14} />
              {event.attendees} sample attendees · Demo event
            </span>
          </>
        )}
      </div>
      <ChevronRight size={17} />
    </Link>
  );
}
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  return (
    <div className="notification-wrap" ref={rootRef}>
      <button
        ref={buttonRef}
        className="icon-button notification-button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        <span />
      </button>
      {open && (
        <section
          id="notification-panel"
          className="notification-popover"
          aria-label="Notifications"
        >
          <div className="section-heading">
            <h2>Notifications</h2>
            <button
              className="icon-button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              aria-label="Close notifications"
            >
              <X size={17} />
            </button>
          </div>
          <EmptyState
            icon={<Check size={24} />}
            title="You’re all caught up"
            description="Live notifications aren’t connected yet. Nothing has been marked as read on a server."
          />
        </section>
      )}
    </div>
  );
}
export function VoiceConnectionBar() {
  return (
    <div className="voice-connection" aria-label="Voice connection status">
      <span className="voice-off-icon">
        <Radio size={18} />
      </span>
      <div>
        <strong>Voice disconnected</strong>
        <span>Development preview</span>
      </div>
      <Link to="/voice" className="icon-button" aria-label="Open voice lounge">
        <Headphones size={17} />
      </Link>
    </div>
  );
}
export function GameGlyph() {
  return <Gamepad2 size={18} />;
}
