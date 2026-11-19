import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: { leaflet: fileURLToPath(new URL('./src/vector_leaflet_bridge.js', import.meta.url)) },
  },
  build: {
    lib: {
      entry: './src/vector_runtime.js',
      name: 'OSRMVector',
      fileName: () => 'vector.js',
      cssFileName: 'vector',
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
  },
});
