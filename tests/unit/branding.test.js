import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { loadEnv } from 'vite';
import { APP_NAME, APP_PACKAGE_NAME, APP_DESCRIPTION, getPublicSiteUrl, getWebManifest } from '../../src/config/app';
import { appMetadata } from '../../scripts/app-metadata';

const rootFile = name => resolve(process.cwd(), name);

describe('product identity and deployment metadata', () => {
  it('keeps package, lockfile, initial document and manifest identity consistent', async () => {
    const pkg = JSON.parse(await readFile(rootFile('package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(rootFile('package-lock.json'), 'utf8'));
    const html = await readFile(rootFile('index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(rootFile('assets/site.webmanifest'), 'utf8'));
    expect(pkg.name).toBe(APP_PACKAGE_NAME);
    expect(lock.name).toBe(pkg.name); expect(lock.packages[''].name).toBe(pkg.name);
    expect(html).toContain(`<title>${APP_NAME}</title>`);
    expect(manifest).toEqual(getWebManifest());
    expect(manifest.icons.every(icon => !icon.src.startsWith('/'))).toBe(true);
  });
  it('loads the final production URL for builds while leaving local development independent', () => {
    const production = loadEnv('production', process.cwd(), 'VITE_');
    const development = loadEnv('development', process.cwd(), 'VITE_');
    expect(production.VITE_PUBLIC_SITE_URL).toBe('https://aiplayground.starbugstone.com');
    expect(development.VITE_PUBLIC_SITE_URL || '').toBe('');
    const tags = appMetadata(production.VITE_PUBLIC_SITE_URL).transformIndexHtml();
    expect(tags.find(tag => tag.attrs.rel === 'canonical').attrs.href).toBe('https://aiplayground.starbugstone.com/');
    expect(tags.find(tag => tag.attrs.property === 'og:url').attrs.content).toBe('https://aiplayground.starbugstone.com/');
  });
  it('omits canonical/OG URLs when no final domain is configured', () => {
    expect(getPublicSiteUrl('')).toBeNull();
    const tags = appMetadata('').transformIndexHtml();
    expect(tags.find(tag => tag.attrs.rel === 'canonical')).toBeUndefined();
    expect(tags.find(tag => tag.attrs.property === 'og:url')).toBeUndefined();
    expect(tags.find(tag => tag.attrs.name === 'application-name').attrs.content).toBe(APP_NAME);
    expect(tags.find(tag => tag.attrs.name === 'description').attrs.content).toBe(APP_DESCRIPTION);
  });
  it('adds the configured production URL without substituting a temporary domain', () => {
    const tags = appMetadata('https://chosen.example/playground/').transformIndexHtml();
    expect(tags.find(tag => tag.attrs.rel === 'canonical').attrs.href).toBe('https://chosen.example/playground/');
    expect(tags.find(tag => tag.attrs.property === 'og:url').attrs.content).toBe('https://chosen.example/playground/');
  });
  it.each(['not-a-url', 'javascript:alert(1)', 'https://user:password@example.com/', 'https://example.com/?code=secret', 'https://example.com/#fragment'])('rejects inappropriate metadata URLs: %s', value => {
    expect(() => getPublicSiteUrl(value)).toThrow();
  });
  it.each([
    ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['apple-touch-icon.png', 180],
    ['android-chrome-192x192.png', 192], ['android-chrome-512x512.png', 512]
  ])('ships %s at its advertised size, rendered from the original SVG', async (name, size) => {
    const source = await readFile(rootFile('assets/icon.svg'));
    const actual = await readFile(rootFile(`assets/${name}`));
    const { width, height, format } = await sharp(actual).metadata();
    expect({ width, height, format }).toEqual({ width: size, height: size, format: 'png' });
    // Compare decoded pixels instead of compressed PNG bytes across platforms.
    const expectedPixels = await sharp(source).resize(size, size).raw().toBuffer();
    expect(await sharp(actual).raw().toBuffer()).toEqual(expectedPixels);
  });
  it('ships a valid ICO containing the small PNG icons and no empty assets', async () => {
    const ico = await readFile(rootFile('assets/favicon.ico'));
    expect(ico.readUInt16LE(0)).toBe(0); expect(ico.readUInt16LE(2)).toBe(1); expect(ico.readUInt16LE(4)).toBe(2);
    for (let i = 0; i < 2; i++) {
      const entry = 6 + i * 16;
      const size = ico[entry];
      const length = ico.readUInt32LE(entry + 8); const offset = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(offset, offset + length)).toEqual(await readFile(rootFile(`assets/favicon-${size}x${size}.png`)));
    }
    const files = await readdir(rootFile('assets/'));
    expect(files.some(name => name.startsWith('c__Users_'))).toBe(false);
    for (const name of files) expect((await readFile(rootFile(`assets/${name}`))).length).toBeGreaterThan(0);
  });
});
