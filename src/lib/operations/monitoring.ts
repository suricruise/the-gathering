/** An allowlisted event envelope: never forward exception messages, URLs or headers. */
export function operationalEvent(
  event: "server_error" | "client_boundary" | "health_failed",
  digest?: string,
) {
  const safeDigest =
    typeof digest === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(digest)
      ? digest
      : undefined;
  console.error(
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...(safeDigest ? { digest: safeDigest } : {}),
    }),
  );
}
