#!/usr/bin/env node
// CLI para gestionar apps generadas con Pake (https://github.com/tw93/pake).
// El registro son los archivos apps/<id>.json, en formato de config de Pake
// (https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json)
// con un campo extra "appVersion" para la gestion de versiones.
//
// Uso: node scripts/pake.mjs <comando> [args]  (o `pnpm pake <comando>`)

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = path.join(ROOT, 'apps')
const DIST_DIR = path.join(ROOT, 'dist')
const STATE_FILE = path.join(DIST_DIR, 'state.json')
const APPLICATIONS_DIR = '/Applications'
const PAKE_SCHEMA = 'https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json'

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

function appFile(id) {
  return path.join(APPS_DIR, `${id}.json`)
}

function listAppFiles() {
  if (!fs.existsSync(APPS_DIR)) {
    return []
  }
  return fs
    .readdirSync(APPS_DIR)
    .filter((entry) => entry.endsWith('.json'))
    .toSorted()
}

function readApp(id) {
  const file = appFile(id)
  if (!fs.existsSync(file)) {
    fail(`no existe la app "${id}" en apps/ (usa \`pnpm pake list\` para ver las registradas)`)
  }
  return { id, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
}

function writeApp(app) {
  const { id, ...config } = app
  fs.mkdirSync(APPS_DIR, { recursive: true })
  fs.writeFileSync(appFile(id), `${JSON.stringify(config, null, 2)}\n`)
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

function writeState(state) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function fail(message) {
  throw new Error(message)
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function appVersion(app) {
  return app.appVersion ?? '1.0.0'
}

function selectApps(ids) {
  if (ids.length === 0) {
    const files = listAppFiles()
    if (files.length === 0) {
      fail('no hay apps en apps/; anade una con `pnpm pake add <url> --name "Nombre"`')
    }
    return files.map((file) => readApp(path.basename(file, '.json')))
  }
  return ids.map(readApp)
}

function parseArgs(argv) {
  const positional = []
  const flags = {}
  const REPEATABLE = new Set(['set'])
  const addFlag = (key, value) => {
    if (REPEATABLE.has(key) && flags[key] !== undefined) {
      flags[key] = [].concat(flags[key], value)
    } else {
      flags[key] = value
    }
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      addFlag(arg.slice(2, eq), arg.slice(eq + 1))
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      addFlag(arg.slice(2), argv[i + 1])
      i += 1
    } else {
      addFlag(arg.slice(2), true)
    }
  }
  return { flags, positional }
}

function parseSetValue(value) {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }
  return value
}

function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version)
}

function bumpVersion(version, release) {
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
      fail(`release no valido: "${release}" (usa patch, minor, major o una version x.y.z)`)
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (result.error) {
    fail(`no se pudo ejecutar "${cmd}": ${result.error.message}`)
  }
  return result.status === 0
}

// ---------------------------------------------------------------------------
// Build / install
// ---------------------------------------------------------------------------

function locateAppBundle(dir, appName) {
  const exact = path.join(dir, `${appName}.app`)
  if (fs.existsSync(exact)) {
    return exact
  }
  const found = fs.readdirSync(dir).find((entry) => entry.endsWith('.app'))
  return found ? path.join(dir, found) : null
}

// Pake empaqueta en .dmg segun "targets"; extraemos el .app para instalarlo.
function extractFromDmg(dmgPath, outDir) {
  const mountPoint = path.join(outDir, '.mnt')
  fs.rmSync(mountPoint, { force: true, recursive: true })
  fs.mkdirSync(mountPoint, { recursive: true })
  if (!run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint])) {
    fail(`no se pudo montar ${dmgPath}`)
  }
  try {
    const found = fs.readdirSync(mountPoint).find((entry) => entry.endsWith('.app'))
    if (!found) {
      fail(`no se encontro ningun .app dentro de ${dmgPath}`)
    }
    const dest = path.join(outDir, found)
    fs.rmSync(dest, { force: true, recursive: true })
    if (!run('ditto', [path.join(mountPoint, found), dest])) {
      fail(`no se pudo extraer ${found} de ${dmgPath}`)
    }
    return dest
  } finally {
    spawnSync('hdiutil', ['detach', mountPoint, '-quiet'], { stdio: 'ignore' })
    fs.rmSync(mountPoint, { force: true, recursive: true })
  }
}

