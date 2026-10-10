import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:3000',
      '/api': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  build: { outDir: 'dist/client', sourcemap: false },
});
