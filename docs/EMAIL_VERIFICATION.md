# Email verification and unfinished accounts

An Admin member row with no display name or username means profile setup has not finished. **Account: active** means the account is not suspended/banned; it does not prove email verification or completed onboarding. The UI now says **Profile setup pending / No username selected** and explains that distinction. Email addresses are not added to member-search results.

## Recover an existing member

1. Have them open the canonical site in a regular browser: `https://the-gathering3.vercel.app/login`.
2. Sign in with the email/password they registered. If the email was confirmed, normal authenticated routing takes them to `/onboarding` to choose a display name, username, games and interests.
3. If the email remains unverified, use **Get verification help → Resend verification email** at `/verify-email`. Use the newest message and check spam. The notice is intentionally generic and does not reveal whether an email address exists or is verified. Provider mail cooldowns still apply.
4. If they forgot their password, use the existing password recovery link. Do not create another account, bypass email confirmation or assign a username for someone without their participation.
5. Staff may check the specific user's email-confirmed status in the restricted Supabase Authentication Users dashboard. Do not share their email, token, password, verification URL query or fragment in support messages.

The reported Safari blank page occurred before the PWA release. Its exact hosted cause has not been reproduced; a screenshot of a pending profile alone cannot identify the failing URL, email template, browser session or provider response. The app's PWA worker excludes Auth/API requests and never caches verification links.

## Supabase configuration: important for Safari/email-app links

Repository email templates are **not automatically published to hosted Supabase by a Vercel deployment**. Configure the hosted project explicitly:

1. Open **Supabase → Authentication → URL Configuration**.
2. Set **Site URL** to exactly `https://the-gathering3.vercel.app` (no `/home`, no `/auth/callback`, no preview deployment hostname).
3. Allow these exact production redirects:
   - `https://the-gathering3.vercel.app/auth/confirm`
   - `https://the-gathering3.vercel.app/auth/callback`
   - `https://the-gathering3.vercel.app/auth/callback?next=/reset-password`
4. Open **Authentication → Email Templates → Confirm signup** (some dashboard versions group templates under **Emails**).
5. Replace the body with the full HTML in `supabase/templates/confirmation.html`. Its link must be:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Verify email</a>
   ```

6. Save the template. For password recovery, use `supabase/templates/recovery.html` with `type=recovery`.
7. Request a fresh email. Changing a template does not rewrite messages already delivered. Keep Confirm email enabled and preserve existing SMTP/security settings.
8. Verify a fresh registration on the actual Safari/device and in a separate browser/device. Check that the canonical site opens profile setup and writes its HttpOnly session cookies. Test an expired/used link, resend, subsequent password sign-in and password recovery.

Token-hash templates allow a one-use provider-verified token to establish the session without the browser cookie that initiated registration. Legacy/default PKCE links still work only with their matching verifier state. Even when both actions are described as “Safari,” an email-app view, a private window, a different hostname/preview deployment or another device may have a different cookie context; that is a possible cause, not a confirmed explanation for this member. Do not weaken cookie flags or accept URL-fragment access tokens as a shortcut.

## Error handling changes

Both Auth handlers validate the configured destination **before consuming** a verification token/code. Missing/invalid links, configuration failures, PKCE state errors and SDK/dependency exceptions now redirect to an allowlisted, server-rendered help page rather than escaping as an empty Route Handler error. Failure destinations never contain the token/code or raw provider response. Responses remain private/no-store, no-referrer and noindex; fixed relative help URLs still work if APP_URL itself is invalid. Successful recovery/onboarding redirects and normal server-side Auth verification are retained.

The resend server action validates email input, uses the existing shared attempt budget, invokes the real Supabase public Auth resend API and returns the same non-enumerating notice for unknown/verified/limited addresses. It does not mark accounts verified or create profiles/admin roles. `/verify-email` bypasses Auth refresh so instructions can render during Auth trouble. The existing rate-limiter failure fails closed.

No database migration or new secret is required. Production app deployment and hosted configuration changes remain subject to the user's approval policy. Local automated test results are in `DEVELOPMENT_LOG.md`; actual Safari/hosted SMTP acceptance remains a manual requirement when that browser/service cannot be reached from this workspace.
