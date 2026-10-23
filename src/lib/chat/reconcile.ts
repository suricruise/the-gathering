import type { ChatMessage } from "./types";
// Stable IDs and database revisions reconcile HTTP responses, Broadcast refetches,
// catch-up pages, and retry responses without duplicate or stale edits.
export function reconcileMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
) {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    const old = map.get(message.id);
    if (!old || BigInt(message.version) >= BigInt(old.version))
      map.set(message.id, message);
  }
  return [...map.values()].sort((a, b) =>
    BigInt(a.created_seq) < BigInt(b.created_seq)
      ? -1
      : BigInt(a.created_seq) > BigInt(b.created_seq)
        ? 1
        : a.id.localeCompare(b.id),
  );
}
