import { defineConfig } from 'vite';

export default defineConfig({
  // three.js ocupa ~600 kB minificado; es esperado en un juego 3D de una sola página.
  build: { chunkSizeWarningLimit: 900 },
});
