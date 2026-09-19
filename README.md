# AI Playground

Production: [aiplayground.starbugstone.com](https://aiplayground.starbugstone.com)

AI Playground is a lightweight browser-based interface for experimenting with AI chat, image generation, streaming responses, and conversation branches. It currently uses OpenRouter as its model/API gateway. Chats stay in IndexedDB in your browser; no application backend or client secret is needed.

## Run locally

Use Node.js 24 LTS (Node 22.12+ is also supported).

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. To use another port: `npm run dev -- --port 5187`.

1. Click **Connect with OpenRouter** and authorize on OpenRouter.
2. Select a model and choose text or image mode.
3. Write a prompt, optionally attach images, and send.

The app uses [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth) with S256. A random verifier and nonce are kept in sessionStorage only during authorization. Because OpenRouter documents no standalone state parameter, the nonce is carried in `callback_url` and validated before exchanging the code. Callback parameters are removed immediately, and failed codes are never automatically retried. Use Connect again if authorization is cancelled or expires.

The returned API key is saved automatically in localStorage as `ai_playground_openrouter_key` and restored on subsequent visits, including browser restarts. Connection changes synchronize across tabs. There is no manual-key input or remember checkbox. Obsolete `or_api_key` and `or_remember_key` entries are deleted without being read or migrated.

Local storage is accessible to JavaScript on the page; it is **not secure secret storage**. Keep dependencies and deployment CSP/XSS protections maintained. The generated key is not displayed, logged, or stored in chat records. Disconnect removes the local credential; revoke the key on OpenRouter to disable it everywhere. The account panel links to that key's settings and usage using its SHA-256 hash. Those links require the key owner's OpenRouter login.

## Paid models and billing

Paid models are hidden by default. Enabling them asks for explicit opt-in and shows a credit warning. Before the first paid request for each model/pricing/key-limit combination in the current page session, the app refreshes key status and asks for confirmation with pricing and the key's current allowance. Reloading or changing connections resets confirmations.

Pricing is classified conservatively across all returned pricing fields, including image, audio, request, search, cache, and reasoning charges. Missing, invalid, or conditional pricing is treated as potentially paid.

- A $0 key or exhausted allowance blocks paid sends; free models remain available.
- A finite positive key limit allows paid use up to the remaining allowance, subject to account/workspace controls and available credits.
- A null limit means **no per-key spend limit**, not free usage.
- If status cannot be refreshed, paid requests are blocked until status is available.

The panel shows total/daily/weekly/monthly usage, remaining allowance, reset, free-tier status, and expiry. Status refreshes after paid requests and on demand. Change limits through **Manage OpenRouter key**; inference credentials cannot manage their own limits. Billing failures preserve the connection, while revoked/expired credentials require reconnection. Requests are never retried automatically or switched to a paid fallback model.

## Build and deploy

```bash
npm run build
npm run preview
```

Deploy `dist/` to a static HTTPS host. OAuth derives its callback from the current origin and pathname, so localhost ports, subpaths, and future domain changes need no auth code edits. The host must serve the app at that callback path. App attribution and the authorization key label use `APP_NAME` in `src/config/app.js`; the API referer uses the runtime origin.

### Production domain configuration

The production hostname is `aiplayground.starbugstone.com` and is already reachable over HTTPS. The tracked `.env.production` sets `VITE_PUBLIC_SITE_URL=https://aiplayground.starbugstone.com`, so normal production builds and Vercel preview builds advertise the canonical production URL. Development leaves canonical/OG URLs unset. The value only controls metadata; OAuth callbacks and `HTTP-Referer` always follow the active browser origin, including localhost and previews.

For a different deployment, override `VITE_PUBLIC_SITE_URL` in the build environment or `.env.production.local`, then rebuild. Setting it to an empty string omits canonical/OG URLs. `.env.production` contains public configuration only; never add secrets to `VITE_*` variables.

For hosting at a subpath, build with Vite's `--base` option, for example `npm run build -- --base=/playground/`, and set the public site URL to include that path. Preview that build with the same base: `npm run preview -- --base=/playground/`. Icons use Vite's base URL and the manifest uses relative paths.

After merging and deploying this PR to the existing production hostname:

- Confirm the new AI Playground title, icons, and canonical/OG URL on the live site; invalidate cached favicon/PWA assets if needed.
- Verify real OAuth authorization and code exchange, then model/chat requests. Confirm `HTTP-Referer` is `https://aiplayground.starbugstone.com` and `X-Title` is AI Playground; recheck localhost too.
- Remove any superseded custom hostname from active hosting configuration if applicable. No old-domain redirect or repository rename is required.

The hostname and HTTPS are already in place. Live verification of the new OAuth flow requires the PR's application version to be deployed.

### Intentional development-history reset

The active database is now `ai_playground` with the current chat schema. Database initialization deletes the previous development database without reading, copying, exporting, or preserving its chats and branches. Existing development chat history is intentionally discarded; subsequent AI Playground history persists normally in the new database. Old manual-key entries are deleted separately during OAuth initialization.

### Provider resources

AI Playground uses OpenRouter as its AI model/API provider. These links open the upstream provider's official resources:

- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart)
- [OpenRouter image generation documentation](https://openrouter.ai/docs/features/multimodal/image-generation)
- [OpenRouter models](https://openrouter.ai/models)

## Regression checks

```bash
npm test                        # unit, component, transport, and chat persistence tests
npx playwright install --with-deps chromium # once per development machine
npm run test:e2e                 # browser tests with mocked OpenRouter endpoints
npm run check                   # unit tests, production build, browser tests
```

CI runs the same checks on pushes and pull requests. Browser tests exercise a real Chromium browser on a non-default localhost port, including redirect PKCE, persistence, cross-tab disconnect, paid confirmations, exhausted allowances, auth/billing errors, and mobile layout. Unit tests cover S256, callback failures, expiry/revocation, pricing, streaming, stop, images, regeneration, cloning, edited branches, credential exclusion from persisted chats, branding/metadata, generated asset paths, and the deliberate database reset.

All automated OpenRouter calls are mocked: tests do not log into an account or spend credits. Before deploying, manually verify an actual authorization on the production HTTPS origin and localhost, a full browser restart, external key revocation, and real free/paid/image requests with appropriate test-account limits.

## Code organization

- `src/config/app.js`: product identity, metadata, manifest, and database name.
- `src/config/openrouter.js`: provider endpoints and OAuth storage names.
- `scripts/app-metadata.js`: Vite metadata injection with optional canonical/OG URLs.
- `assets/icon.svg`: original AI Playground chat/spark mark; `npm run generate:assets` rebuilds the PNG/ICO icons and manifest.
- `src/utils/pkce.js`, `pricing.js`: crypto and shared billing classification/display.
- `src/composables/useOpenRouterAuth.js`: connection lifecycle, storage, status, and paid-request safeguards.
- `src/composables/useApi.js`: OpenRouter transport and SSE decoding with sanitized errors.
- `src/composables/useChat.js`: chat/branch state and a shared text/image completion path.
- `src/composables/useDb.js`: IndexedDB chat persistence.
- `src/components/AuthPanel.vue`: connection and spending status.

## Troubleshooting

- **Authorization failed:** connect again to obtain a fresh code. Browser storage must be enabled; use HTTPS or localhost for Web Crypto.
- **Status unavailable:** refresh status after checking connectivity. A temporary network failure does not delete the key.
- **Credits or allowance exhausted:** review the key limit and credits on OpenRouter. The app does not automatically retry a charged request.
- **Models unavailable:** refresh the model list or choose another model.
- **Image generation failed:** select an image-capable model and check its pricing and account allowance.

## License

This project is open source and available under the MIT License.
