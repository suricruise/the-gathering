import {
  test,
  expect,
  adminClient,
  localStack,
  signIn,
  verificationLink,
  userClient,
} from "./helpers";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
test("email registration → verification → onboarding → persistent profile", async ({
  page,
}) => {
  test.skip(!localStack, "Requires local Supabase and Mailpit.");
  const suffix = randomUUID().slice(0, 8),
    email = `new-${suffix}@example.test`,
    password = `Join-${randomUUID()}`,
    username = `new_${suffix}`;
  let id: string | undefined;
  try {
    await page.goto("/register");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByLabel(/Date of birth/).fill("1995-05-18");
    await page.getByRole("checkbox", { name: /at least 18/ }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("verification link");
    const link = await verificationLink(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/onboarding$/);
    const owner = await adminClient().auth.admin.listUsers();
    id = owner.data.users.find((user) => user.email === email)?.id;
    expect(id).toBeTruthy();
    await page.getByLabel("Display name", { exact: true }).fill("New Gamer");
    await page.getByLabel(/Username/).fill(username);
    await expect(page.getByRole("radio", { name: /Anyone with the link/ })).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("checkbox", { name: "Minecraft", exact: true })
      .check();
    await page.getByRole("checkbox", { name: "PC", exact: true }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("checkbox", { name: "Co-op adventures" }).check();
    await page
      .getByRole("button", { name: "Find my gathering", exact: true })
      .click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(
      page.getByRole("heading", { name: /Good to see you, New/ }),
    ).toBeVisible();
    const cookies = (await page.context().cookies()).filter((cookie) =>
      cookie.name.includes("auth-token"),
    );
    expect(cookies.length).toBeGreaterThan(0);
    expect(
      cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"),
    ).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/profile");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "New Gamer",
    );
    await expect(
      page.getByRole("checkbox", { name: "Minecraft", exact: true }),
    ).toBeChecked();
  } finally {
    if (!id) {
      const users = await adminClient().auth.admin.listUsers();
      id = users.data.users.find((user) => user.email === email)?.id;
    }
    if (id) await adminClient().auth.admin.deleteUser(id);
  }
});
test("profile editing, secure avatar upload, visibility and logout", async ({
  memberPage: page,
  member,
  browser,
}) => {
  await page.goto("/profile");
  await page.getByLabel("Display name", { exact: true }).fill("Updated Gamer");
  await page
    .getByLabel("A little about you")
    .fill("A profile saved by a real service.");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/profile",
    ),
    page.getByRole("button", { name: "Save profile", exact: true }).click(),
  ]);
  await expect(
    page
      .locator(".form-notice")
      .filter({ hasText: "Your profile has been saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Updated Gamer",
  );
  const image = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#7350db" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Choose an avatar")
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: image,
    });
  await page
    .getByRole("button", { name: "Upload avatar", exact: true })
    .click();
  await expect(
    page
      .locator(".form-notice")
      .filter({ hasText: "Your avatar has been updated." }),
  ).toBeVisible();
  const outsider = await browser.newContext();
  const outsidePage = await outsider.newPage();
  await outsidePage.goto(`http://127.0.0.1:4173/people/${member.username}`);
  await expect(
    outsidePage.getByRole("heading", { name: "This profile isn’t available" }),
  ).toBeVisible();
  expect(
    (
      await outsider.request.get(
        `http://127.0.0.1:4173/api/avatars/${member.id}`,
      )
    ).status(),
  ).toBe(404);
  await page.getByRole("radio", { name: /Anyone with the link/ }).check();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/profile",
    ),
    page.getByRole("button", { name: "Save profile", exact: true }).click(),
  ]);
  await expect(
    page
      .locator(".form-notice")
      .filter({ hasText: "Your profile has been saved." }),
  ).toBeVisible();
  await outsidePage.reload();
  await expect(
    outsidePage.getByRole("heading", { name: "Updated Gamer" }),
  ).toBeVisible();
  const avatar = await outsider.request.get(
    `http://127.0.0.1:4173/api/avatars/${member.id}`,
  );
  expect(avatar.status()).toBe(200);
  expect(avatar.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("radio", { name: /Just me/ }).check();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/profile",
    ),
    page.getByRole("button", { name: "Save profile", exact: true }).click(),
  ]);
  await expect(
    page
      .locator(".form-notice")
      .filter({ hasText: "Your profile has been saved." }),
  ).toBeVisible();
  expect(
    (
      await outsider.request.get(
        `http://127.0.0.1:4173/api/avatars/${member.id}`,
      )
    ).status(),
  ).toBe(404);
  await outsider.close();
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/login\?loggedOut=1/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?/);
});
test("recovery email resets password and invalidates old credentials", async ({
  page,
  member,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(member.email);
  await page.getByRole("button", { name: "Request recovery link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  await page.goto(await verificationLink(member.email));
  await expect(page).toHaveURL(/\/reset-password$/);
  const password = `New-${randomUUID()}`;
  await page.getByLabel(/^New password/).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?password=updated/);
  expect(
    (
      await userClient().auth.signInWithPassword({
        email: member.email,
        password: member.password,
      })
    ).error,
  ).not.toBeNull();
  await signIn(page, member.email, password);
  await expect(page).toHaveURL(/\/home$/);
});
test("deletion reauthenticates and removes only the current account", async ({
  memberPage: page,
  member,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await page
    .getByLabel("Current password for deletion")
    .fill("incorrect-password");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(page.locator(".form-error")).toContainText("not been deleted");
  expect(
    (await adminClient().auth.admin.getUserById(member.id)).data.user?.id,
  ).toBe(member.id);
  await page.getByLabel("Current password for deletion").fill(member.password);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  expect(
    (await adminClient().auth.admin.getUserById(member.id)).data.user,
  ).toBeNull();
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?/);
});

test("settings persist preferences and reauthenticate password changes", async ({
  memberPage: page,
  member,
}) => {
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: /Event reminders/ }).check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.locator(".form-notice")).toContainText(
    "preferences have been saved",
  );
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: /Event reminders/ }),
  ).toBeChecked();
  const password = `Changed-${randomUUID()}`;
  await page
    .getByLabel("Current password", { exact: true })
    .fill(member.password);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?password=updated/);
  expect(
    (
      await userClient().auth.signInWithPassword({
        email: member.email,
        password: member.password,
      })
    ).error,
  ).not.toBeNull();
  await signIn(page, member.email, password);
});
