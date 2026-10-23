"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "../compat/navigation";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  Compass,
  Gamepad2,
  House,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Swords,
  X,
} from "lucide-react";
import { useMember, MemberAvatar } from "./MemberContext";
import { logout } from "../lib/auth/actions";
import { LogOut } from "lucide-react";
import { friends, navigation } from "../data";
import {
  Brand,
  DemoNotice,
  NotificationBell,
  ProfileAvatar,
  VoiceConnectionBar,
} from "./ui";

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const member = useMember();
  return (
    <>
      <div className="sidebar-brand">
        <Brand compact={collapsed} />
        <button
          className="icon-button collapse-button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </div>
      <Link
        to="/communities"
        className="workspace-switcher"
        onClick={onNavigate}
      >
        <span className="workspace-icon">
          <Gamepad2 size={20} />
        </span>
        {!collapsed && (
          <>
            <span>
              <strong>The Gathering</strong>
              <small>Your people. Your place.</small>
            </span>
            <ChevronDown size={14} />
          </>
        )}
      </Link>
      <nav className="main-navigation" aria-label="Main navigation">
        {navigation.map((item, index) => (
          <div key={item.to}>
            {(index === 0 ||
              navigation[index - 1].section !== item.section) && (
              <p className="nav-section">
                {collapsed
                  ? "···"
                  : {
                      SPACE: "YOUR SPACE",
                      CONNECT: "CONNECT & PLAY",
                      GROW: "LIFE TOGETHER",
                      ACCOUNT: "YOU",
                    }[item.section]}
              </p>
            )}
            <NavLink
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={19} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.to === "/squad-up" && (
                <span className="nav-new">NEW</span>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <form action={logout}>
          <button className="logout-button" type="submit" title="Sign out">
            <LogOut size={17} />
            {!collapsed && "Sign out"}
          </button>
        </form>
        <VoiceConnectionBar />
        <Link className="self-profile" to="/profile" onClick={onNavigate}>
          <MemberAvatar />
          {!collapsed && (
            <>
              <span>
                <strong>{member?.name || "Member"}</strong>
                <small>
                  {member?.username ? `@${member.username}` : "Your account"}
                </small>
              </span>
              <ChevronDown size={14} />
            </>
          )}
        </Link>
      </div>
    </>
  );
}
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const location = useLocation();
  const current = navigation.find((item) =>
    location.pathname.startsWith(item.to),
  );
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button
          className="icon-button mobile-menu-button"
          onClick={onMenu}
          aria-label="Open navigation"
        >
          <Menu size={21} />
        </button>
        <span className="breadcrumb-root">Your space</span>
        <ChevronLeft className="breadcrumb-divider" size={13} />
        <span>{current?.label ?? "The Gathering"}</span>
      </div>
      <div className="topbar-actions">
        <Link className="search-shortcut" to="/communities">
          <Search size={16} />
          <span>Find your people</span>
          <span className="search-key">↗</span>
        </Link>
        <NotificationBell />
        <span className="topbar-divider" />
        <Link to="/profile" aria-label="Open your profile">
          <MemberAvatar size="small" />
        </Link>
      </div>
    </header>
  );
}
export function MobileNavigation({ onMenu }: { onMenu: () => void }) {
  return (
    <>
      <div className="mobile-voice-status">
        <span className="tiny-dot" />
        <span>Voice disconnected</span>
        <Link to="/voice">
          Open voice lounge
          <ArrowUpRight size={11} />
        </Link>
      </div>
      <nav className="mobile-navigation" aria-label="Mobile navigation">
        {[
          { to: "/home", label: "Home", icon: House },
          { to: "/communities", label: "Discover", icon: Compass },
          { to: "/squad-up", label: "Squad Up", icon: Swords },
          { to: "/messages", label: "Messages", icon: MessageCircle },
        ].map((item) => (
          <NavLink key={item.to} to={item.to}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button onClick={onMenu} aria-label="Open all pages">
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
function FriendsSidebar() {
  return (
    <aside className="friends-sidebar" aria-label="Community activity">
      <div className="section-heading">
        <h2>Around the gathering</h2>
        <span className="tiny-dot" />
      </div>
      <p className="rail-description">A few familiar faces.</p>
      <span className="rail-label">SAMPLE ONLINE MEMBERS</span>
      <div className="friend-list">
        {friends.map((friend) => (
          <Link
            to={`/messages/${friend.handle}`}
            className="friend-row"
            key={friend.name}
          >
            <ProfileAvatar {...friend} />
            <span>
              <strong>{friend.name}</strong>
              <small>{friend.activity}</small>
            </span>
          </Link>
        ))}
      </div>
      <Link className="text-link all-friends" to="/messages">
        All friends
        <ArrowUpRight size={14} />
      </Link>
      <div className="rail-divider" />
      <div className="quote-card">
        <span className="quote-mark">“</span>
        <p>
          As iron sharpens iron,
          <br />
          so one person sharpens another.
        </p>
        <span>PROVERBS 27:17</span>
        <div className="quote-spark" aria-hidden="true">
          ✦
        </div>
      </div>
      <div className="rail-footer">
        <span className="tiny-dot" />
        <p>
          Built for connection.
          <br />
          Grounded in something greater.
        </p>
      </div>
      <span className="rail-version">THE GATHERING · DEVELOPMENT</span>
    </aside>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const drawerRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current !== location.pathname) mainRef.current?.focus();
    previousPath.current = location.pathname;
  }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = drawerRef.current;
    panel?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panel?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKey);
      returnFocus.current?.focus();
    };
  }, [drawer]);
  const openDrawer = () => {
    returnFocus.current = document.activeElement as HTMLElement;
    setDrawer(true);
  };
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>
      <div className="app-body" inert={drawer ? true : undefined}>
        <Topbar onMenu={openDrawer} />
        <div className="workspace-layout">
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            <DemoNotice compact />
            {children}
          </main>
          <FriendsSidebar />
        </div>
      </div>
      <div inert={drawer ? true : undefined}>
        <MobileNavigation onMenu={openDrawer} />
      </div>
      {drawer && (
        <div className="drawer-overlay" onClick={() => setDrawer(false)}>
          <aside
            ref={drawerRef}
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="All pages"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button drawer-close"
              onClick={() => setDrawer(false)}
              aria-label="Close navigation"
            >
              <X size={21} />
            </button>
            <Sidebar
              collapsed={false}
              onToggle={() => setDrawer(false)}
              onNavigate={() => {
                returnFocus.current = null;
                setDrawer(false);
              }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
