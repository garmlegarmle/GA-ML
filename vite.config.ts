import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = String(env.VITE_API_BASE || 'http://127.0.0.1:8787').trim() || 'http://127.0.0.1:8787';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        holdem: path.resolve(__dirname, 'apps/games/holdem-tournament/src')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
