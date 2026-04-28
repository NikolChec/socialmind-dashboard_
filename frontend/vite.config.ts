import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the production build works both when served by an HTTP server
  // and when loaded directly from disk (file://) inside Electron.
  base: './',
  resolve: {
    alias: {
      '@socialmind/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,            // listen on all interfaces (needed for ngrok, tunnels, LAN)
    allowedHosts: true,    // accept any Host header (ngrok tunnel uses a random subdomain)
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
