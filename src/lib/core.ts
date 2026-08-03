import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
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

export function appFile(id: string): string {
  return path.join(APPS_DIR, `${id}.json`)
}

export function listAppIds(): string[] {
  if (!fs.existsSync(APPS_DIR)) {
    return []
  }
  return fs
    .readdirSync(APPS_DIR)
    .filter((entry) => entry.endsWith('.json'))
    .toSorted()
    .map((entry) => path.basename(entry, '.json'))
}

export function readApp(id: string): AppEntry {
  const file = appFile(id)
  if (!fs.existsSync(file)) {
    throw new Error(
      `no existe la app "${id}" en apps/ (usa \`pnpm pake list\` para ver las registradas)`,
    )
  }
  return { id, ...(JSON.parse(fs.readFileSync(file, 'utf8')) as PakeConfig) }
}

export function writeApp(app: AppEntry): void {
  const { id, ...config } = app
  fs.mkdirSync(APPS_DIR, { recursive: true })
  fs.writeFileSync(appFile(id), `${JSON.stringify(config, null, 2)}\n`)
}

export function selectApps(ids: string[]): AppEntry[] {
  if (ids.length > 0) {
    return ids.map(readApp)
  }
  const all = listAppIds()
  if (all.length === 0) {
    throw new Error('no hay apps en apps/; anade una con `pnpm pake add <url> --name "Nombre"`')
  }
  return all.map(readApp)
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

export function readState(): State {
  if (!fs.existsSync(STATE_FILE)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as State
}

export function writeState(state: State): void {
  fs.mkdirSync(DIST_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
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

export function bumpAppVersion(id: string, release: string, log: (msg: string) => void): AppEntry {
  const app = readApp(id)
  const previous = appVersion(app)
  app.appVersion = bumpVersion(previous, release)
  writeApp(app)
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
