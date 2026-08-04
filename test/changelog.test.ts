import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changelogSection, prependChangelog, updateChangelog } from '../src/lib/changelog'

describe('changelogSection', () => {
  it('formats the tag, date and trimmed notes', () => {
    expect(changelogSection('slack@1.0.12', '\n### Bug Fixes\n\n* a fix\n\n', '2026-08-04')).toBe(
      '## slack@1.0.12 (2026-08-04)\n\n### Bug Fixes\n\n* a fix\n',
    )
  })
})

describe('prependChangelog', () => {
  it('creates the file with the title when there is no previous content', () => {
    expect(prependChangelog('', ['## a@1.0.0 (2026-08-04)\n\nnotes\n'])).toBe(
      '# Changelog\n\n## a@1.0.0 (2026-08-04)\n\nnotes\n',
    )
  })

  it('prepends new sections after the title, keeping previous entries', () => {
    const existing = '# Changelog\n\n## a@1.0.0 (2026-08-01)\n\nold notes\n'
    expect(prependChangelog(existing, ['## a@1.1.0 (2026-08-04)\n\nnew notes\n'])).toBe(
      '# Changelog\n\n' +
        '## a@1.1.0 (2026-08-04)\n\nnew notes\n\n' +
        '## a@1.0.0 (2026-08-01)\n\nold notes\n',
    )
  })
})

describe('updateChangelog', () => {
  let dir = ''

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { force: true, recursive: true })
  })

  it('creates the changelog file when missing', () => {
    const file = path.join(dir, 'CHANGELOG.md')
    expect(updateChangelog(['## a@1.0.0 (2026-08-04)\n\nnotes\n'], file)).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe('# Changelog\n\n## a@1.0.0 (2026-08-04)\n\nnotes\n')
  })

  it('does nothing without sections', () => {
    const file = path.join(dir, 'CHANGELOG.md')
    expect(updateChangelog([], file)).toBe(false)
    expect(fs.existsSync(file)).toBe(false)
  })
})
