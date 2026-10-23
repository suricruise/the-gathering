import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function environmentIssues(env, { strict = false } = {}) {
  const issues = [];
  const required = [
    "APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "OPS_HEALTH_TOKEN",
  ];
  if (strict)
    for (const key of required) if (!env[key]) issues.push("Missing " + key);
  for (const [key, value] of Object.entries(env))
    if (key.startsWith("NEXT_PUBLIC_") && value) {
      if (/SECRET|SERVICE_ROLE|LIVEKIT_API|OPS_HEALTH/.test(key))
        issues.push("Forbidden public variable " + key);
      if (/^sb_secret_/.test(value)) issues.push("Server secret in " + key);
      if (value.startsWith("eyJ")) {
        try {
          const payload = JSON.parse(
            Buffer.from(value.split(".")[1], "base64url").toString(),
          );
          if (payload.role === "service_role")
            issues.push("Service-role JWT in " + key);
        } catch {
          /* Provider validation handles malformed public tokens. */
        }
      }
    }
  for (const key of ["APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "LIVEKIT_URL"]) {
    const value = env[key];
    if (!value) continue;
    try {
      const u = new URL(value),
        loopback = ["localhost", "127.0.0.1"].includes(u.hostname);
      if (
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        u.search ||
        u.hash ||
        !(
          key === "LIVEKIT_URL" ? ["wss:", "ws:"] : ["https:", "http:"]
        ).includes(u.protocol) ||
        (!loopback &&
          (key === "LIVEKIT_URL"
            ? u.protocol !== "wss:"
            : u.protocol !== "https:")) ||
        (strict && loopback)
      )
        issues.push("Unsafe " + key);
    } catch {
      issues.push("Invalid " + key);
    }
  }
  if (env.OPS_HEALTH_TOKEN && env.OPS_HEALTH_TOKEN.length < 32)
    issues.push("OPS_HEALTH_TOKEN must be at least 32 characters");
  if (env.LIVEKIT_API_SECRET && env.LIVEKIT_API_SECRET.length < 32)
    issues.push("LIVEKIT_API_SECRET must be at least 32 characters");
  return issues;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const issues = environmentIssues(process.env, {
    strict: process.argv.includes("--production"),
  });
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else console.log("Environment checks passed. Values were not printed.");
}
