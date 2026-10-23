import Link from "next/link";
import { Gamepad2, ShieldCheck } from "lucide-react";
import { Brand } from "../ui";
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <Brand />
        <Link href="/" className="text-link">
          Back to welcome
        </Link>
      </header>
      <main className="auth-main">
        <aside className="auth-story">
          <span className="eyebrow">YOUR PEOPLE. YOUR PURPOSE.</span>
          <h2>
            A place for
            <br />
            your whole self<span>.</span>
          </h2>
          <p>
            Good games, real friendships, and room to grow.
            <br />
            There’s a seat for you at The Gathering.
          </p>
          <div className="auth-art" aria-hidden="true">
            <Gamepad2 size={94} strokeWidth={1} />
            <span>✦</span>
          </div>
          <div className="auth-trust">
            <ShieldCheck size={18} />
            <span>An 18+ community. Privacy comes first.</span>
          </div>
        </aside>
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-footer">PLAY TOGETHER. GROW TOGETHER.</footer>
    </div>
  );
}
