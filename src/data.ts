import {
  House,
  Hash,
  Headphones,
  Compass,
  Swords,
  PanelsTopLeft,
  CalendarDays,
  HeartHandshake,
  MessagesSquare,
  UserRound,
  Settings,
  ShieldCheck,
} from "lucide-react";

export const navigation = [
  { to: "/home", label: "Home", icon: House, section: "SPACE" },
  { to: "/channels", label: "Text channels", icon: Hash, section: "SPACE" },
  { to: "/voice", label: "Voice lounge", icon: Headphones, section: "SPACE" },
  { to: "/communities", label: "Discover", icon: Compass, section: "CONNECT" },
  { to: "/squad-up", label: "Squad Up", icon: Swords, section: "CONNECT" },
  {
    to: "/feed",
    label: "Social feed",
    icon: PanelsTopLeft,
    section: "CONNECT",
  },
  { to: "/events", label: "Events", icon: CalendarDays, section: "CONNECT" },
  {
    to: "/faith",
    label: "Faith & Life",
    icon: HeartHandshake,
    section: "GROW",
  },
  {
    to: "/messages",
    label: "Friends & messages",
    icon: MessagesSquare,
    section: "GROW",
  },
  { to: "/profile", label: "My profile", icon: UserRound, section: "ACCOUNT" },
  { to: "/settings", label: "Settings", icon: Settings, section: "ACCOUNT" },
  {
    to: "/admin",
    label: "Admin dashboard",
    icon: ShieldCheck,
    section: "ACCOUNT",
  },
];
