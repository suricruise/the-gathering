import { requireUser } from "@/src/lib/auth/session";
import { MemberSafety } from "@/src/components/admin/MemberSafety";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("/reports");
  const p = await searchParams;
  return (
    <MemberSafety
      target={typeof p.target === "string" ? p.target : ""}
      type={typeof p.type === "string" ? p.type : "message"}
    />
  );
}
