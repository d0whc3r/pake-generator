import { analyzeCommits } from '@semantic-release/commit-analyzer'
import {
  publish as githubPublish,
  verifyConditions as githubVerify,
} from '@semantic-release/github'
import { generateNotes } from '@semantic-release/release-notes-generator'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import semanticRelease, {
  type AnalyzeCommitsContext,
  type Commit,
  type GenerateNotesContext,
  type Options,
  type PrepareContext,
  type PublishContext,
  type Result,
  type VerifyConditionsContext,
} from 'semantic-release'
import { CHANGELOG_FILE, changelogSection, updateChangelog } from './changelog'
import { appFile, appVersion, DIST_DIR, listAppIds, readApp, ROOT, run, writeApp } from './core'
import { buildApp } from './pake'

/**
 * Commits touching these paths change the output of every app: the shared
 * inject snippets, the pake-cli patch and pake-cli itself (pinned in
 * package.json / pnpm-lock.yaml). Anything else only matters for the app
 * whose apps/<id>.json changed.
 */
const SHARED_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
const SHARED_PREFIXES = ['apps/inject/', 'patches/']

type PluginConfig = Record<string, unknown>

interface InlinePlugin {
  analyzeCommits?: (config: PluginConfig, context: AnalyzeCommitsContext) => Promise<string | null>
  generateNotes?: (config: PluginConfig, context: GenerateNotesContext) => Promise<string>
  prepare?: (config: PluginConfig, context: PrepareContext) => Promise<void>
  publish?: (config: PluginConfig, context: PublishContext) => Promise<unknown>
  verifyConditions?: (config: PluginConfig, context: VerifyConditionsContext) => Promise<void>
}

export interface DetectedRelease {
  id: string
  notes: string
  type: string
  version: string
}

export interface DetectOptions {
  dry?: boolean
  log?: (msg: string) => void
}

export interface DetectResult {
  releases: DetectedRelease[]
  sha: string
}

export interface ReleaseAppOptions {
  debug?: boolean
  log?: (msg: string) => void
}

export interface ReleaseAsset {
  label: string
  path: string
}

/** Release tag of an app, e.g. slack@1.0.11. */
export function tagFor(id: string, version: string): string {
  return `${id}@${version}`
}

/** Whether a commit touching `files` should trigger a release of app `id`. */
export function commitAffectsApp(id: string, files: string[]): boolean {
  return files.some(
    (file) =>
      file === `apps/${id}.json` ||
      SHARED_FILES.has(file) ||
      SHARED_PREFIXES.some((prefix) => file.startsWith(prefix)),
  )
}

export function commitFiles(hash: string): string[] {
  const out = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', hash])
  return out === '' ? [] : out.split('\n')
}

/** Zips and dmgs left by the build under dist/<id>/, as GitHub release assets. */
export function collectAssets(dir: string): ReleaseAsset[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory() && !entry.name.endsWith('.app')) {
        walk(full)
      } else if (entry.name.endsWith('.zip') || entry.name.endsWith('.dmg')) {
        files.push(full)
      }
    }
  }
  if (fs.existsSync(dir)) {
    walk(dir)
  }
  return files.toSorted().map((file) => ({ label: path.basename(file), path: file }))
}

/**
 * Per-app semantic-release dry-run: which apps need a release and at which
 * version. Bumps apps/<id>.json and prepends the release notes to
 * CHANGELOG.md in a single [skip ci] commit so the matrix jobs build with
 * the version they will publish. The first run of an app has no <id>@* tag
 * yet; one is created at the root commit from the current appVersion so
 * versions continue from the hand-managed ones.
 */
export async function detectReleases(options: DetectOptions = {}): Promise<DetectResult> {
  const { dry = false, log = console.log } = options
  const ids = listAppIds()
  if (!dry) {
    for (const id of ids) {
      ensureSeedTag(id, log)
    }
  }
  const releases = await Promise.all(ids.map((id) => analyzeApp(id, log)))
  const pending = releases.filter((release) => release !== null)
  if (!dry) {
    commitBumps(pending, log)
  }
  return { releases: pending, sha: git(['rev-parse', 'HEAD']) }
}

/**
 * Real semantic-release run for one app: analyzes its commits, builds it with
 * pake in `prepare` and publishes the GitHub release with the zip/dmg assets
 * in `publish`. The tag (<id>@<version>) is created by semantic-release.
 */
