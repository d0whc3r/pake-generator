import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Raiz del repo. En dev este archivo vive en src/lib/ y en el build de tsdown
 * el codigo acaba en chunks dentro de dist-cli/, asi que subimos directorios
 * hasta encontrar el marcador del workspace en vez de usar una ruta fija.
 */
function findRoot(start: string): string {
  let dir = start
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return start
    }
    dir = parent
  }
}

export const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)))
export const APPS_DIR = path.join(ROOT, 'apps')
export const DIST_DIR = path.join(ROOT, 'dist')
export const STATE_FILE = path.join(DIST_DIR, 'state.json')
export const APPLICATIONS_DIR = '/Applications'
export const PAKE_SCHEMA =
  'https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json'
export const PAKE_BIN = path.join(ROOT, 'node_modules', '.bin', 'pake')

/** Config de Pake (schema de tw93/Pake) mas el campo propio appVersion. */
export interface PakeConfig {
  $schema?: string
  appVersion?: string
  url: string
  name: string
  identifier?: string
  [option: string]: unknown
}

export interface AppEntry extends PakeConfig {
  id: string
}

export interface BuildState {
  version: string
  bundle: string
  builtAt: string
}

export type State = Record<string, BuildState>

// ---------------------------------------------------------------------------
// Registro de apps (apps/<id>.json)
// ---------------------------------------------------------------------------

export function appFile(id: string, dir: string = APPS_DIR): string {
  return path.join(dir, `${id}.json`)
}

export function listAppIds(dir: string = APPS_DIR): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .toSorted()
    .map((entry) => path.basename(entry, '.json'))
}

export function readApp(id: string, dir: string = APPS_DIR): AppEntry {
  const file = appFile(id, dir)
  if (!fs.existsSync(file)) {
    throw new Error(
      `no existe la app "${id}" en apps/ (usa \`pnpm pake list\` para ver las registradas)`,
    )
  }
  return { id, ...(JSON.parse(fs.readFileSync(file, 'utf8')) as PakeConfig) }
}

export function writeApp(app: AppEntry, dir: string = APPS_DIR): void {
  const { id, ...config } = app
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(appFile(id, dir), `${JSON.stringify(config, null, 2)}\n`)
}

export function selectApps(ids: string[], dir: string = APPS_DIR): AppEntry[] {
  if (ids.length > 0) {
    return ids.map((id) => readApp(id, dir))
  }
  const all = listAppIds(dir)
  if (all.length === 0) {
    throw new Error('no hay apps en apps/; anade una con `pnpm pake add <url> --name "Nombre"`')
  }
  return all.map((id) => readApp(id, dir))
}

/** Lista de ids separados por coma (arg de oclif); vacio/undefined = todas. */
export function parseIds(arg: string | undefined): string[] {
  return (arg ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Estado de builds (dist/state.json)
// ---------------------------------------------------------------------------

export function readState(file: string = STATE_FILE): State {
  if (!fs.existsSync(file)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as State
}

export function writeState(state: State, file: string = STATE_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`)
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function appVersion(app: PakeConfig): string {
  return app.appVersion ?? '1.0.0'
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}

export type Release = 'major' | 'minor' | 'patch'

export function bumpVersion(version: string, release: string): string {
  if (isValidVersion(release)) {
    return release
  }
  const [major, minor, patch] = version.split('.').map(Number)
  switch (release) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(
        `release no valido: "${release}" (usa patch, minor, major o una version x.y.z)`,
      )
  }
}

export function bumpAppVersion(
  id: string,
  release: string,
  log: (msg: string) => void,
  dir: string = APPS_DIR,
): AppEntry {
  const app = readApp(id, dir)
  const previous = appVersion(app)
  app.appVersion = bumpVersion(previous, release)
  writeApp(app, dir)
  log(`OK ${id}: v${previous} -> v${app.appVersion}`)
  return app
}

/** Ejecuta un comando heredando stdio; devuelve si termino con exito. */
export function run(cmd: string, args: string[], options: SpawnSyncOptions = {}): boolean {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (result.error) {
    throw new Error(`no se pudo ejecutar "${cmd}": ${result.error.message}`)
  }
  return result.status === 0
}
