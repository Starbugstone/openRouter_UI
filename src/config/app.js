export const APP_NAME = 'AI Playground';
export const APP_PACKAGE_NAME = 'ai-playground';
export const APP_DESCRIPTION = 'Experiment with AI chat, image generation, streaming responses, and conversation branches. AI Playground uses OpenRouter as its model/API gateway.';
export const APP_THEME_COLOR = '#0b0c10';
export const DATABASE_NAME = 'ai_playground';

// Only metadata uses the configured public URL. OAuth and API attribution always
// use the active browser origin, including localhost and deployment previews.
export function getPublicSiteUrl(value = import.meta.env?.VITE_PUBLIC_SITE_URL) {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_PUBLIC_SITE_URL must be an HTTP(S) URL without credentials, query parameters, or a fragment.');
  }
  return url.href;
}

export function getWebManifest() {
  return {
    id: './',
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: './',
    scope: './',
    icons: [
      { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    theme_color: APP_THEME_COLOR,
    background_color: APP_THEME_COLOR,
    display: 'standalone'
  };
}
