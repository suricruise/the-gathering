"use client";
import { useRef } from "react";
import Link from "next/link";
type Item = { id: string; name: string; kind: string };
export function ChannelNavigation({
  channels,
  active,
}: {
  channels: Item[];
  active: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const links = (close = false) => (
    <nav aria-label="Community channels">
      {channels.map((c) => (
        <Link
          className="live-channel-link"
          key={c.id}
          href={`/channels/${c.id}`}
          aria-current={c.id === active ? "page" : undefined}
          onClick={() => {
            if (close) dialog.current?.close();
          }}
        >
          {c.kind === "text" ? "#" : "◉"} {c.name}
        </Link>
      ))}
    </nav>
  );
  return (
    <>
      <aside className="panel padded desktop-channel-directory">
        <h2>Community channels</h2>
        {links()}
      </aside>
      <div className="mobile-channel-directory">
        <button
          className="button secondary"
          onClick={() => dialog.current?.showModal()}
        >
          Open channels
        </button>
        <dialog
          ref={dialog}
          aria-label="Channels"
          className="live-channel-dialog"
        >
          <button
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            Close channels
          </button>
          <h2>Community channels</h2>
          {links(true)}
        </dialog>
      </div>
    </>
  );
}
