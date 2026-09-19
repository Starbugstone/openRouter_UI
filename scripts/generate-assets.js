import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getWebManifest } from '../src/config/app.js';

const asset = name => new URL(`../assets/${name}`, import.meta.url);
const source = await readFile(asset('icon.svg'));
const sizes = [
  ['favicon-16x16.png', 16], ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180], ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512]
];
const images = await Promise.all(sizes.map(async ([name, size]) => [name, await sharp(source).resize(size, size).png().toBuffer()]));
for (const [name, image] of images) await writeFile(asset(name), image);

// ICO directory with embedded PNGs at native favicon sizes; no additional encoder.
const icons = images.slice(0, 2).map(([, image]) => image);
const header = Buffer.alloc(6 + icons.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icons.length, 4);
let offset = header.length;
icons.forEach((image, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = sizes[i][1];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(asset('favicon.ico'), Buffer.concat([header, ...icons]));
await writeFile(asset('site.webmanifest'), `${JSON.stringify(getWebManifest(), null, 2)}\n`);
