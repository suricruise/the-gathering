import { PeoplePage } from "@/src/components/people/People";
export const dynamic = "force-dynamic";
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <PeoplePage
      key={tab || "friends"}
      tab={
        [
          "friends",
          "discover",
          "conversations",
          "notifications",
          "privacy",
          "blocks",
        ].includes(tab || "")
          ? tab
          : "friends"
      }
    />
  );
}
