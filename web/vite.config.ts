import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Same .env the server reads, so both agree on the port.
  const env = { ...loadEnv(mode, '..', 'CLACK_'), ...process.env };
  const server = `http://127.0.0.1:${env.CLACK_PORT ?? 4317}`;

  return {
    plugins: [svelte()],
    server: {
      // In development the UI is served by Vite and reaches the clack server through this proxy.
      host: true,
      port: 5173,
      proxy: {
        '/api': server,
        '/ws': { target: server, ws: true },
      },
    },
  };
});
