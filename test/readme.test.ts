import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { releasesTable, replaceReleases, repoSlug, updateReadme } from '../src/lib/readme'

const TABLE = releasesTable([{ id: 'slack', version: '1.0.15' }], 'owner/repo')

describe('releasesTable', () => {
  it('links the release page and the zip asset of every app', () => {
    expect(TABLE).toBe(
      '| ID | Latest release | Download |\n' +
        '| --- | --- | --- |\n' +
        '| `slack` | [slack@1.0.15](https://github.com/owner/repo/releases/tag/slack@1.0.15) | ' +
        '[slack-v1.0.15-macos.zip](https://github.com/owner/repo/releases/download/slack@1.0.15/slack-v1.0.15-macos.zip) |',
    )
  })

  it('keeps only the header when no app has been released', () => {
    expect(releasesTable([], 'owner/repo')).toBe(
      '| ID | Latest release | Download |\n| --- | --- | --- |',
    )
  })
})

describe('replaceReleases', () => {
  it('replaces the previous table between the markers', () => {
    const existing = '# t\n\n<!-- releases:start -->\n\nold\n\n<!-- releases:end -->\n\ntail\n'
    expect(replaceReleases(existing, 'new')).toBe(
      '# t\n\n<!-- releases:start -->\n\nnew\n\n<!-- releases:end -->\n\ntail\n',
    )
  })

  it('fails when the markers are missing', () => {
    expect(() => replaceReleases('# t\n', 'new')).toThrow(/markers/)
  })
})

describe('updateReadme', () => {
  let dir = ''

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { force: true, recursive: true })
  })

  it('writes the table once and reports no change on a second run', () => {
    const file = path.join(dir, 'README.md')
    fs.writeFileSync(file, '<!-- releases:start -->\n<!-- releases:end -->\n')
    const links = [{ id: 'slack', version: '1.0.15' }]

    expect(updateReadme(links, file, 'owner/repo')).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toContain(TABLE)
    expect(updateReadme(links, file, 'owner/repo')).toBe(false)
  })
})

describe('repoSlug', () => {
  it('reads owner/repo from the repository url of package.json', () => {
    expect(repoSlug()).toBe('d0whc3r/pake-generator')
  })
})
