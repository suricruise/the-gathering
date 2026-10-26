import {
  test,
  expect,
  adminClient,
  userClient,
  signIn,
  localStack,
} from "./helpers";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { resolve } from "node:path";
const tonePath = resolve(".local-stack/voice-test-tone.wav");
if (localStack && existsSync(".local-stack")) {
  const samples = 48000 * 5,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++)
    wav.writeInt16LE(
      Math.round(7000 * Math.sin((2 * Math.PI * 440 * n) / 48000)),
      44 + n * 2,
    );
  writeFileSync(tonePath, wav, { mode: 0o600 });
}
test.skip(
  !localStack || !process.env.LIVEKIT_URL,
  "Real local Supabase, LiveKit and enforcement worker are required.",
);
import AxeBuilder from "@axe-core/playwright";
// Real WebRTC and the actual LiveKit server. Only the microphone hardware is a
// deterministic WAV input; connections, RTP, subscriptions and permissions are real.
test.use({
  launchOptions: {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: [
      "--allow-loopback-in-peer-connection",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${tonePath}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
  permissions: ["microphone"],
});
test("real voice exchanges decoded audio, persists navigation, mutes, reconnects and revokes access", async ({
  memberPage: page,
  member,
  browser,
}) => {
  test.setTimeout(180000);
  const url = readFileSync(".local-stack/database-url", "utf8").trim();
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw Error("Local only");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const community = randomUUID(),
    channel = randomUUID(),
    restricted = randomUUID(),
    suffix = randomUUID().slice(0, 8),
    email = `voice-${suffix}@example.test`,
    password = `Gathering-${randomUUID()}`;
  let otherId: string | undefined;
  const ctx = await browser.newContext({
    viewport: page.viewportSize()!,
    permissions: ["microphone"],
  });
  const other = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  const connected = (p: typeof page) => p.locator(".voice-live-state");
  const panel = (p: typeof page) =>
    p.getByRole("region", { name: "test-voice voice room" });
  const audioEnergy = async (p: typeof page) =>
    p.evaluate(async () => {
      // Actual remote audio tracks are attached by LiveKit's RoomAudioRenderer.
      const audio = [...document.querySelectorAll("audio")].find(
        (a) =>
          a.srcObject instanceof MediaStream &&
          (a.srcObject as MediaStream).getAudioTracks().length,
      );
      if (!audio) return 0;
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      await context.resume();
      const source = context.createMediaStreamSource(
          audio.srcObject as MediaStream,
        ),
        analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      await new Promise((r) => setTimeout(r, 120));
      const values = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(values);
      const energy = values.reduce((s, v) => s + v * v, 0) / values.length;
      source.disconnect();
      await context.close();
      return energy;
    });
  try {
    const created = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { date_of_birth: "1990-01-01" },
    });
    expect(created.error).toBeNull();
    otherId = created.data.user!.id;
    const u = userClient();
    await u.auth.signInWithPassword({ email, password });
    expect(
      (
        await u.rpc("save_my_profile", {
          p_username: `voice_${suffix}`,
          p_display_name: "Taylor Voice",
          p_bio: "",
          p_visibility: "private",
          p_interests: ["co-op"],
          p_games: ["minecraft"],
          p_platforms: ["pc"],
          p_complete: true,
        })
      ).data,
    ).toBe(true);
    await db.query(
      "insert into public.communities(id,slug,name,visibility) values($1,$2,'Voice browser','private')",
      [community, `voice-${suffix}`],
    );
    await db.query(
      "insert into public.community_members(community_id,user_id,role_id) values($1,$2,'owner'),($1,$3,'member')",
      [community, member.id, otherId],
    );
    await db.query(
      "insert into public.channels(id,community_id,name,kind,is_private) values($1,$2,'test-voice','voice',true),($3,$2,'restricted-voice','voice',true)",
      [channel, community, restricted],
    );
    await db.query(
      "insert into public.channel_permission_overrides(community_id,channel_id,user_id,can_view) values($1,$2,$3,true)",
      [community, channel, otherId],
    );
    await signIn(other, email, password);
    const denied = await other.request.post("/api/voice/token", {
      data: { channel: restricted },
      headers: { Origin: "http://127.0.0.1:4173" },
    });
    expect(denied.status()).toBe(403);
    const forged = await other.request.post("/api/voice/token", {
      data: { channel, room: "arbitrary", identity: member.id },
      headers: { Origin: "http://127.0.0.1:4173" },
    });
    expect(forged.status()).toBe(400);
    const badOrigin = await other.request.post("/api/voice/token", {
      data: { channel },
      headers: { Origin: "https://outside.invalid" },
    });
    expect(badOrigin.status()).toBe(403);
    const modDenied = await other.request.post("/api/voice/control", {
      data: { channel, operation: "remove", target: member.id },
      headers: { Origin: "http://127.0.0.1:4173" },
    });
    expect(modDenied.status()).toBe(403);
    await Promise.all([
      page.goto(`/channels/${channel}`),
      other.goto(`/channels/${channel}`),
    ]);
    await page
      .getByRole("button", { name: "Join with microphone", exact: true })
      .click();
    await expect(connected(page)).toHaveText("Voice connected", {
      timeout: 30000,
    });
    await other
      .getByRole("button", { name: "Join with microphone", exact: true })
      .click();
    await expect(connected(other)).toHaveText("Voice connected", {
      timeout: 30000,
    });
    for (const p of [page, other]) {
      await expect(
        p.getByRole("heading", { name: "Connected participants (2)" }),
      ).toBeVisible();
      await expect
        .poll(() => audioEnergy(p), { timeout: 25000 })
        .toBeGreaterThan(0.00001);
    }
    console.log(
      "PASS real decoded audio energy in both authenticated browsers",
    );
    const persistent = test.info().project.name === 'mobile' ? page.locator('.mobile-voice-status') : page.getByRole('complementary',{name:'Channel directory',exact:true}).locator('.workspace-voice-connection .voice-connection');
    await expect(persistent).toContainText('Voice connected');
    await persistent.getByRole('button',{name:'Deafen audio',exact:true}).click();
    await expect(persistent.getByRole('button',{name:'Undeafen audio',exact:true})).toHaveAttribute('aria-pressed','true');
    await persistent.getByRole('button',{name:'Undeafen audio',exact:true}).click();
    await expect(persistent.getByRole('button',{name:'Mute microphone',exact:true})).toBeVisible();
    await expect.poll(()=>audioEnergy(other),{timeout:15000}).toBeGreaterThan(0.00001);
    // Actual media has nonzero decoded energy in both directions.
    await panel(page)
      .getByRole("button", { name: "Mute microphone", exact: true })
      .click();
    await expect(
      other.locator(`[data-participant-id="${member.id}"]`),
    ).toContainText("Microphone muted");
    await panel(page)
      .getByRole("button", { name: "Unmute microphone", exact: true })
      .click();
    await expect
      .poll(() => audioEnergy(other), { timeout: 15000 })
      .toBeGreaterThan(0.00001);
    await panel(page)
      .getByRole("button", { name: "Deafen", exact: true })
      .click();
    await expect(
      panel(page).getByRole("button", { name: "Undeafen", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      other.locator(`[data-participant-id="${member.id}"]`),
    ).toContainText("Microphone muted");
    await panel(page)
      .getByRole("button", { name: "Undeafen", exact: true })
      .click();
    // Client navigation must retain the same live room and microphone.
    const nav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    if (await nav.isVisible())
      await nav.getByRole("link", { name: "Home", exact: true }).click();
    else if(test.info().project.name === "desktop")
      await page.locator(".desktop-community-rail").getByRole("link",{name:"The Gathering home",exact:true}).click();
    else
      await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "Home", exact: true })
        // Keyboard activation also verifies accessible SPA navigation and avoids
        // the development-only Next issue badge over the mobile bottom corner.
        .press("Enter");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator(`.lounge-happening a[href="/channels/${channel}"]`)).toContainText("2 connected");
    if(test.info().project.name==='desktop'){
      await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
      await expect(page.locator('.shell-floating-connection')).toContainText('Voice connected');
      await expect(page.locator('.shell-floating-connection').getByRole('button',{name:'Deafen audio',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
    }
    await expect(
      other.getByRole("heading", { name: "Connected participants (2)" }),
    ).toBeVisible();
    await expect.poll(() => audioEnergy(other)).toBeGreaterThan(0.00001);
    // Next Link, rather than page.goto, preserves the mounted member layout.
    const lounge = page
      .locator('a[aria-label="Open voice lounge"]:visible')
      .first();
    await lounge.click();
    await page.locator(`a[href="/channels/${channel}"]`).click();
    await expect(connected(page)).toHaveText("Voice connected");
    // Exercise the SDK's actual transport reconnect path by closing signaling.
    await page.context().setOffline(true);
    await page.waitForTimeout(1800);
    await page.context().setOffline(false);
    await expect(connected(page)).toHaveText("Voice connected", {
      timeout: 30000,
    });
    await expect
      .poll(() => audioEnergy(other), { timeout: 20000 })
      .toBeGreaterThan(0.00001);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("live-voice.png"),
      fullPage: true,
    });
    await panel(other)
      .getByRole("button", { name: "Leave room", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Connected participants (1)" }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: "Join muted", exact: true })
      .click();
    await expect(connected(other)).toHaveText("Voice connected");
    await expect(
      page.locator(`[data-participant-id="${otherId}"]`),
    ).toContainText("Microphone muted");
    page.once("dialog", (d) => d.accept());
    await page
      .locator(`[data-participant-id="${otherId}"]`)
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(
      other.getByRole("button", { name: "Join muted", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const suspended = await other.request.post("/api/voice/token", {
      data: { channel },
      headers: { Origin: "http://127.0.0.1:4173" },
    });
    expect(suspended.status()).toBe(403);
    // Disable client polling to prove the independent server worker enforces bans.
    await db.query("delete from private.voice_suspensions where user_id=$1", [
      otherId,
    ]);
    await other
      .getByRole("button", { name: "Join muted", exact: true })
      .click();
    await expect(connected(other)).toHaveText("Voice connected");
    await other.route("**/api/voice/session", (r) => r.abort());
    await db.query(
      "update public.community_members set status='banned' where community_id=$1 and user_id=$2",
      [community, otherId],
    );
    await expect(
      other.getByRole("button", { name: "Join muted", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await other.unroute("**/api/voice/session");

    await panel(page)
      .getByRole("button", { name: "Leave room", exact: true })
      .click();
    // Browser-level denial, not a mocked getUserMedia implementation.
    await page.context().clearPermissions();
    await page.context().grantPermissions([]);
    await page
      .getByRole("button", { name: "Join with microphone", exact: true })
      .click();
    await expect(panel(page).getByRole("alert")).toContainText(
      "Microphone permission was denied",
    );
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await db.query("delete from public.communities where id=$1", [community]);
    if (otherId) await adminClient().auth.admin.deleteUser(otherId);
    await db.end();
  }
});
