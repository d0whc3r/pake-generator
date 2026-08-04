import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './core'

export const CHANGELOG_FILE = path.join(ROOT, 'CHANGELOG.md')

const TITLE = '# Changelog'

/** Markdown section for one app release, e.g. `## slack@1.0.12 (2026-08-04)`. */
export function changelogSection(tag: string, notes: string, date: string): string {
  return `## ${tag} (${date})\n\n${notes.trim()}\n`
}

/** Prepends new sections after the title, keeping the previous entries. */
export function prependChangelog(existing: string, sections: string[]): string {
  const body = (existing.startsWith(TITLE) ? existing.slice(TITLE.length) : existing).trim()
  const head = `${TITLE}\n\n${sections.join('\n')}`
  return body === '' ? head : `${head}\n${body}\n`
}

/** Prepends the release sections to CHANGELOG.md. Returns whether it wrote. */
export function updateChangelog(sections: string[], file: string = CHANGELOG_FILE): boolean {
  if (sections.length === 0) {
    return false
  }
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  fs.writeFileSync(file, prependChangelog(existing, sections))
  return true
}
