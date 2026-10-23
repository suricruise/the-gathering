"use client";
import { useState, useEffect, useRef } from "react";
import { Link, useParams } from "../compat/navigation";
import {
  ChevronDown,
  Hash,
  LockKeyhole,
  Menu,
  MessageSquare,
  Pin,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  ChannelList,
  EmptyState,
  ProfileAvatar,
  ServiceNotice,
} from "../components/ui";
const channelNames = [
  "general",
  "introductions",
  "gaming",
  "prayer-requests",
  "wins-and-highlights",
];
const messages = [
  {
    name: "Noah",
    initials: "NK",
    color: "purple",
    time: "10:24 AM",
    text: "Morning everyone! Hope your day is off to a good start. Anyone up for a few games later? 🎮",
  },
  {
    name: "Grace",
    initials: "GR",
    color: "pink",
    time: "10:26 AM",
    text: "Absolutely! Just finishing the community build first. I might have spent a little too long on the garden… 🌿",
  },
  {
    name: "Elijah",
    initials: "EL",
    color: "cyan",
    time: "10:30 AM",
    text: "There is no such thing as too much garden. Count me in for games tonight!",
  },
  {
    name: "Sarah",
    initials: "SM",
    color: "orange",
    time: "10:34 AM",
    text: "New here and already feeling welcome. Thanks for making this such a kind place. 💜",
  },
];
export function Channels() {
  const { channelId = "general" } = useParams();
  const [drawer, setDrawer] = useState(false);
  const channelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const trigger = triggerRef.current;
    channelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key !== "Tab") return;
      const items =
        channelRef.current?.querySelectorAll<HTMLElement>("a[href],button");
      if (!items?.length) return;
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (
        !e.shiftKey &&
        document.activeElement === items[items.length - 1]
      ) {
        e.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      trigger?.focus();
    };
  }, [drawer]);
  if (!channelNames.includes(channelId))
    return (
      <div className="page">
        <EmptyState
          title="Channel not found"
          description="Choose a channel from the development preview."
        >
          <Link className="button primary" to="/channels/general">
            Open general
          </Link>
        </EmptyState>
      </div>
    );
  return (
    <div className="channel-workspace">
      <aside className="channel-sidebar">
        <div className="channel-community">
          <span className="workspace-icon">
            <Users size={20} />
          </span>
          <strong>The Gathering</strong>
          <ChevronDown size={15} />
        </div>
        <ChannelList />
      </aside>
      <section className="chat-panel">
        <header className="chat-heading">
          <button
            ref={triggerRef}
            className="icon-button channel-drawer-button"
            onClick={() => setDrawer(true)}
            aria-label="Open channels"
          >
            <Menu size={20} />
          </button>
          <Hash size={23} />
          <div>
            <h1>{channelId}</h1>
            <p>
              {channelId === "general"
                ? "Good conversations start with a hello."
                : "A little space for life together."}
            </p>
          </div>
          <span className="pill muted-pill">Demo channel</span>
        </header>
        <div className="chat-content">
          <ServiceNotice service="Chat" />
          <div className="chat-welcome">
            <span className="empty-icon">
              <Hash size={29} />
            </span>
            <h2>Welcome to #{channelId}</h2>
            <p>This is the beginning of something good.</p>
          </div>
          <div className="pinned-note">
            <Pin size={15} />
            <span>Be kind. Be yourself. There’s room for you here.</span>
          </div>
          <div className="date-divider">
            <span>Thursday, October 22 · Demo conversation</span>
          </div>
          {channelId === "general" ? (
            <div className="chat-messages" aria-label="Sample messages">
              {messages.map((message) => (
                <article className="chat-message" key={message.name}>
                  <ProfileAvatar {...message} />
                  <div>
                    <header>
                      <Link to="/profile">{message.name}</Link>
                      <time>{message.time}</time>
                      <span className="demo-inline">Demo</span>
                    </header>
                    <p>{message.text}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<MessageSquare size={26} />}
              title="A fresh start"
              description="There are no demo messages in this channel. Live messaging is not connected."
            />
          )}
        </div>
        <div className="chat-composer">
          <div className="disabled-composer">
            <LockKeyhole size={17} />
            <textarea
              aria-label={`Message ${channelId} — unavailable in preview`}
              placeholder={`Messaging #${channelId} is unavailable in preview`}
              disabled
              rows={1}
            />
            <button
              className="icon-button"
              disabled
              aria-label="Send message unavailable"
            >
              <Send size={18} />
            </button>
          </div>
          <p>
            No messages are sent. A chat service must be connected to enable
            this space.
          </p>
        </div>
      </section>
      {drawer && (
        <div
          className="channel-drawer-overlay"
          onClick={() => setDrawer(false)}
        >
          <div
            ref={channelRef}
            className="channel-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Channels"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <h2>Channels</h2>
              <button
                className="icon-button"
                onClick={() => setDrawer(false)}
                aria-label="Close channels"
              >
                <X size={20} />
              </button>
            </div>
            <ChannelList onSelect={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
