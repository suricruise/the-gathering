"use client";
import { Link } from "./compat/navigation";
import { Home } from "./screens/Home";
import { Channels } from "./screens/Channels";
import {
  CommunityDetail,
  Discovery,
  SquadUp,
  VoiceLounge,
} from "./screens/Community";
import {
  EventDetail,
  Events,
  FaithLife,
  Messages,
  SocialFeed,
} from "./screens/Social";
import { Admin } from "./screens/Account";
import { EmptyState } from "./components/ui";
export function WorkspacePage({ path }: { path: string[] }) {
  const [section, detail] = path;
  if (section === "home" && path.length === 1) return <Home />;
  if (section === "channels" && path.length <= 2) return <Channels />;
  if (section === "communities" && path.length <= 2)
    return detail ? <CommunityDetail /> : <Discovery />;
  if (section === "voice" && path.length === 1) return <VoiceLounge />;
  if (section === "squad-up" && path.length === 1) return <SquadUp />;
  if (section === "feed" && path.length === 1) return <SocialFeed />;
  if (section === "events" && path.length <= 2)
    return detail ? <EventDetail key={detail} /> : <Events />;
  if (section === "faith" && path.length === 1) return <FaithLife />;
  if (section === "messages" && path.length <= 2) return <Messages />;
  if (section === "admin" && path.length === 1) return <Admin />;
  return (
    <div className="page">
      <EmptyState
        title="A little off the map"
        description="This page could not be found."
      >
        <Link to="/home" className="button primary">
          Back home
        </Link>
      </EmptyState>
    </div>
  );
}
