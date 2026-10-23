import "server-only";
import { requireUser } from "../auth/session";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SpaceWorkspace } from "../../components/spaces/Spaces";
import type { Context } from "./types";
export async function spacePage(
  view: "faith" | "events" | "notifications" | "prayer" | "event",
  resource?: string,
) {
  if (resource && !z.uuid().safeParse(resource).success) notFound();
  const { client } = await requireUser(
    view === "faith"
      ? "/faith"
      : view === "events"
        ? "/events"
        : "/notifications",
  );
  const r = await client.rpc("space_read", { p_view: "context" });
  return (
    <SpaceWorkspace
      key={`${view}:${resource || ""}`}
      view={view}
      resource={resource || null}
      context={r.data as Context | null}
      unavailable={!!r.error}
    />
  );
}
