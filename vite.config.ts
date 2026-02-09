import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron file protocol
  root: resolve(__dirname, 'src/renderer'), // Set root to where index.html will be
  publicDir: resolve(__dirname, 'public'), // If we have public assets
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  }
});
