import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:3000',
    },
  },
  build: { outDir: 'dist/client', sourcemap: false },
});