function locateOrExtractBundle(outDir, appName) {
  const bundle = locateAppBundle(outDir, appName)
  if (bundle) {
    return bundle
  }
  const dmg = fs.readdirSync(outDir).find((entry) => entry.endsWith('.dmg'))
  return dmg ? extractFromDmg(path.join(outDir, dmg), outDir) : null
}

function buildApp(app, { debug = false } = {}) {
  const version = appVersion(app)
  const outDir = path.join(DIST_DIR, app.id)
  fs.rmSync(outDir, { force: true, recursive: true })
  fs.mkdirSync(outDir, { recursive: true })

  const args = [app.url, '--config', appFile(app.id), '--app-version', version]
  if (debug) {
    args.push('--debug')
  }
  console.log(`\n>> ${app.id}: pake ${args.join(' ')}`)
  if (!run('pnpm', ['exec', 'pake', ...args], { cwd: outDir })) {
    fail(`fallo el build de "${app.id}"`)
  }

  const bundle = locateOrExtractBundle(outDir, app.name)
  if (!bundle) {
    fail(`build de "${app.id}" terminado pero no se encontro el .app en ${outDir}`)
  }

  const state = readState()
  state[app.id] = {
    builtAt: new Date().toISOString(),
    bundle: path.basename(bundle),
    version,
  }
  writeState(state)
  console.log(`OK ${app.id} v${version} -> ${bundle}`)
  return bundle
}

function installApp(app, { debug = false } = {}) {
  const version = appVersion(app)
  const state = readState()
  const built = state[app.id]
  const outDir = path.join(DIST_DIR, app.id)
  let bundle = built && built.version === version ? locateOrExtractBundle(outDir, app.name) : null

  if (!bundle) {
    console.log(`>> ${app.id}: no hay build de la v${version}, compilando...`)
    bundle = buildApp(app, { debug })
  }

  const target = path.join(APPLICATIONS_DIR, path.basename(bundle))
  fs.rmSync(target, { force: true, recursive: true })
  if (!run('ditto', [bundle, target])) {
    fail(`no se pudo copiar ${bundle} a ${target}`)
  }
  // Por si acaso el bundle hereda atributos de cuarentena.
  spawnSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' })
  console.log(`OK ${app.name} instalada en ${target}`)
}

