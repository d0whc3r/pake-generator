import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Repo root. In dev this file lives in src/lib/ and in the tsdown build the
 * code ends up in chunks inside dist-cli/, so we walk up directories until we
 * find the workspace marker instead of using a fixed path.
 */
function findRoot(start: string): string {
  let dir = start
  let parent = path.dirname(dir)
  while (parent !== dir) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    dir = parent
    parent = path.dirname(dir)
  }
  return start
}

export const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)))
export const APPS_DIR = path.join(ROOT, 'apps')
/** Shared snippets that apps reference by name in their `inject` field. */
export const INJECT_DIR = path.join(APPS_DIR, 'inject')
export const DIST_DIR = path.join(ROOT, 'dist')
export const STATE_FILE = path.join(DIST_DIR, 'state.json')
export const APPLICATIONS_DIR = '/Applications'
export const PAKE_SCHEMA =
  'https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json'
export const PAKE_BIN = path.join(ROOT, 'node_modules', '.bin', 'pake')

/** Pake config (tw93/Pake schema) plus our own appVersion field. */
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

export type State = Record<string, BuildState | undefined>

// ---------------------------------------------------------------------------
// App registry (apps/<id>.json)
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
      `app "${id}" does not exist in apps/ (use \`pnpm pake list\` to see the registered ones)`,
    )
  }
  const config: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!isPakeConfig(config)) {
    throw new Error(`app "${id}" is not a valid config (missing "url" or "name")`)
  }
  return { id, ...config }
}

function isPakeConfig(value: unknown): value is PakeConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof value.url === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  )
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
    throw new Error('no apps in apps/; add one with `pnpm pake add <url> --name "Name"`')
  }
  return all.map((id) => readApp(id, dir))
}

/** Comma-separated list of ids (oclif arg); empty/undefined = all of them. */
export function parseIds(arg: string | undefined): string[] {
  return (arg ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Build state (dist/state.json)
// ---------------------------------------------------------------------------

export function readState(file: string = STATE_FILE): State {
  if (!fs.existsSync(file)) {
    return {}
  }
  const state: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!isState(state)) {
    throw new Error(`the state in ${file} does not have the expected format`)
  }
  return state
}

function isBuildState(value: unknown): value is BuildState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    'bundle' in value &&
    typeof value.bundle === 'string' &&
    'builtAt' in value &&
    typeof value.builtAt === 'string'
  )
}

function isState(value: unknown): value is State {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every(isBuildState)
}

export function writeState(state: State, file: string = STATE_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`)
}

// ---------------------------------------------------------------------------
// Utilities
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
      throw new Error(`invalid release: "${release}" (use patch, minor, major or an x.y.z version)`)
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

/** Runs a command inheriting stdio; returns whether it succeeded. */
export function run(cmd: string, args: string[], options: SpawnSyncOptions = {}): boolean {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (result.error) {
    throw new Error(`could not run "${cmd}": ${result.error.message}`)
  }
  return result.status === 0
}
