import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  minify: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
});