function uninstallAppBundle(app) {
  const state = readState()
  const bundleName = state[app.id]?.bundle ?? `${app.name}.app`
  const target = path.join(APPLICATIONS_DIR, bundleName)
  if (!fs.existsSync(target)) {
    console.log(`-- ${app.id}: no hay nada instalado en ${target}`)
    return
  }
  fs.rmSync(target, { force: true, recursive: true })
  console.log(`OK ${target} eliminada`)
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

function cmdList() {
  const files = listAppFiles()
  if (files.length === 0) {
    console.log('No hay apps registradas. Anade una con:')
    console.log('  pnpm pake add https://ejemplo.com --name "Ejemplo"')
    return
  }
  const state = readState()
  console.log(`${'ID'.padEnd(18)} ${'VERSION'.padEnd(9)} ${'BUILD'.padEnd(9)} NOMBRE`)
  for (const file of files) {
    const app = readApp(path.basename(file, '.json'))
    const built = state[app.id]?.version ?? '-'
    console.log(
      `${app.id.padEnd(18)} ${appVersion(app).padEnd(9)} ${built.padEnd(9)} ${app.name} (${app.url})`,
    )
  }
}

function cmdAdd(argv) {
  const { positional, flags } = parseArgs(argv)
  const url = positional[0]
  if (!url) {
    fail(
      'uso: pake add <url> --name "Nombre" [--id id] [--identifier id.bundle] [--set clave=valor ...]',
    )
  }
  if (!flags.name) {
    fail('falta --name "Nombre de la app"')
  }

  const config = {
    $schema: PAKE_SCHEMA,
    appVersion: '1.0.0',
    identifier: String(
      flags.identifier ?? `com.pake.${slugify(String(flags.name)).replace(/-/g, '')}`,
    ),
    name: String(flags.name),
    url,
  }
  for (const entry of [].concat(flags.set ?? [])) {
    const eq = String(entry).indexOf('=')
    if (eq === -1) {
      fail(`--set ${entry} no tiene formato clave=valor`)
    }
    config[String(entry).slice(0, eq)] = parseSetValue(String(entry).slice(eq + 1))
  }

  const id = flags.id ?? slugify(String(flags.name))
  if (fs.existsSync(appFile(id))) {
    fail(`ya existe la app "${id}" (${appFile(id)})`)
  }
  writeApp({ id, ...config })
  console.log(`OK app "${config.name}" registrada como apps/${id}.json (v1.0.0)`)
  console.log(`   Siguiente paso: pnpm pake install ${id}`)
}

function cmdRemove(argv) {
  const { positional, flags } = parseArgs(argv)
  const id = positional[0]
  if (!id) {
    fail('uso: pake remove <id> [--uninstall]')
  }
  const app = readApp(id)
  if (flags.uninstall) {
    uninstallAppBundle(app)
  }
  fs.rmSync(appFile(id))
  fs.rmSync(path.join(DIST_DIR, id), { force: true, recursive: true })
  const state = readState()
  delete state[id]
  writeState(state)
  console.log(`OK app "${id}" eliminada del registro`)
}

function cmdBuild(argv) {
  const { positional, flags } = parseArgs(argv)
  for (const app of selectApps(positional)) {
    buildApp(app, { debug: Boolean(flags.debug) })
  }
}

function cmdInstall(argv) {
  const { positional, flags } = parseArgs(argv)
  for (const app of selectApps(positional)) {
    installApp(app, { debug: Boolean(flags.debug) })
  }
}

function cmdUninstall(argv) {
  const { positional } = parseArgs(argv)
  if (positional.length === 0) {
    fail('uso: pake uninstall <id> [id...]')
  }
  for (const id of positional) {
    uninstallAppBundle(readApp(id))
  }
}

function bumpInRegistry(id, release) {
  const app = readApp(id)
  const previous = appVersion(app)
  app.appVersion = bumpVersion(previous, release)
  writeApp(app)
  console.log(`OK ${id}: v${previous} -> v${app.appVersion}`)
  return app
}

function cmdBump(argv) {
  const { positional } = parseArgs(argv)
  const [id, release = 'patch'] = positional
  if (!id) {
    fail('uso: pake bump <id> [patch|minor|major|x.y.z]')
  }
  bumpInRegistry(id, release)
}

function cmdUpdate(argv) {
  const { positional, flags } = parseArgs(argv)
  if (positional.length === 0) {
    fail('uso: pake update <id> [id...] [--release patch|minor|major]')
  }
  const release = flags.release ?? 'patch'
  for (const id of positional) {
    const app = bumpInRegistry(id, release)
    installApp(app, { debug: Boolean(flags.debug) })
  }
}

function cmdHelp() {
  console.log(`Gestor de apps Pake

Uso: pnpm pake <comando> [args]

Comandos:
  list                              Lista las apps registradas, su version y ultimo build
  add <url> --name "N" [--set k=v]  Crea apps/<id>.json con la config de Pake
  remove <id> [--uninstall]         Elimina una app del registro (y de /Applications con --uninstall)
  build [id...] [--debug]           Compila apps (todas si no se indica id) a dist/<id>/
  install [id...]                   Compila si hace falta e instala el .app en /Applications
  uninstall <id...>                 Elimina los .app de /Applications
  bump <id> [patch|minor|major]     Sube el campo appVersion de apps/<id>.json
  update <id...> [--release r]      bump + build + install en un solo paso
  help                              Muestra esta ayuda

Las apps se definen en apps/<id>.json siguiendo el schema de Pake:
  ${PAKE_SCHEMA}
Mas el campo propio "appVersion" (x.y.z) que gestiona este repo.`)
}

const commands = {
  add: cmdAdd,
  build: cmdBuild,
  bump: cmdBump,
  help: cmdHelp,
  install: cmdInstall,
  list: cmdList,
  remove: cmdRemove,
  uninstall: cmdUninstall,
  update: cmdUpdate,
}

const [command = 'help', ...rest] = process.argv.slice(2)
try {
  ;(commands[command] ?? cmdHelp)(rest)
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
