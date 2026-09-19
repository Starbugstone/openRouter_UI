import { APP_DESCRIPTION, APP_NAME, APP_THEME_COLOR, getPublicSiteUrl } from '../src/config/app.js';

export function appMetadata(publicSiteUrl) {
  const canonical = getPublicSiteUrl(publicSiteUrl);
  return {
    name: 'ai-playground-metadata',
    transformIndexHtml() {
      const tags = [
        { tag: 'meta', attrs: { name: 'application-name', content: APP_NAME } },
        { tag: 'meta', attrs: { name: 'description', content: APP_DESCRIPTION } },
        { tag: 'meta', attrs: { name: 'theme-color', content: APP_THEME_COLOR } },
        { tag: 'meta', attrs: { property: 'og:title', content: APP_NAME } },
        { tag: 'meta', attrs: { property: 'og:description', content: APP_DESCRIPTION } },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } }
      ];
      if (canonical) {
        tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: canonical } },
          { tag: 'meta', attrs: { property: 'og:url', content: canonical } }
        );
      }
      return tags.map(tag => ({ ...tag, injectTo: 'head' }));
    }
  };
}
