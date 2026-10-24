// Capture only the public welcome page on a local preview; never member content.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined) });
mkdirSync("public/screenshots", { recursive: true });
try {
  for (const [name,width,height] of [["desktop",1280,800],["mobile",390,844]]) {
    const page = await browser.newPage({ viewport: { width,height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await page.evaluate("document.fonts.ready");
    await page.screenshot({ path: `public/screenshots/${name}.png` });
    await page.close();
  }
} finally { await browser.close(); }
console.log("Captured public welcome screenshots without member data.");
