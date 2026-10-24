import Link from "next/link";
import { InstallApp } from "@/src/components/pwa/InstallApp";
export const metadata = { title: "Install the app", description: "Install The Gathering on your phone or computer. Your people, one tap away." };
export default function InstallPage() {
  return <><a className="skip-link" href="#install-content">Skip to installation</a><header className="install-header"><Link href="/" aria-label="The Gathering welcome">the gathering<span>.</span></Link><Link href="/home">Open The Gathering →</Link></header><InstallApp /><footer className="install-footer"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/community-rules">Community rules</Link></footer></>;
}
