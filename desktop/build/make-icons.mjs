// Regenerate desktop/build/icon.png and icon.ico from icon.svg.
//
// Run with `node desktop/build/make-icons.mjs`. It renders the SVG with the Chromium that
// Playwright already provides (a devDependency for the e2e suite), then assembles a
// Vista-style ICO that embeds PNG frames directly. No extra image libraries are added to
// the project. Commit the generated icon.png/icon.ico; they are build inputs, not outputs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** ICO container with PNG-compressed frames (supported by Windows Vista and later). */
export function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries = Buffer.alloc(16 * frames.length);
  let offset = header.length + entries.length;
  frames.forEach(({ size, data }, index) => {
    const at = index * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, at);
    entries.writeUInt8(size >= 256 ? 0 : size, at + 1);
    entries.writeUInt8(0, at + 2);
    entries.writeUInt8(0, at + 3);
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...frames.map(frame => frame.data)]);
}

export async function main() {
  const svg = await readFile(join(here, 'icon.svg'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const frames = [];
    for (const size of ICO_SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg.toString('utf8')}`);
      frames.push({ size, data: await page.screenshot({ omitBackground: true }) });
    }
    await browser.close();
    await mkdir(here, { recursive: true });
    await writeFile(join(here, 'icon.png'), frames.at(-1).data);
    await writeFile(join(here, 'icon.ico'), buildIco(frames));
    console.log(`desktop/build/icon.png ${frames.at(-1).data.length} bytes`);
    console.log(`desktop/build/icon.ico ${ICO_SIZES.join(', ')} frames`);
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
