"use client";
import { Download, Check, Smartphone, Monitor, ShieldCheck, WifiOff, Headphones } from "lucide-react";
import { usePwa } from "./PwaProvider";
export function InstallApp() {
  const { installed, canInstall, message, install } = usePwa();
  return <main id="install-content" className="install-page">
    <section className="install-hero panel">
      <div className="install-art" aria-hidden="true"><img src="/icons/icon-512.png" alt="" width="180" height="180" /><span className="install-orbit" /></div>
      <div><p className="eyebrow">YOUR PEOPLE. ONE TAP AWAY.</p><h1>Make room for<br /><span>The Gathering.</span></h1>
        <p className="install-intro">Your communities, conversations and game nights. At home on your phone and computer.</p>
        {installed ? <p className="install-installed" role="status"><Check size={20} /> You’re using the installed app.</p> : canInstall ? <button className="button primary" onClick={() => void install()}><Download size={20} /> Install The Gathering</button> : <a className="button primary" href="#install-steps"><Download size={20} /> How to install</a>}
        {message && <p className="form-notice" role="status">{message}</p>}
        <p className="muted install-small">Free to install. Use your existing account. An 18+ community.</p>
      </div>
    </section>
    <section className="install-benefits" aria-label="About the app">
      <div><Monitor /><strong>Your own app window</strong><p>Launch from your desktop, taskbar or home screen.</p></div>
      <div><ShieldCheck /><strong>Same secure account</strong><p>Your community permissions and privacy settings come with you.</p></div>
      <div><Headphones /><strong>Real conversations</strong><p>Chat and voice work online. Microphone permission stays in your control.</p></div>
    </section>
    <section id="install-steps" className="install-instructions"><p className="eyebrow">BRING YOUR PEOPLE WITH YOU</p><h2>Choose your device</h2>
      <div className="install-device-grid">
        <article className="panel padded"><Smartphone aria-hidden="true" /><h3>iPhone &amp; iPad</h3><ol><li>Open this website in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. You may need to scroll.</li><li>Keep <strong>Open as Web App</strong> enabled if offered, then tap <strong>Add</strong>.</li></ol></article>
        <article className="panel padded"><Smartphone aria-hidden="true" /><h3>Android</h3><ol><li>Open this website in <strong>Chrome</strong>.</li><li>Tap <strong>Install The Gathering</strong> here when offered, or open Chrome’s menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong> and confirm.</li></ol></article>
        <article className="panel padded"><Monitor aria-hidden="true" /><h3>Windows &amp; Mac</h3><ol><li>Open this website in <strong>Chrome</strong> or <strong>Edge</strong>.</li><li>Use the install icon in the address bar, or the browser’s app installation menu.</li><li>On supported Macs, Safari also offers <strong>File → Add to Dock</strong>.</li></ol></article>
      </div>
    </section>
    <section className="panel padded install-notes"><WifiOff aria-hidden="true" /><div><h2>Stay connected. Stay in control.</h2><p>Messages, private files and voice require internet. Offline mode shows a reconnect screen; it does not store your conversations or queue messages. Updates ask before reloading so you can leave your voice room first.</p><p>Keep the app open for voice. Background audio and notifications vary by device. In-app notifications are available while you use The Gathering; push notifications are not enabled. You may need to sign in again after installation.</p><p>Don’t see an install option? Try the steps for your browser above, check whether the app is already installed, or continue using the website.</p></div></section>
  </main>;
}
