import { readSchema } from "./validation";
import type { Result } from "./types";
export async function readSpace<T>(input: unknown): Promise<Result<T>> {
  const p = readSchema.safeParse(input);
  if (!p.success) return { error: "Invalid community view." };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p.data)) if (v !== null) q.set(k, v);
  try {
    const r = await fetch(`/api/spaces?${q}`, { cache: "no-store" });
    const value = await r.json();
    return r.ok
      ? value
      : {
          error: value.error || "Community services unavailable.",
          denied: r.status === 401 || r.status === 403,
        };
  } catch {
    return { error: "Connection unavailable. Please retry." };
  }
}
