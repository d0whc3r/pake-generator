import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectAssets, commitAffectsApp, tagFor } from '../src/lib/release'

describe('tagFor', () => {
  it('builds the per-app release tag', () => {
    expect(tagFor('slack', '1.0.11')).toBe('slack@1.0.11')
  })
})

describe('commitAffectsApp', () => {
  it('matches the app config file', () => {
    expect(commitAffectsApp('slack', ['apps/slack.json'])).toBe(true)
    expect(commitAffectsApp('slack', ['README.md', 'apps/slack.json'])).toBe(true)
  })

  it('does not match other apps config files', () => {
    expect(commitAffectsApp('slack', ['apps/telegram.json'])).toBe(false)
  })

  it('matches shared inject snippets and the pake-cli patch', () => {
    expect(commitAffectsApp('slack', ['apps/inject/popup-to-redirect.js'])).toBe(true)
    expect(commitAffectsApp('slack', ['patches/pake-cli@3.15.5.patch'])).toBe(true)
  })

  it('matches the dependency manifests that pin pake-cli', () => {
    expect(commitAffectsApp('slack', ['package.json'])).toBe(true)
    expect(commitAffectsApp('slack', ['pnpm-lock.yaml'])).toBe(true)
  })

  it('ignores code, tests and docs that do not change app output', () => {
    expect(commitAffectsApp('slack', ['src/lib/core.ts'])).toBe(false)
    expect(commitAffectsApp('slack', ['test/core.test.ts'])).toBe(false)
    expect(commitAffectsApp('slack', ['.github/workflows/pipeline.yml'])).toBe(false)
  })
})

describe('collectAssets', () => {
  let dir = ''

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-assets-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { force: true, recursive: true })
  })

  it('finds zips and dmgs recursively, sorted, with their basename as label', () => {
    const nested = path.join(dir, 'bundle', 'dmg')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(dir, 'slack-v1.0.11-macos.zip'), 'zip')
    fs.writeFileSync(path.join(nested, 'Slack_1.0.11_aarch64.dmg'), 'dmg')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'nope')

    expect(collectAssets(dir)).toEqual([
      { label: 'Slack_1.0.11_aarch64.dmg', path: path.join(nested, 'Slack_1.0.11_aarch64.dmg') },
      { label: 'slack-v1.0.11-macos.zip', path: path.join(dir, 'slack-v1.0.11-macos.zip') },
    ])
  })

  it('does not descend into .app bundles', () => {
    const app = path.join(dir, 'Slack.app', 'Contents')
    fs.mkdirSync(app, { recursive: true })
    fs.writeFileSync(path.join(app, 'stray.zip'), 'zip')

    expect(collectAssets(dir)).toEqual([])
  })

  it('returns an empty list when the directory does not exist', () => {
    expect(collectAssets(path.join(dir, 'missing'))).toEqual([])
  })
})
