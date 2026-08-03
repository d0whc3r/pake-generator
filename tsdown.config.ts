import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'

type RootPackage = Pick<typeof import('./package.json'), 'name' | 'oclif' | 'version'>

export default defineConfig({
  dts: false,
  entry: ['src/cli.ts', 'src/commands/*.ts'],
  format: 'esm',
  hooks: {
    // oclif sube directorios desde la entry hasta el primer package.json.
    // Este manifiesto hace que el build descubra dist-cli/commands, mientras
    // que en dev (tsx) se sigue usando src/commands del package.json raiz.
    'build:done': () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as RootPackage
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
