import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 1420,
    strictPort: true
  }
});