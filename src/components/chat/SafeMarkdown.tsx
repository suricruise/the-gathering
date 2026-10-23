"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeHref } from "../../lib/chat/validation";
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={(value) => safeHref(value) ?? ""}
        components={{
          a: ({ href, children }) =>
            href ? (
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
