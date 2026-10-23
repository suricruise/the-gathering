import "server-only";
import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
export function publicPreviewUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.href.length > 2048 ||
    u.hostname.endsWith(".local") ||
    u.hostname.endsWith(".localhost") ||
    !u.hostname.includes(".")
  )
    throw Error("Preview URL unavailable");
  return u;
}
export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
function decode(value: string) {
  return value
    .replace(
      /&(?:amp|quot|apos|lt|gt|#39|#x27);/gi,
      (m) =>
        ({
          "&amp;": "&",
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
          "&#39;": "'",
          "&#x27;": "'",
        })[m.toLowerCase()] ?? "",
    )
    .split("")
    .map((c) => (c.charCodeAt(0) < 32 ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
export function extractPreview(html: string, hostname: string) {
  const tags = html.match(/<meta\b[^>]{0,4096}>/gi) ?? [];
  const properties = new Map<string, string>();
  for (const tag of tags) {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(
      /([a-z_:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    ))
      attrs.set(match[1].toLowerCase(), match[2] ?? match[3]);
    const key = attrs.get("property") ?? attrs.get("name");
    if (key && attrs.get("content"))
      properties.set(key.toLowerCase(), attrs.get("content")!);
  }
  return {
    hostname,
    title:
      decode(
        properties.get("og:title") ??
          html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
          hostname,
      ).slice(0, 160) || hostname,
    description: decode(
      properties.get("og:description") ?? properties.get("description") ?? "",
    ).slice(0, 300),
  };
}
async function readPublicHtml(
  target: URL,
): Promise<{ html?: string; redirect?: string }> {
  // Resolve once and pin the validated result to the TLS request (DNS rebinding protection).
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const records = await Promise.race([
    lookup(target.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(Error("DNS timeout")), 2500);
    }),
  ]).finally(() => clearTimeout(timeout));
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw Error("Address unavailable");
  const address = records[0];
  return new Promise((resolve, reject) => {
    const req = https.get(
      target,
      {
        family: address.family,
        headers: {
          Accept: "text/html",
          "Accept-Encoding": "identity",
          "User-Agent": "TheGathering-LinkPreview/1.0",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          response.resume();
          resolve({ redirect: response.headers.location });
          return;
        }
        if (
          response.statusCode !== 200 ||
          !response.headers["content-type"]
            ?.toLowerCase()
            .includes("text/html") ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity")
        ) {
          response.resume();
          reject(Error("Unsupported preview"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 128 * 1024) {
            req.destroy(Error("Preview too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ html: Buffer.concat(chunks).toString("utf8") }),
        );
        response.on("error", reject);
      },
    );
    const timer = setTimeout(() => req.destroy(Error("Preview timeout")), 4000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}
export async function fetchLinkPreview(value: string) {
  let target = publicPreviewUrl(value);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const result = await readPublicHtml(target);
    if (result.html !== undefined)
      return { url: value, ...extractPreview(result.html, target.hostname) };
    if (!result.redirect) break;
    target = publicPreviewUrl(new URL(result.redirect, target).href);
  }
  throw Error("Preview unavailable");
}