export async function releaseApp(id: string, options: ReleaseAppOptions = {}): Promise<Result> {
  const { debug = false, log = console.log } = options
  const plugins = [...analysisPlugins(id), publishPlugin(id, { debug, log })]
  return runSemanticRelease(id, plugins, false)
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.error) {
    throw new Error(`could not run git: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function filterCommits(id: string, commits: readonly Commit[]): Commit[] {
  return commits.filter((commit) => commitAffectsApp(id, commitFiles(commit.hash)))
}

function analysisPlugins(id: string): InlinePlugin[] {
  return [
    {
      analyzeCommits: async (config, context) => {
        const commits = filterCommits(id, context.commits)
        if (commits.length === 0) {
          return null
        }
        return analyzeCommits(config, { ...context, commits })
      },
    },
    {
      generateNotes: async (config, context) =>
        generateNotes(config, { ...context, commits: filterCommits(id, context.commits) }),
    },
  ]
}

async function analyzeApp(id: string, log: (msg: string) => void): Promise<DetectedRelease | null> {
  const result = await runSemanticRelease(id, analysisPlugins(id), true)
  if (!result) {
    log(`-- ${id}: up to date`)
    return null
  }
  const { notes = '', type, version } = result.nextRelease
  log(`>> ${id}: ${type} -> v${version}`)
  return { id, notes, type, version }
}

function publishPlugin(id: string, options: Required<ReleaseAppOptions>): InlinePlugin {
  return {
    prepare: async (_config, context) => {
      const app = readApp(id)
      const version = context.nextRelease.version
      if (appVersion(app) !== version) {
        throw new Error(
          `appVersion of "${id}" (${appVersion(app)}) does not match the release v${version}`,
        )
      }
      const bundle = buildApp(app, { debug: options.debug, log: options.log })
      zipBundle(bundle, path.join(DIST_DIR, id, `${id}-v${version}-macos.zip`))
    },
    publish: async (config, context) =>
      githubPublish({ ...config, assets: collectAssets(path.join(DIST_DIR, id)) }, context),
    verifyConditions: githubVerify,
  }
}

function zipBundle(bundle: string, zip: string): void {
  fs.rmSync(zip, { force: true })
  if (!run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, zip])) {
    throw new Error(`could not zip ${bundle}`)
  }
}

function ensureSeedTag(id: string, log: (msg: string) => void): void {
  if (git(['tag', '--list', `${id}@*`]) !== '') {
    return
  }
  const tag = tagFor(id, appVersion(readApp(id)))
  git(['tag', tag, git(['rev-list', '--max-parents=0', 'HEAD'])])
  git(['push', 'origin', `refs/tags/${tag}`])
  log(`seed tag ${tag} created (no previous release tag for "${id}")`)
}

function commitBumps(releases: DetectedRelease[], log: (msg: string) => void): void {
  const bumped = releases.filter((release) => {
    const app = readApp(release.id)
    if (appVersion(app) === release.version) {
      return false
    }
    app.appVersion = release.version
    writeApp(app)
    return true
  })
  if (bumped.length === 0) {
    return
  }
  const date = new Date().toISOString().slice(0, 10)
  const sections = bumped.map((release) =>
    changelogSection(tagFor(release.id, release.version), release.notes, date),
  )
  const files = bumped.map((release) => appFile(release.id))
  // writeApp serializes with JSON.stringify, which expands the short arrays
  // oxfmt keeps on one line: without this the bump commit lands on main
  // failing `pnpm format:check`, and the commit that fixes the formatting
  // touches apps/<id>.json again, releasing those same apps once more.
  run('pnpm', ['format', ...files], { cwd: ROOT, stdio: 'ignore' })
  if (updateChangelog(sections)) {
    files.push(CHANGELOG_FILE)
  }
  const summary = bumped.map((release) => tagFor(release.id, release.version)).join(', ')
  git(['add', ...files])
  git(['commit', '-m', `chore(release): bump ${summary} [skip ci]`])
  git(['push', 'origin', 'HEAD:main'])
  log(`bumped ${summary}`)
}

async function runSemanticRelease(
  id: string,
  plugins: InlinePlugin[],
  dryRun: boolean,
): Promise<Result> {
  return semanticRelease({
    branches: ['main'],
    ci: !dryRun,
    dryRun,
    // semantic-release resolves inline plugin objects at runtime, but its
    // types only admit module names; the assertion stays confined here.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    plugins: plugins as unknown as Options['plugins'],
    tagFormat: `${id}@\${version}`,
  })
}
