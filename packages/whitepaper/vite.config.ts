import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/molt-in-the-mist/',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  publicDir: '../public',
  resolve: {
    alias: {
      '@content': resolve(__dirname, '../../'),
    },
  },
});
