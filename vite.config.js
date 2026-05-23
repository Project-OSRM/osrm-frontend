import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.js',
      name: 'osrm',
      fileName: () => 'bundle.js',
      formats: ['umd'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    global: 'globalThis',
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  preview: {
    port: 9000,
  },
  server: {
    port: 9000,
  },
});
