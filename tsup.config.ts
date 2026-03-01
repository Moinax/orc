import { defineConfig } from 'tsup';

export default defineConfig([
  // Runtime (dual CJS/ESM)
  {
    entry: {
      'runtime/index': 'src/runtime/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['zod'],
  },
  // Generator config helper (dual CJS/ESM)
  {
    entry: {
      'generator/config': 'src/generator/config.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['zod'],
  },
  // CLI (ESM only)
  {
    entry: {
      cli: 'src/cli.ts',
    },
    format: ['esm'],
    banner: {
      js: '#!/usr/bin/env node',
    },
    sourcemap: true,
    external: ['zod'],
  },
]);
