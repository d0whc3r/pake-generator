import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'

type RootPackage = Pick<typeof import('./package.json'), 'name' | 'oclif' | 'version'>

export default defineConfig({
  dts: false,
  entry: ['src/cli.ts', 'src/commands/*.ts'],
  format: 'esm',
  hooks: {
    // oclif walks up directories from the entry to the first package.json.
    // This manifest makes the build discover dist-cli/commands, while in dev
    // (tsx) it keeps using src/commands from the root package.json.
    'build:done': () => {
      const raw: unknown = JSON.parse(fs.readFileSync('package.json', 'utf8'))
      if (!isRootPackage(raw)) {
        throw new Error('package.json does not have the expected format')
      }
      const pkg = raw
      const manifest = {
        name: pkg.name,
        oclif: { ...pkg.oclif, commands: './commands' },
        type: 'module',
        version: pkg.version,
      }
      fs.writeFileSync(
        path.join('dist-cli', 'package.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      )
    },
  },
  outDir: 'dist-cli',
  platform: 'node',
  sourcemap: false,
  target: 'node24',
})

function isRootPackage(value: unknown): value is RootPackage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'oclif' in value &&
    'version' in value
  )
}
