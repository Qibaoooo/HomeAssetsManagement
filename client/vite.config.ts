import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'vite';

const API = 'http://localhost:8787';

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
