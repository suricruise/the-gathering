// Reproducible first-party app artwork and content-versioned offline worker. No network.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
process.env.XDG_CACHE_HOME ??= join(tmpdir(), "gathering-assets-cache");
mkdirSync(process.env.XDG_CACHE_HOME, { recursive: true });
const svg = readFileSync("scripts/pwa/icon.svg", "utf8");
mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-192",192],["icon-512",512],["maskable-512",512],["apple-touch-icon",180]])
  await sharp(Buffer.from(svg)).resize(size,size).png().toFile(`public/icons/${name}.png`);
writeFileSync("public/favicon.svg", svg);
for (const [width,height] of [[1170,2532],[1179,2556],[1290,2796],[1536,2048]]) {
  const logoWidth=Math.round(width*.3),left=(width-logoWidth)/2,top=Math.round(height*.38);
  const splash=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b0e18"/><svg x="${left}" y="${top}" width="${logoWidth}" height="${logoWidth}" viewBox="0 0 512 512">${svg.replace(/^[\s\S]*?<svg[^>]*>/,"").replace(/<\/svg>\s*$/,"")}</svg><text x="50%" y="${top+logoWidth+width*.09}" text-anchor="middle" fill="#f1eefb" font-family="sans-serif" font-size="${width*.055}" font-weight="700">the gathering.</text><text x="50%" y="${top+logoWidth+width*.15}" text-anchor="middle" fill="#b7b0ca" font-family="sans-serif" font-size="${width*.03}">Your people. Your place.</text></svg>`;
  await sharp(Buffer.from(splash)).png().toFile(`public/icons/launch-${width}x${height}.png`);
}
const hash=createHash("sha256");
function include(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=`${directory}/${entry.name}`;
    if(entry.isDirectory()) include(path);
    else if(!/\.(test|spec)\./.test(path)) { hash.update(path);hash.update(readFileSync(path)); }
  }
}
for(const directory of ["app","src","scripts/pwa","public/pwa","public/icons"]) include(directory);
for(const path of ["public/offline.html","public/favicon.svg","package-lock.json"]) hash.update(readFileSync(path));
const version=hash.digest("hex").slice(0,16);
writeFileSync("public/sw.js",readFileSync("scripts/pwa/service-worker.js","utf8").replace("__PWA_VERSION__",version));
console.log("Generated PWA icons, launch artwork and public-only offline worker.");
