import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const path = ".local-stack/voice.json";
if (!existsSync(".local-stack/credentials.json"))
  throw Error("Start npm run db:test-stack first");
const config = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      key: `local_${randomBytes(8).toString("hex")}`,
      secret: randomBytes(32).toString("hex"),
    };
if (!existsSync(path))
  writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
const file = ".local-stack/livekit.yaml";
writeFileSync(
  file,
  `port: 7880\nrtc:\n  tcp_port: 7881\n  port_range_start: 50100\n  port_range_end: 50120\n  node_ip: 127.0.0.1\n  use_external_ip: false\n  enable_loopback_candidate: true\nkeys:\n  ${config.key}: ${config.secret}\nlogging:\n  level: warn\n`,
  { mode: 0o600 },
);
// Host networking is intentional for local WebRTC ICE candidates, loopback advertised.
try {
  execFileSync("docker", ["inspect", "gathering-test-livekit"], {
    stdio: "ignore",
  });
  execFileSync("docker", ["start", "gathering-test-livekit"], {
    stdio: "ignore",
  });
} catch {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      "gathering-test-livekit",
      "--network",
      "host",
      "-v",
      `${process.cwd()}/${file}:/livekit.yaml:ro`,
      "livekit/livekit-server:v1.9.11",
      "--config",
      "/livekit.yaml",
      "--bind",
      "127.0.0.1",
    ],
    { stdio: "inherit" },
  );
}
let env = readFileSync(".env.local", "utf8");
for (const [key, value] of Object.entries({
  LIVEKIT_URL: "ws://127.0.0.1:7880",
  LIVEKIT_API_KEY: config.key,
  LIVEKIT_API_SECRET: config.secret,
})) {
  env = env
    .split("\n")
    .filter((line) => !line.startsWith(`${key}=`))
    .join("\n");
  env += `\n${key}=${value}`;
}
writeFileSync(".env.local", env.trim() + "\n", { mode: 0o600 });
console.log(
  "Real local LiveKit started on loopback. Local-only credentials saved to ignored .env.local. Start the voice worker with --env-file=.env.local.",
);
