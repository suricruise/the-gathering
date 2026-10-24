// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { expect, it } from "vitest";
import sharp from "sharp";
import manifest from "../../app/manifest";
it("provides real install icons, safe maskable artwork and a stable app identity", async () => {
 const data=manifest();expect(data.id).toBe("/");expect(data.start_url).toBe("/home");expect(data.display).toBe("standalone");expect(data.prefer_related_applications).toBe(false);
 for(const icon of data.icons!){const meta=await sharp(readFileSync("public"+icon.src)).metadata();expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);expect(meta.format).toBe("png");}
 const alpha=(await sharp("public/icons/maskable-512.png").stats()).channels[3];if(alpha)expect(alpha.min).toBe(255);
 for(const image of data.screenshots!)expect(existsSync("public"+image.src)).toBe(true);
});
