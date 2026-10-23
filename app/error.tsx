"use client";
import { useEffect } from "react";
import { operationalEvent } from "@/src/lib/operations/monitoring";
import { ErrorState } from "@/src/components/ui";
export default function ErrorPage({
  reset,
  error,
}: {
  reset: () => void;
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    operationalEvent("client_boundary", error.digest);
  }, [error.digest]);
  return (
    <main className="page">
      <ErrorState onRetry={reset} />
    </main>
  );
}
