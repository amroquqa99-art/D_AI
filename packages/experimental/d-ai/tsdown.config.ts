import { defineConfig } from 'tsdown'

/** Build the native D_AI Cordis service entry. */
export default defineConfig({ entry: ['lib/types/index.js', 'lib/types/local-intelligence.js', 'lib/types/web-searxng.js', 'lib/types/artifact-store.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false })
