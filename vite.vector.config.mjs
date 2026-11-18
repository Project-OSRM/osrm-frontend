import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'osrm-worker-preload',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const worker = Object.keys(bundle).find(fileName => /(^|\/)maplibre-gl-worker-[\w-]+\.js$/.test(fileName));
        if (!worker) this.error('Could not find the built MapLibre worker for index.html.');
        const template = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
        this.emitFile({
          type: 'asset',
          fileName: 'index.html',
          source: template.replace('<!-- maplibre-worker-preload -->',
            `<link rel="preload" href="${worker}" as="script" crossorigin="anonymous" />`),
        });
      },
    },
  }],
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
