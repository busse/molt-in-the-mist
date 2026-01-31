import { defineConfig } from 'vite';

export default defineConfig({
  base: '/molt-in-the-mist/',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  publicDir: '../public',
});
