"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallState = { installed: boolean; canInstall: boolean; message: string; install: () => Promise<void> };
const PwaContext = createContext<InstallState>({ installed: false, canInstall: false, message: "", install: async () => {} });
export const usePwa = () => useContext(PwaContext);
export function PwaProvider({ children }: { children: ReactNode }) {
  const prompt = useRef<InstallPrompt | null>(null);
  const [canInstall, setCanInstall] = useState(false), [installed, setInstalled] = useState(false),
    [message, setMessage] = useState(""), [offline, setOffline] = useState(false),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null), [updated, setUpdated] = useState(false),
    [updating, setUpdating] = useState(false), [registrationFailed, setRegistrationFailed] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const checkInstalled = () => setInstalled(mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const online = () => setOffline(false), offline = () => setOffline(true);
    const offer = (event: Event) => { event.preventDefault(); prompt.current = event as InstallPrompt; setCanInstall(true); };
    const installed = () => { prompt.current = null; setCanInstall(false); setInstalled(true); setMessage("The Gathering has been installed."); };
    checkInstalled(); setOffline(!navigator.onLine);
    mode.addEventListener("change", checkInstalled);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    window.addEventListener("beforeinstallprompt", offer); window.addEventListener("appinstalled", installed);
    return () => {
      mode.removeEventListener("change", checkInstalled);
      window.removeEventListener("online", online); window.removeEventListener("offline", offline);
      window.removeEventListener("beforeinstallprompt", offer); window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    const serviceWorker = navigator.serviceWorker;
    let alive = true, lastCheck = 0;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanup: (() => void)[] = [];
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine && Date.now()-lastCheck > 60_000) {
        lastCheck = Date.now(); void registration?.update().catch(() => {});
      }
    };
    let controlled = Boolean(serviceWorker.controller);
    const controller = () => {
      if (alive && controlled) { setUpdating(false); setUpdated(true); setWaiting(null); }
      controlled = true;
    };
    // First installation is quiet; later activations offer a manual reload.
    serviceWorker.addEventListener("controllerchange", controller);
    serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((value) => {
      if (!alive) return;
      registration = value;
      if (value.waiting) setWaiting(value.waiting);
      const found = () => {
        const worker = value.installing;
        if (!worker) return;
        const changed = () => { if (alive && worker.state === "installed" && serviceWorker.controller) setWaiting(value.waiting); };
        worker.addEventListener("statechange", changed);
        cleanup.push(() => worker.removeEventListener("statechange", changed));
      };
      value.addEventListener("updatefound", found); found();
      cleanup.push(() => value.removeEventListener("updatefound", found));
      document.addEventListener("visibilitychange", check); window.addEventListener("online", check);
      cleanup.push(() => { document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); });
    }).catch(() => { if (alive) setRegistrationFailed(true); });
    return () => {
      alive = false; cleanup.forEach((fn) => fn());
      serviceWorker.removeEventListener("controllerchange", controller);
    };
  }, []);
  async function install() {
    const event = prompt.current;
    if (!event) return;
    prompt.current = null; setCanInstall(false); setMessage("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === "accepted" ? "Installation requested. Complete any browser instructions to finish." : "Installation dismissed. You can install later from your browser menu.");
    } catch { setMessage("Installation could not start. Use your browser’s installation menu or follow the steps below."); }
  }
  return <PwaContext.Provider value={{ installed, canInstall, message, install }}>
    {children}
    {offline && <aside className="pwa-status" role="status">You’re offline. Messages, uploads and voice need an internet connection.</aside>}
    {!offline && (waiting || updated) && <aside className="pwa-status pwa-update" aria-label="App update" aria-live="polite">
      <div><strong>{updated ? "Your app update is ready." : "A new version is available."}</strong><p>Leave your voice room before reloading. Reloading disconnects voice and clears unsent forms.</p></div>
      {updated ? <button className="button primary" onClick={() => window.location.reload()}>Reload app</button> : <button className="button primary" disabled={updating} onClick={() => {
        if (!waiting) return;
        setUpdating(true);
        waiting.postMessage({ type: "ACTIVATE_UPDATE" });
      }}>{updating ? "Preparing update…" : "Prepare update"}</button>}
    </aside>}
    {registrationFailed && <p className="pwa-registration-note" role="status">Offline support could not start. You can keep using the website online and retry after refreshing.</p>}
  </PwaContext.Provider>;
}
