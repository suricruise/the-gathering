import { squadContext } from "@/src/lib/squads/data";
import { filtersSchema } from "@/src/lib/squads/validation";
import { SquadDirectory } from "@/src/components/squads/SquadUp";
import { PageHeading } from "@/src/components/ui";
export const dynamic = "force-dynamic";
export default async function SquadUpPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string; mode?: string }>;
}) {
  const { client, options, unavailable } = await squadContext();
  const q = await searchParams;
  const filters = filtersSchema.safeParse({
    community: q.community ?? null,
    mode: q.mode ?? "discover",
  });
  const selected = filters.success ? filters.data : filtersSchema.parse({});
  const r = await client.rpc("squad_list", {
    p_mode: selected.mode,
    p_community: selected.community,
  });
  return (
    <div className="page squad-page">
      <PageHeading
        eyebrow="FIND YOUR PARTY · PLAY TOGETHER"
        title="Your next great session starts here."
        description="Find a game, make room for good company, and bring your squad into real voice."
      />
      <SquadDirectory
        options={options}
        initial={r.data ?? { items: [], next: null }}
        filters={selected}
        unavailable={unavailable || !!r.error}
      />
    </div>
  );
}
