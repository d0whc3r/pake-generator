import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  type AppEntry,
  appFile,
  APPLICATIONS_DIR,
  appVersion,
  DIST_DIR,
  PAKE_BIN,
  readState,
  ROOT,
  run,
  STATE_FILE,
  writeState,
} from './core'

interface PakeResult {
  ok: boolean
  outputs?: { path: string; format: string }[]
  warnings?: unknown[]
  error?: { code: string; message: string; hint?: string } | null
}

export function pakeCliVersion(): string | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'node_modules', 'pake-cli', 'package.json'), 'utf8'),
    )
    return pkg.version as string
  } catch {
    return null
  }
}

// Pake empaqueta en .dmg segun "targets"; extraemos el .app para instalarlo.
function extractFromDmg(dmgPath: string, outDir: string): string {
  const mountPoint = path.join(outDir, '.mnt')
  fs.rmSync(mountPoint, { force: true, recursive: true })
  fs.mkdirSync(mountPoint, { recursive: true })
  if (!run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint])) {
    throw new Error(`no se pudo montar ${dmgPath}`)
  }
  try {
    const found = fs.readdirSync(mountPoint).find((entry) => entry.endsWith('.app'))
    if (!found) {
      throw new Error(`no se encontro ningun .app dentro de ${dmgPath}`)
    }
    const dest = path.join(outDir, found)
    fs.rmSync(dest, { force: true, recursive: true })
    if (!run('ditto', [path.join(mountPoint, found), dest])) {
      throw new Error(`no se pudo extraer ${found} de ${dmgPath}`)
    }
    return dest
  } finally {
    spawnSync('hdiutil', ['detach', mountPoint, '-quiet'], { stdio: 'ignore' })
    fs.rmSync(mountPoint, { force: true, recursive: true })
  }
}

export function resolveBundle(outDir: string, outputs: { path: string; format: string }[]): string {
  const direct = outputs.find((output) => output.path.endsWith('.app'))
  if (direct) {
    return direct.path
  }
  const dmg = outputs.find((output) => output.path.endsWith('.dmg'))
  if (dmg) {
    return extractFromDmg(dmg.path, outDir)
  }
  const found = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).find((entry) => entry.endsWith('.app'))
    : undefined
  if (found) {
    return path.join(outDir, found)
  }
  throw new Error(`build terminado pero no se encontro ningun .app en ${outDir}`)
}

export interface BuildOptions {
  debug?: boolean
  distDir?: string
  log?: (msg: string) => void
  stateFile?: string
}

export function buildApp(app: AppEntry, options: BuildOptions = {}): string {
  const { debug = false, distDir = DIST_DIR, log = console.log, stateFile = STATE_FILE } = options
  const version = appVersion(app)
  const outDir = path.join(distDir, app.id)
  fs.rmSync(outDir, { force: true, recursive: true })
  fs.mkdirSync(outDir, { recursive: true })

  // --json: logs a stderr, un unico JSON con el resultado a stdout (agent mode).
  const args = [app.url, '--config', appFile(app.id), '--app-version', version, '--json']
  if (debug) {
    args.push('--debug')
  }
  log(`\n>> ${app.id}: pake ${args.slice(0, -1).join(' ')}`)
  const result = spawnSync(PAKE_BIN, args, {
    cwd: outDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) {
    throw new Error(`no se pudo ejecutar pake: ${result.error.message}`)
  }

  let parsed: PakeResult
  try {
    parsed = JSON.parse(result.stdout.trim()) as PakeResult
  } catch {
    throw new Error(
      `salida inesperada de pake para "${app.id}" (exit ${result.status}): ${result.stdout}`,
    )
  }
  if (!parsed.ok) {
    const detail = parsed.error
      ? `${parsed.error.message}${parsed.error.hint ? ` (${parsed.error.hint})` : ''}`
      : 'desconocido'
    throw new Error(
      `fallo el build de "${app.id}" [${parsed.error?.code ?? 'UNEXPECTED'}]: ${detail}`,
    )
  }

  const bundle = resolveBundle(outDir, parsed.outputs ?? [])
  const state = readState(stateFile)
  state[app.id] = {
    builtAt: new Date().toISOString(),
    bundle: path.basename(bundle),
    version,
  }
  writeState(state, stateFile)
  log(`OK ${app.id} v${version} -> ${bundle}`)
  return bundle
}

export interface InstallOptions extends BuildOptions {
  applicationsDir?: string
}

export function installApp(app: AppEntry, options: InstallOptions = {}): void {
  const log = options.log ?? console.log
  const applicationsDir = options.applicationsDir ?? APPLICATIONS_DIR
  const distDir = options.distDir ?? DIST_DIR
  const stateFile = options.stateFile ?? STATE_FILE
  const version = appVersion(app)
  const state = readState(stateFile)
  const built = state[app.id]
  const outDir = path.join(distDir, app.id)

  let bundle: string | null = null
  if (built && built.version === version) {
    const candidate = path.join(outDir, built.bundle)
    if (fs.existsSync(candidate)) {
      bundle = candidate
    }
  }
  if (!bundle) {
    log(`>> ${app.id}: no hay build de la v${version}, compilando...`)
    bundle = buildApp(app, { debug: options.debug, distDir, log, stateFile })
  }

  const target = path.join(applicationsDir, path.basename(bundle))
  fs.rmSync(target, { force: true, recursive: true })
  if (!run('ditto', [bundle, target])) {
    throw new Error(`no se pudo copiar ${bundle} a ${target}`)
  }
  // Por si acaso el bundle hereda atributos de cuarentena.
  spawnSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' })
  log(`OK ${app.name} instalada en ${target}`)
}

export function uninstallApp(
  app: AppEntry,
  log: (msg: string) => void = console.log,
  options: { applicationsDir?: string; stateFile?: string } = {},
): void {
  const applicationsDir = options.applicationsDir ?? APPLICATIONS_DIR
  const state = readState(options.stateFile ?? STATE_FILE)
  const bundleName = state[app.id]?.bundle ?? `${app.name}.app`
  const target = path.join(applicationsDir, bundleName)
  if (!fs.existsSync(target)) {
    log(`-- ${app.id}: no hay nada instalado en ${target}`)
    return
  }
  fs.rmSync(target, { force: true, recursive: true })
  log(`OK ${target} eliminada`)
}
