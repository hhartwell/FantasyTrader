import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

function render(svgName: string, pngName: string, width: number) {
  const svg = readFileSync(join(pub, svgName));
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true },
  })
    .render();
  writeFileSync(join(pub, pngName), png.asPng());
  console.log(`${pngName} ${png.width}x${png.height}`);
}

render("favicon.svg", "favicon-32.png", 32);
render("favicon.svg", "apple-touch-icon.png", 180);
render("favicon.svg", "icon-192.png", 192);
render("favicon.svg", "icon-512.png", 512);
render("og-image.svg", "og-image.png", 1200);
