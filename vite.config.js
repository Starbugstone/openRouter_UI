import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { appMetadata } from './scripts/app-metadata.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [vue(), appMetadata(env.VITE_PUBLIC_SITE_URL)],
    publicDir: 'assets'
  };
});
