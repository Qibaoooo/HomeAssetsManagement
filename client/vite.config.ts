import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'vite';

// Dev proxies API calls to the local TEST instance (npm run dev starts it with .env.test).
// Production lives on the phone, never on this machine. Override: API_URL=http://... npm run dev
const API = process.env.API_URL ?? 'http://localhost:8788';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    host: true, // expose the dev server on the LAN so phones can reach it
    port: 5173,
    proxy: {
      '/api': API,
      '/photos': API,
    },
  },
});
