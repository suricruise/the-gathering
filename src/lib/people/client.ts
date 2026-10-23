import type { Result, PeopleHome, History } from "./types";
import { historySchema } from "./validation";
async function read<T>(url: string): Promise<Result<T>> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const value = await r.json();
    return r.ok
      ? value
      : {
          error: value.error || "People and messages unavailable.",
          denied: r.status === 401 || r.status === 403 || value.denied === true,
        };
  } catch {
    return { error: "People and messages unavailable. Please retry." };
  }
}
export const fetchPeople = () => read<PeopleHome>("/api/people/data");
export function fetchDirectHistory(input: unknown): Promise<Result<History>> {
  const p = historySchema.safeParse(input);
  if (!p.success)
    return Promise.resolve({
      error: "Conversation unavailable.",
      denied: true,
    });
  const q = new URLSearchParams({ conversation: p.data.conversation });
  if (p.data.before) q.set("before", p.data.before);
  return read<History>(`/api/people/data?${q}`);
}
export async function heartbeat() {
  try {
    await fetch("/api/people/data", { method: "POST", cache: "no-store" });
  } catch {
    /* Offline state is already shown; presence expires naturally. */
  }
}
