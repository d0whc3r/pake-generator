import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts', 'src/commands/*.ts'],
  format: 'esm',
  outDir: 'dist-cli',
  platform: 'node',
  target: 'node24',
  dts: false,
  sourcemap: false,
})
