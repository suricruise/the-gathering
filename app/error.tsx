"use client";
import { ErrorState } from "@/src/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <ErrorState onRetry={reset} />
    </main>
  );
}
