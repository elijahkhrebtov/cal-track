import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile("src/app/icon.svg");
await mkdir("public/icons", { recursive: true });
await Promise.all([
  sharp(svg, { density: 576 })
    .resize(192, 192)
    .png()
    .toFile("public/icons/icon-192.png"),
  sharp(svg, { density: 576 })
    .resize(512, 512)
    .png()
    .toFile("public/icons/icon-512.png"),
  sharp(svg, { density: 576 })
    .resize(512, 512)
    .png()
    .toFile("public/icons/maskable-512.png"),
  sharp(svg, { density: 576 })
    .resize(180, 180)
    .png()
    .toFile("public/icons/apple-touch-icon.png"),
]);
console.log("PWA icons generated.");
