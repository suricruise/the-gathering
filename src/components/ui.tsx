"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "../compat/navigation";
import {
  Bell,
  Check,
  ChevronRight,
  Gamepad2,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";

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
export { PersistentVoiceBar as VoiceConnectionBar } from "./voice/VoiceControls";
export function GameGlyph() {
  return <Gamepad2 size={18} />;
}
