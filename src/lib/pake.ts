import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  type AppEntry,
  appFile,
  APPLICATIONS_DIR,
  appVersion,
  DIST_DIR,
  INJECT_DIR,
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
    const pkg: unknown = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'node_modules', 'pake-cli', 'package.json'), 'utf8'),
    )
    if (typeof pkg === 'object' && pkg !== null && 'version' in pkg) {
      return typeof pkg.version === 'string' ? pkg.version : null
    }
    return null
  } catch {
    return null
  }
}

// Pake bundles into a .dmg depending on "targets"; we extract the .app to install it.
function extractFromDmg(dmgPath: string, outDir: string): string {
  const mountPoint = path.join(outDir, '.mnt')
  fs.rmSync(mountPoint, { force: true, recursive: true })
  fs.mkdirSync(mountPoint, { recursive: true })
  if (!run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint])) {
    throw new Error(`could not mount ${dmgPath}`)
  }
  try {
    const found = fs.readdirSync(mountPoint).find((entry) => entry.endsWith('.app'))
    if (!found) {
      throw new Error(`no .app found inside ${dmgPath}`)
    }
    const dest = path.join(outDir, found)
    fs.rmSync(dest, { force: true, recursive: true })
    if (!run('ditto', [path.join(mountPoint, found), dest])) {
      throw new Error(`could not extract ${found} from ${dmgPath}`)
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
  throw new Error(`build finished but no .app found in ${outDir}`)
}

/**
 * The `inject` field of apps/<id>.json names snippets from apps/inject/ and is
 * passed as a flag instead of left in the config: pake resolves the config's
 * relative paths against its cwd, which during the build is dist/<id>/.
 */
export function injectArgs(app: AppEntry, dir: string = INJECT_DIR): string[] {
  const files = app.inject
  if (files === undefined) {
    return []
  }
  if (!isStringArray(files)) {
    throw new Error(`the "inject" field of "${app.id}" must be a list of file names`)
  }
  return files.flatMap((file) => {
    const abs = path.isAbsolute(file) ? file : path.join(dir, file)
    if (!fs.existsSync(abs)) {
      throw new Error(`app "${app.id}" injects "${file}" but ${abs} does not exist`)
    }
    return ['--inject', abs]
  })
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((file) => typeof file === 'string')
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

  const args = [app.url, '--config', appFile(app.id), '--app-version', version, ...injectArgs(app)]
  // --json: logs to stderr, a single JSON result object to stdout (agent mode).
  args.push('--json')
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
    throw new Error(`could not run pake: ${result.error.message}`)
  }

  let parsed: PakeResult
  try {
    const raw: unknown = JSON.parse(result.stdout.trim())
    if (!isPakeResult(raw)) {
      throw new Error('result without pake format')
    }
    parsed = raw
  } catch {
    throw new Error(
      `unexpected pake output for "${app.id}" (exit ${result.status}): ${result.stdout}`,
    )
  }
  if (!parsed.ok) {
    const detail = parsed.error
      ? `${parsed.error.message}${parsed.error.hint ? ` (${parsed.error.hint})` : ''}`
      : 'unknown'
    throw new Error(
      `build of "${app.id}" failed [${parsed.error?.code ?? 'UNEXPECTED'}]: ${detail}`,
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

function isPakeResult(value: unknown): value is PakeResult {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  )
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
    log(`>> ${app.id}: no build for v${version}, building...`)
    bundle = buildApp(app, { debug: options.debug, distDir, log, stateFile })
  }

  const target = path.join(applicationsDir, path.basename(bundle))
  fs.rmSync(target, { force: true, recursive: true })
  if (!run('ditto', [bundle, target])) {
    throw new Error(`could not copy ${bundle} to ${target}`)
  }
  // Just in case the bundle inherits quarantine attributes.
  spawnSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' })
  log(`OK ${app.name} installed at ${target}`)
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
    log(`-- ${app.id}: nothing installed at ${target}`)
    return
  }
  fs.rmSync(target, { force: true, recursive: true })
  log(`OK ${target} removed`)
}
