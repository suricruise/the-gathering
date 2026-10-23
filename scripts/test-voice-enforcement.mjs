import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceVoice, enforcementDiagnostic } from "./voice-enforcement.mjs";
const secret = "do-not-log-private-key-or-provider-message";
function clients() {
  const calls = [];
  return {
    calls,
    admin: {
      rpc: async (name) => {
        calls.push(name);
        return name === "voice_enforcement_snapshot"
          ? { data: { rooms: [], sessions: [] } }
          : { error: null };
      },
    },
    livekit: { listRooms: async () => [] },
  };
}
test("only a complete successful provider pass records health", async () => {
  const c = clients();
  await enforceVoice(c.admin, c.livekit);
  assert.deepEqual(c.calls, [
    "voice_enforcement_snapshot",
    "voice_worker_heartbeat",
  ]);
});
test("Supabase denial identifies the stage without leaking provider text", async () => {
  const c = clients();
  c.admin.rpc = async () => ({ error: { code: "42501", message: secret } });
  await assert.rejects(
    () => enforceVoice(c.admin, c.livekit),
    (e) => {
      const message = enforcementDiagnostic(e);
      assert.match(message, /stage=supabase-snapshot code=42501/);
      assert.ok(!message.includes(secret));
      return true;
    },
  );
});
test("missing migration RPC has an actionable safe diagnostic", async () => {
  const c = clients();
  c.admin.rpc = async () => ({ error: { code: "PGRST202", message: secret } });
  await assert.rejects(
    () => enforceVoice(c.admin, c.livekit),
    (e) => {
      assert.match(enforcementDiagnostic(e), /Phase 6 migrations/);
      assert.ok(!enforcementDiagnostic(e).includes(secret));
      return true;
    },
  );
});
test("LiveKit authentication failure never advances health", async () => {
  const c = clients();
  c.livekit.listRooms = async () => {
    throw Object.assign(Error(secret), {
      code: "unauthenticated",
      status: 401,
    });
  };
  await assert.rejects(
    () => enforceVoice(c.admin, c.livekit),
    (e) => {
      assert.match(
        enforcementDiagnostic(e),
        /stage=livekit-list-rooms code=unauthenticated status=401/,
      );
      assert.ok(!enforcementDiagnostic(e).includes(secret));
      return true;
    },
  );
  assert.equal(c.calls.includes("voice_worker_heartbeat"), false);
});
test("heartbeat errors are distinguished from snapshot and LiveKit failures", async () => {
  const c = clients();
  const rpc = c.admin.rpc;
  c.admin.rpc = async (name) =>
    name === "voice_worker_heartbeat"
      ? { error: { code: "42501", message: secret } }
      : rpc(name);
  await assert.rejects(
    () => enforceVoice(c.admin, c.livekit),
    (e) => {
      assert.match(enforcementDiagnostic(e), /stage=supabase-heartbeat/);
      return true;
    },
  );
});
test("unknown errors and codes cannot inject secrets into diagnostics", async () => {
  const c = clients();
  c.livekit.listRooms = async () => {
    throw Object.assign(Error(secret), { code: secret, status: secret });
  };
  await assert.rejects(
    () => enforceVoice(c.admin, c.livekit),
    (e) => {
      assert.match(enforcementDiagnostic(e), /code=unknown status=unknown/);
      assert.ok(!enforcementDiagnostic(e).includes(secret));
      return true;
    },
  );
  assert.ok(!enforcementDiagnostic(Error(secret)).includes(secret));
});
