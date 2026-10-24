// @vitest-environment node
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
function worker() {
  const events = new Map<string, (event: Record<string, unknown>) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const fetch = vi.fn(async () => new Response("public offline shell"));
  const skipWaiting = vi.fn(async () => {}), claim = vi.fn(async () => {});
  const normalize = (key: Request | string) => new URL(typeof key === "string" ? key : key.url,"https://gathering.test").pathname;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if(!stores.has(name)) stores.set(name,new Map());
      const store=stores.get(name)!;
      return { put: async (key: string,response: Response) => { store.set(normalize(key),response.clone()); }, match: async (key: Request | string) => store.get(normalize(key))?.clone() };
    },
  };
  class WorkerRequest extends Request { constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === "string" ? new URL(input,"https://gathering.test") : input, init); } }
  const context=createContext({ Request: WorkerRequest, Response, URL, fetch, caches, self: { location: { origin: "https://gathering.test" }, clients: { claim }, skipWaiting, addEventListener: (type: string,listener: (event: Record<string,unknown>) => void) => events.set(type,listener) } });
  runInContext(readFileSync("scripts/pwa/service-worker.js","utf8"),context);
  async function lifecycle(type: string, data?: unknown) { let task: Promise<unknown> | undefined; events.get(type)!({ data, waitUntil: (promise: Promise<unknown>) => { task=promise; } }); await task; }
  async function request(path: string, options: { method?: string; mode?: string } = {}) {
    let response: Promise<Response> | undefined;
    events.get("fetch")!({ request: { url: new URL(path,"https://gathering.test").href, method: options.method || "GET", mode: options.mode || "navigate", headers: new Headers() }, respondWith: (promise: Promise<Response>) => { response=promise; } });
    return response;
  }
  return { fetch, stores, lifecycle, request, skipWaiting, claim };
}
it("precaches only public files with cookies omitted and no automatic activation", async () => {
 const w=worker();await w.lifecycle("install");
 const keys=[...w.stores.values()][0];
 expect([...keys.keys()]).toHaveLength(8);
 expect([...keys.keys()]).not.toContain("/home");
 for(const args of w.fetch.mock.calls as unknown as [Request][]) { expect(args[0].credentials).toBe("omit");expect(args[0].redirect).toBe("error"); }
 expect(w.skipWaiting).not.toHaveBeenCalled();
 await w.lifecycle("message",{type:"ACTIVATE_UPDATE"});expect(w.skipWaiting).toHaveBeenCalledTimes(1);
});
it("never intercepts APIs, Auth, posts, RSC, media or other origins", async () => {
 const w=worker();
 for(const [path,options] of [["/api/chat/session",{}],["/auth/confirm?token_hash=secret",{}],["/messages",{method:"POST"}],["/home?_rsc=abc",{mode:"cors"}],["/api/communities/id/header",{}],["https://provider.test/private",{}]] as const)
  expect(await w.request(path,options)).toBeUndefined();
 expect(w.fetch).not.toHaveBeenCalled();expect(w.stores.size).toBe(0);
});
it("fetches member navigations without caching and falls back only on network failure", async () => {
 const w=worker();await w.lifecycle("install");
 const before=[...w.stores.values()][0].size;
 w.fetch.mockResolvedValueOnce(new Response("private authenticated document"));
 expect(await (await w.request("/messages?conversation=private"))!.text()).toBe("private authenticated document");
 expect([...w.stores.values()][0].size).toBe(before);
 w.fetch.mockRejectedValueOnce(Error("offline"));
 const offline=await w.request("/messages?conversation=private");
 expect(await offline!.text()).toBe("public offline shell");
 expect([...w.stores.values()][0].size).toBe(before);
 w.fetch.mockResolvedValueOnce(new Response("Server error",{status:503}));
 expect((await w.request("/home"))!.status).toBe(503);
});
it("cleans only obsolete app caches while preserving unrelated caches", async () => {
 const w=worker();await w.lifecycle("install");
 w.stores.set("gathering-pwa-old",new Map());w.stores.set("unrelated-cache",new Map());
 await w.lifecycle("activate");
 expect(w.stores.has("gathering-pwa-old")).toBe(false);expect(w.stores.has("unrelated-cache")).toBe(true);expect(w.claim).toHaveBeenCalledTimes(1);
});
it("refuses to install an incomplete offline shell", async () => {
 const w=worker();w.fetch.mockResolvedValue(new Response("unavailable",{status:503}));
 await expect(w.lifecycle("install")).rejects.toThrow("Offline assets unavailable");
 expect([...w.stores.values()][0].size).toBe(0);
});
