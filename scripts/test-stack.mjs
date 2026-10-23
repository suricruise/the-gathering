import { createHmac, randomBytes, createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";
const dir = ".local-stack";
mkdirSync(dir, { recursive: true, mode: 0o700 });
let env;
if (existsSync(`${dir}/credentials.json`))
  env = JSON.parse(readFileSync(`${dir}/credentials.json`, "utf8"));
else {
  const secret = randomBytes(32).toString("hex");
  const token = (role) => {
    const data = [
      { alg: "HS256", typ: "JWT" },
      {
        role,
        iss: "supabase-local-test",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 86400,
      },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".");
    return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
  };
  env = {
    TEST_DB_PASSWORD: randomBytes(24).toString("hex"),
    TEST_JWT_SECRET: secret,
    TEST_ANON_KEY: token("anon"),
    TEST_SERVICE_KEY: token("service_role"),
  };
  writeFileSync(`${dir}/credentials.json`, JSON.stringify(env), {
    mode: 0o600,
    flag: "wx",
  });
}
writeFileSync(
  `${dir}/.env`,
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
const compose = (...args) =>
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      "gathering-test",
      "--env-file",
      `${dir}/.env`,
      "-f",
      "supabase/test-stack.compose.yml",
      ...args,
    ],
    { stdio: "inherit" },
  );
if (process.argv.includes("--stop")) {
  compose("down");
  process.exit(0);
}
compose("up", "-d", "db", "mail");
let db;
for (let i = 0; i < 30; i++) {
  try {
    db = new pg.Client({
      connectionString: `postgresql://postgres:${env.TEST_DB_PASSWORD}@127.0.0.1:54322/postgres`,
    });
    await db.connect();
    break;
  } catch (error) {
    if (i === 29) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
try {
  await db.query(`do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
 if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
 if not exists(select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login superuser; end if;
 if not exists(select 1 from pg_roles where rolname='supabase_storage_admin') then create role supabase_storage_admin login superuser; end if;
 end $$;
 grant anon,authenticated,service_role to authenticator;
 grant usage on schema public to anon,authenticated,service_role;
 create schema if not exists auth;
 alter schema auth owner to supabase_auth_admin;
 create schema if not exists extensions;
 create extension if not exists pgcrypto with schema extensions;`);
  for (const role of [
    "authenticator",
    "supabase_auth_admin",
    "supabase_storage_admin",
  ])
    await db.query(`alter role ${role} password '${env.TEST_DB_PASSWORD}'`);
  await db.query(
    "alter role supabase_auth_admin set search_path=auth,public,extensions; alter role supabase_storage_admin set search_path=storage,public,extensions",
  );
  await db.query(`create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid $$;
 create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role')) $$;
 grant usage on schema auth to anon,authenticated,service_role;
 grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  compose("up", "-d", "auth", "rest", "storage");
  for (const [url, label] of [
    ["http://127.0.0.1:54325/health", "Auth"],
    ["http://127.0.0.1:54327/status", "Storage"],
  ]) {
    for (let i = 0; i < 60; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) break;
      } catch {
        /* Service may still be starting. */
      }
      if (i === 59) throw new Error(`${label} did not become healthy`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await db.query(
    "create schema if not exists gathering_migrations; revoke all on schema gathering_migrations from public; create table if not exists gathering_migrations.applied(version text primary key, checksum text not null)",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = await db.query(
      "select checksum from gathering_migrations.applied where version=$1",
      [file],
    );
    if (prior.rowCount) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error(`Applied migration changed: ${file}`);
      continue;
    }
    await db.query("begin");
    try {
      await db.query(sql);
      await db.query("insert into gathering_migrations.applied values($1,$2)", [
        file,
        checksum,
      ]);
      await db.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  // Supabase normally grants service_role table access through default privileges.
  await db.query(
    "grant usage on schema storage to anon,authenticated,service_role; grant all on all tables in schema storage to service_role; grant all on all sequences in schema storage to service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; notify pgrst, 'reload schema'",
  );
  if (!existsSync(".env.local"))
    writeFileSync(
      ".env.local",
      `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${env.TEST_ANON_KEY}\nSUPABASE_SECRET_KEY=${env.TEST_SERVICE_KEY}\nAPP_URL=http://127.0.0.1:3000\n`,
      { mode: 0o600, flag: "wx" },
    );
  writeFileSync(
    `${dir}/database-url`,
    `postgresql://postgres:${env.TEST_DB_PASSWORD}@127.0.0.1:54322/postgres`,
    { mode: 0o600 },
  );
  console.log(
    "Local test services and versioned migrations are ready. Credentials were not printed. Start npm run test:gateway for the loopback API gateway.",
  );
} finally {
  await db.end();
}
