// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  allow: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  rpc: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  reset: vi.fn(),
  resend: vi.fn(),
  update: vi.fn(),
  signOut: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  deleteUser: vi.fn(),
  removeChat: vi.fn(),
  removeSocial: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../chat/cleanup", () => ({
  removeAccountChatFiles: mocks.removeChat,
}));
vi.mock("../social/cleanup", () => ({
  removeAccountSocialFiles: mocks.removeSocial,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("../supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("./session", () => ({ requireUser: mocks.requireUser }));
vi.mock("./rate-limit", () => ({ allowAuthAttempt: mocks.allow }));
vi.mock("../config", () => ({
  authConfigured: () => true,
  appOrigin: () => "https://gathering.example",
}));
import { login, register, forgotPassword, resendVerification } from "./actions";
import {
  saveProfile,
  deleteAccount,
  uploadAvatar,
  changePassword,
} from "../profiles/actions";
function form(values: Record<string, string | string[]>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value])
      result.append(key, item);
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allow.mockResolvedValue(true);
  mocks.removeChat.mockResolvedValue(true);
  mocks.removeSocial.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.signIn.mockResolvedValue({
    data: { user: { id: "owner-id", email_confirmed_at: "verified" } },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  const client = {
    rpc: mocks.rpc,
    auth: {
      signInWithPassword: mocks.signIn,
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.reset,
      resend: mocks.resend,
      updateUser: mocks.update,
      signOut: mocks.signOut,
    },
  };
  mocks.createClient.mockResolvedValue(client);
  mocks.requireUser.mockResolvedValue({
    client,
    user: { id: "owner-id", email: "owner@example.test" },
  });
  mocks.createAdminClient.mockReturnValue({
    storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
    auth: { admin: { deleteUser: mocks.deleteUser } },
  });
});
describe("Server actions and account isolation", () => {
  it("refuses unauthenticated profile mutation before touching data", async () => {
    mocks.requireUser.mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(saveProfile({}, form({ username: "gamer" }))).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never accepts a client user ID or role for profile edits", async () => {
    await saveProfile(
      {},
      form({
        user_id: "victim-id",
        role: "admin",
        username: "owner_gamer",
        displayName: "Owner",
        bio: "Hello",
        visibility: "private",
        games: ["minecraft"],
        platforms: ["pc"],
        interests: ["co-op"],
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_lounge_profile",
      expect.not.objectContaining({ user_id: "victim-id" }),
    );
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("role");
  });
  it("returns generic username-save failure without revealing availability", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const result = await saveProfile(
      {},
      form({
        username: "taken_name",
        displayName: "Owner",
        bio: "",
        visibility: "private",
      }),
    );
    expect(result.error).toMatch(/couldn’t save/);
    expect(result.error).not.toMatch(/exists|taken|registered/i);
  });
  it("validates inputs before calling the profile RPC", async () => {
    const result = await saveProfile(
      {},
      form({ username: "<script>", visibility: "public" }),
    );
    expect(result.error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires games, platforms, and interests to complete onboarding", async () => {
    const result = await saveProfile(
      {},
      form({
        username: "new_gamer",
        displayName: "Member",
        bio: "",
        visibility: "private",
        complete: "yes",
      }),
    );
    expect(result.error).toMatch(/Choose at least one/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not call Auth when throttled", async () => {
    mocks.allow.mockResolvedValue(false);
    const result = await login(
      {},
      form({ email: "member@example.test", password: "secret-passphrase" }),
    );
    expect(result.error).toBeTruthy();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("shows an unavailable service instead of asking users to wait when migrations are missing", async () => {
    mocks.allow.mockRejectedValueOnce(
      new Error("Authentication limiter is unavailable"),
    );
    const result = await register(
      {},
      form({
        email: "member@example.test",
        password: "long-test-passphrase",
        dateOfBirth: "1990-01-01",
        adultConsent: "on",
      }),
    );
    expect(result.error).toMatch(/Authentication is unavailable/);
    expect(result.error).not.toMatch(/wait/);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("does not establish a successful unverified login", async () => {
    mocks.signIn.mockResolvedValue({
      data: { user: { id: "unverified", email_confirmed_at: null } },
      error: null,
    });
    const result = await login(
      {},
      form({ email: "member@example.test", password: "secret-passphrase" }),
    );
    expect(result.error).toMatch(/verify/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("registration validates age on the server", async () => {
    const result = await register(
      {},
      form({
        email: "member@example.test",
        password: "secret-passphrase",
        dateOfBirth: "2020-01-01",
        adultConsent: "on",
      }),
    );
    expect(result.error).toMatch(/18/);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("uses the same recovery response for missing and existing accounts", async () => {
    mocks.reset
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: "email_not_found" } });
    const input = form({ email: "member@example.test" });
    expect(await forgotPassword({}, input)).toEqual(
      await forgotPassword({}, input),
    );
  });
  it("rejects SVG and oversized avatars before invoking privileged Storage", async () => {
    const svg = form({ user_id: "victim" });
    svg.append(
      "avatar",
      new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" }),
    );
    expect((await uploadAvatar({}, svg)).error).toMatch(/Only PNG/);
    const large = form({});
    large.append(
      "avatar",
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
        type: "image/png",
      }),
    );
    expect((await uploadAvatar({}, large)).error).toMatch(/2 MB/);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it("rejects a forged image MIME type by decoding real bytes", async () => {
    const input = form({});
    input.append(
      "avatar",
      new File(["<svg><script>alert(1)</script></svg>"], "pretend.webp", {
        type: "image/webp",
      }),
    );
    expect((await uploadAvatar({}, input)).error).toMatch(
      /safe image|still image/,
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it("requires typed confirmation before account deletion", async () => {
    const result = await deleteAccount(
      {},
      form({ confirmation: "yes", currentPassword: "password" }),
    );
    expect(result.error).toMatch(/DELETE/);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("cannot delete with a wrong password", async () => {
    mocks.signIn.mockResolvedValue({
      data: { user: null },
      error: { message: "wrong" },
    });
    const result = await deleteAccount(
      {},
      form({ confirmation: "DELETE", currentPassword: "wrong" }),
    );
    expect(result.error).toMatch(/not been deleted/);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("deletes only the authenticated identity, ignoring a malicious submitted ID", async () => {
    await expect(
      deleteAccount(
        {},
        form({
          confirmation: "DELETE",
          currentPassword: "correct-password",
          user_id: "victim-id",
          role: "admin",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/login?deleted=1");
    expect(mocks.deleteUser).toHaveBeenCalledWith("owner-id");
    expect(mocks.list).toHaveBeenCalledWith("owner-id", { limit: 1000 });
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "correct-password",
    });
  });
  it("does not delete identity when private message file cleanup fails", async () => {
    mocks.removeChat.mockResolvedValue(false);
    const result = await deleteAccount(
      {},
      form({
        confirmation: "DELETE",
        currentPassword: "correct-password",
        user_id: "victim-id",
      }),
    );
    expect(result.error).toMatch(/not been deleted/);
    expect(mocks.removeChat).toHaveBeenCalledWith("owner-id");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("does not delete identity when private social media cleanup fails", async () => {
    mocks.removeSocial.mockResolvedValue(false);
    const result = await deleteAccount(
      {},
      form({
        confirmation: "DELETE",
        currentPassword: "correct-password",
        user_id: "victim-id",
      }),
    );
    expect(result.error).toMatch(/not been deleted/);
    expect(mocks.removeSocial).toHaveBeenCalledWith("owner-id");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("does not delete identity when avatar cleanup fails", async () => {
    mocks.list.mockResolvedValue({ data: null, error: { message: "offline" } });
    const result = await deleteAccount(
      {},
      form({ confirmation: "DELETE", currentPassword: "correct-password" }),
    );
    expect(result.error).toMatch(/not been deleted/);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("does not change password until current credentials are verified", async () => {
    mocks.signIn.mockResolvedValue({
      data: { user: null },
      error: { message: "wrong" },
    });
    const result = await changePassword(
      {},
      form({
        newPassword: "new-long-password",
        confirmPassword: "new-long-password",
        currentPassword: "wrong",
      }),
    );
    expect(result.error).toMatch(/verify/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

it("refuses owner deletion before removing any stored files",async()=>{mocks.rpc.mockResolvedValue({data:false,error:null});const r=await deleteAccount({},form({confirmation:"DELETE",currentPassword:"Correct-Password123!"}));expect(r.error).toMatch(/Transfer ownership/);expect(mocks.removeChat).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();expect(mocks.deleteUser).not.toHaveBeenCalled();});

it("resends verification through the public Auth API with a generic enumeration-safe response",async()=>{
 mocks.resend.mockResolvedValueOnce({error:null});
 const known=await resendVerification({},form({email:"member@example.test"}));
 expect(mocks.resend).toHaveBeenCalledWith({type:"signup",email:"member@example.test",options:{emailRedirectTo:"https://gathering.example/auth/callback"}});
 mocks.resend.mockResolvedValueOnce({error:{code:"user_not_found"}});
 expect(await resendVerification({},form({email:"unknown@example.test"}))).toEqual(known);
 mocks.allow.mockResolvedValueOnce(false);
 expect(await resendVerification({},form({email:"member@example.test"}))).toEqual(known);
 expect(mocks.resend).toHaveBeenCalledTimes(2);
});
it("validates resend inputs before Auth and fails safely when the limiter is unavailable",async()=>{
 expect((await resendVerification({},form({email:"invalid"}))).error).toBeTruthy();expect(mocks.resend).not.toHaveBeenCalled();
 mocks.allow.mockRejectedValueOnce(Error("limiter unavailable"));expect((await resendVerification({},form({email:"member@example.test"}))).error).toMatch(/unavailable/);
});
