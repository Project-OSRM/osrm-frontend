import { defineConfig } from 'vite';

// gauche-rs locates its WebAssembly module with new URL('./gauche_rs.wasm',
// import.meta.url). That expression does not survive this build: in library
// mode Vite inlines every such asset, growing bundle.js by 2.3 MB of base64,
// and the UMD output has no import.meta to resolve against. The build script
// places the module next to bundle.js instead, and index.js passes that URL to
// init(), so the expression is dead code here: replace it with the same path.
function keepGaucheWasmOutOfBundle() {
  return {
    name: 'osrm-frontend:keep-gauche-wasm-out-of-bundle',
    enforce: 'pre',
    transform(code, id) {
      if (!/gauche-rs[\\/]gauche\.js$/.test(id)) return null;
      const wasmUrlExpression = "new URL('./gauche_rs.wasm', import.meta.url).href";
      if (!code.includes(wasmUrlExpression)) {
        this.error('gauche-rs no longer resolves its .wasm the way this plugin expects');
      }
      return { code: code.replace(wasmUrlExpression, "'gauche_rs.wasm'"), map: null };
    }
  };
}

export default defineConfig({
  plugins: [keepGaucheWasmOutOfBundle()],
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
