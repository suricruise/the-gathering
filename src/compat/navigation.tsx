"use client";
// Phase 2 presentational links now use Next.js navigation and server routes.
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";
type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children?: ReactNode;
};
export function Link({ to, ...props }: LinkProps) {
  return <NextLink href={to} {...props} />;
}
export function NavLink({ to, className, ...props }: LinkProps) {
  const pathname = usePathname();
  const active = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <NextLink
      href={to}
      className={`${className ?? ""}${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      {...props}
    />
  );
}
export function useLocation() {
  return { pathname: usePathname() };
}
export function useParams() {
  const parts = usePathname().split("/").filter(Boolean);
  return {
    communityId: parts[0] === "communities" ? parts[1] : undefined,
    channelId: parts[0] === "channels" ? parts[1] : undefined,
    eventId: parts[0] === "events" ? parts[1] : undefined,
    friendId: parts[0] === "messages" ? parts[1] : undefined,
  };
}
