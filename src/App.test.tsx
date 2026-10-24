vi.mock("./lib/communities/members", () => ({ communityMembers: vi.fn(async()=>({data:{community:{id:"fixture",name:"Fixture",slug:"fixture"},items:[],total:0}})), communityMemberAction: vi.fn() }));
vi.mock("./lib/admin/actions", () => ({
  memberAnnouncements: async () => ({ data: [] }),
  adminRead: async () => ({ data: {rank:0,communities:[],retention_days:null} }),
  adminCommand: async () => ({error:"Denied"}),
  submitReport: async () => ({error:"Denied"}),
  submitAppeal: async () => ({error:"Denied"}),
}));
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";
const route = vi.hoisted(() => ({ pathname: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props} />
  ),
}));
vi.mock("./lib/auth/actions", () => ({
  logout: vi.fn(),
  login: vi.fn(async () => ({ error: "Sign-in is unavailable." })),
  register: vi.fn(async () => ({
    notice: "Check your email if registration is available.",
  })),
  forgotPassword: vi.fn(async () => ({
    notice: "If an account exists, check its inbox.",
  })),
  resetPassword: vi.fn(async () => ({
    error: "Request a fresh recovery link.",
  })),
}));
vi.mock("./lib/profiles/actions", () => ({
  saveProfile: vi.fn(async () => ({ notice: "Your profile has been saved." })),
  uploadAvatar: vi.fn(async () => ({
    error: "This file could not be decoded as a safe image.",
  })),
  savePreferences: vi.fn(async () => ({ notice: "Preferences saved." })),
  changePassword: vi.fn(async () => ({ error: "Password is incorrect." })),
  deleteAccount: vi.fn(async () => ({ error: "Password is incorrect." })),
}));
vi.mock("./lib/people/actions", () => ({
  getPeople: vi.fn(),
  peopleCommand: vi.fn(),
}));
vi.mock("./components/spaces/Spaces", () => ({
  UpcomingEvents: () => (
    <p>No community events in this isolated component fixture.</p>
  ),
}));
import { Home } from "./screens/Home";
import { AppShell } from "./components/AppShell";
import { MemberProvider } from "./components/MemberContext";
import { Landing } from "./screens/Home";
import { AuthForm } from "./components/auth/AuthForm";
import { ProfileEditor } from "./components/auth/ProfileEditor";
import { AccountSettings } from "./components/auth/AccountSettings";
import type { ProfileBundle } from "./lib/profiles/data";
import { navigation } from "./data";
function renderPage(path = "/home") {
  route.pathname = path;
  return render(
    <MemberProvider
      member={{
        id: "test-member",
        name: "Jordan Rivers",
        username: "jordan",
        avatar: false,
      }}
    >
      <AppShell>
        <Home />
      </AppShell>
    </MemberProvider>,
  );
}
const profile: ProfileBundle = {
  profile: {
    id: "test-member",
    username: null,
    display_name: "",
    bio: "",
    visibility: "private",
    avatar_path: null,
    onboarding_completed_at: null,
  },
  preferences: {
    interests: [],
    event_reminders: false,
    show_gaming_activity: false,
  },
  games: [],
  platforms: [],
  gameCatalog: [{ id: "minecraft", name: "Minecraft" }],
  platformCatalog: [{ id: "pc", name: "PC" }],
};
beforeEach(() => {
  route.pathname = "/home";
});
describe("Next.js interface foundation", () => {
  it("renders the authenticated home",()=>{renderPage();expect(screen.getByRole("heading",{name:/Good to see you, Jordan/})).toBeInTheDocument();});
  it("links every sidebar destination through Next.js", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    for (const item of navigation)
      expect(
        within(nav).getByRole("link", { name: new RegExp(item.label) }),
      ).toHaveAttribute("href", item.to);
  });
  it("displays the authenticated identity instead of the old demo profile", () => {
    renderPage();
    expect(screen.getByText("Jordan Rivers")).toBeInTheDocument();
    expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
  });
  it("collapses and expands desktop navigation", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(document.querySelector(".app-shell")).toHaveClass("is-collapsed");
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(document.querySelector(".app-shell")).not.toHaveClass(
      "is-collapsed",
    );
  });
  it("traps navigation drawer focus and restores it on Escape", async () => {
    renderPage();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "All pages" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
  it("closes notifications with Escape and restores focus", async () => {
    renderPage();
    const user = userEvent.setup();
    const bell = screen.getByRole("button", { name: "Notifications" });
    await user.click(bell);
    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Notifications" }),
    ).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });
  it("shows registration and login destinations on welcome", () => {
    render(<Landing />);
    expect(
      screen.getByRole("link", { name: "Find your gathering" }),
    ).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
describe("Authentication and onboarding interface", () => {
  it("fails closed when Supabase is unconfigured", () => {
    render(<AuthForm mode="login" configured={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("isn’t configured");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
  it("registration requires age and explicit adult confirmation", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText(/Date of birth/)).toBeRequired();
    expect(
      screen.getByRole("checkbox", { name: /at least 18/ }),
    ).toBeRequired();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      "minlength",
      "12",
    );
  });
  it("keeps profile private by default and collects games and interests in three steps", async () => {
    render(<ProfileEditor data={profile} onboarding />);
    const user = userEvent.setup();
    expect(screen.getByRole("radio", { name: /Just me/ })).toBeChecked();
    await user.type(screen.getByLabelText("Display name"), "Jordan");
    await user.type(screen.getByLabelText(/Username/), "jordan_gg");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Find your kind of play." }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Minecraft" }));
    await user.click(screen.getByRole("checkbox", { name: "PC" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Co-op adventures" }),
    );
    expect(
      screen.getByRole("button", { name: "Find my gathering" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("checkbox", { name: "Minecraft" })).toBeChecked();
  });
  it("deletion requires an explicit confirmation and password", async () => {
    render(
      <AccountSettings
        email="owner@example.test"
        eventReminders={false}
        showActivity={false}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(
      screen.getByLabelText("Current password for deletion"),
    ).toBeRequired();
    expect(screen.getByLabelText("Type DELETE to confirm")).toHaveAttribute(
      "pattern",
      "DELETE",
    );
    await user.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(
      screen.queryByLabelText("Type DELETE to confirm"),
    ).not.toBeInTheDocument();
  });
});
