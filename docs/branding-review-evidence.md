# Branding and generated-asset review evidence

The checks below cover files that automated reviewers may exclude by default.

## Icon source and generation

AI Playground's mark was authored in this PR from a rounded chat bubble, a four-point spark, and a small green circle. It uses no imported logo, external image, or OpenRouter asset. The source is reproduced here so its geometry can be inspected even when SVG files are filtered out of review:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0b0c10"/>
  <path d="M128 104h256a48 48 0 0 1 48 48v176a48 48 0 0 1-48 48H224l-80 64v-64h-16a48 48 0 0 1-48-48V152a48 48 0 0 1 48-48Z" fill="#8b80f9"/>
  <path d="m256 144 32 72 72 32-72 32-32 72-32-72-72-32 72-32Z" fill="#0b0c10"/>
  <circle cx="368" cy="160" r="24" fill="#bff4c5"/>
</svg>
```

![AI Playground mark](../assets/android-chrome-192x192.png)

[`scripts/generate-assets.js`](../scripts/generate-assets.js) renders the checked-in source into 16px, 32px, 180px, 192px, and 512px PNGs and embeds the small PNGs in the ICO file. Run `npm run generate:assets` to regenerate them.

[`tests/unit/branding.test.js`](../tests/unit/branding.test.js) independently checks:

- Each PNG's advertised dimensions and decoded pixels against a fresh SVG render.
- The ICO header and directory offsets, and that the embedded images match the PNGs.
- That the accidental `c__Users_...` asset is absent and every remaining asset is nonempty.
- That the manifest matches the central app metadata.

[`tests/e2e/branding.spec.js`](../tests/e2e/branding.spec.js) requests each favicon and manifest/icon URL and verifies that the server returns the asset rather than an HTML fallback.

## Package and lockfile consistency

The same unit suite parses `package.json` and `package-lock.json` directly. It requires the manifest name, lockfile root name, and `packages[""].name` to agree with `APP_PACKAGE_NAME` (`ai-playground`).

The lockfile was regenerated through npm. The [regression workflow](../.github/workflows/ci.yml) runs `npm ci` before the tests, so a package/lockfile dependency mismatch fails CI as well.

Run the focused evidence checks with:

```bash
npm ci
npm test -- tests/unit/branding.test.js
npm run test:e2e -- tests/e2e/branding.spec.js
```
