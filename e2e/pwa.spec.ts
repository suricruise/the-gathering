import { test, expect } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
test("PWA installation metadata and public guide are responsive and accessible",async({page})=>{
 await page.goto("/install");await expect(page.getByRole("heading",{name:/Make room for/})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const action=page.getByRole("link",{name:"How to install"});
 if(await action.count())expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 const manifest=await page.request.get("/manifest.webmanifest");expect(manifest.status()).toBe(200);expect(manifest.headers()["set-cookie"]).toBeUndefined();
 const data=await manifest.json();expect(data.display).toBe("standalone");expect(data.start_url).toBe("/home");
 for(const icon of data.icons)expect((await page.request.get(icon.src)).status()).toBe(200);
 const worker=await page.request.get("/sw.js");expect(worker.status()).toBe(200);expect(worker.headers()["cache-control"]).toContain("no-store");expect(worker.headers()["service-worker-allowed"]).toBe("/");expect(worker.headers()["set-cookie"]).toBeUndefined();
 const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
});
test("installed offline worker never stores member pages or APIs and reconnects to real sessions",async({memberPage:page,member})=>{
 await page.goto("/home");await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.goto("/settings");await expect(page.getByRole("link",{name:"Install The Gathering"})).toBeVisible();
 await page.request.get("/api/people/data?view=privacy");
 const cached=await page.evaluate(async()=>{
  const names=(await caches.keys()).filter(name=>name.startsWith("gathering-pwa-"));
  return (await Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(request=>new URL(request.url).pathname)))).flat();
 });
 expect(cached.sort()).toEqual(["/offline.html","/pwa/offline.css","/pwa/offline.js","/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/icons/apple-touch-icon.png","/favicon.svg"].sort());
 await page.context().setOffline(true);
 await page.goto("/messages?offline-check=1");
 await expect(page.getByRole("heading",{name:"Your people will be here."})).toBeVisible();
 await expect(page.locator("body")).not.toContainText(member.email);
 await expect(page.locator("body")).not.toContainText(member.username);
 await expect(page.getByText(/Nothing is sent while you’re offline/)).toBeVisible();
 const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(axe.violations.map(v=>v.id)).toEqual([]);
 await page.context().setOffline(false);await page.getByRole("button",{name:"Try again"}).click();
 await expect(page).toHaveURL(/\/messages/);await expect(page.getByRole("heading",{name:"Your people will be here."})).toHaveCount(0);
 await expect(page.getByRole("heading",{name:/Friends|people|Messages/i}).first()).toBeVisible();
});
