"use client";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeHref, safeStudyHref } from "../../lib/chat/validation";
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={(value) => safeStudyHref(value) ?? safeHref(value) ?? ""}
        components={{
          a: ({ href, children }) =>
            href && safeStudyHref(href) ? <Link href={href} prefetch={false}>{children}</Link> : href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>[External image: {alt || "image"}]</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
