import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './core'

export const README_FILE = path.join(ROOT, 'README.md')

const START = '<!-- releases:start -->'
const END = '<!-- releases:end -->'

export interface ReleaseLink {
  id: string
  version: string
}

/**
 * owner/repo of the GitHub repository, from the `repository` url in
 * package.json — the git remote is an ssh host alias, so it is no help.
 */
export function repoSlug(file: string = path.join(ROOT, 'package.json')): string {
  const match = /github\.com\/(?<slug>[\w.-]+\/[\w.-]+?)(?:\.git)?"/.exec(
    fs.readFileSync(file, 'utf8'),
  )
  if (!match?.groups) {
    throw new Error(`could not read the GitHub repository url from ${file}`)
  }
  return match.groups.slug
}

/** Markdown table with the release page and the asset of every app. */
export function releasesTable(links: ReleaseLink[], repo: string): string {
  const base = `https://github.com/${repo}/releases`
  const rows = links.map(({ id, version }) => {
    const tag = `${id}@${version}`
    const asset = `${id}-v${version}-macos.zip`
    return `| \`${id}\` | [${tag}](${base}/tag/${tag}) | [${asset}](${base}/download/${tag}/${asset}) |`
  })
  return ['| ID | Latest release | Download |', '| --- | --- | --- |', ...rows].join('\n')
}

/** Replaces whatever sits between the release markers with the table. */
export function replaceReleases(existing: string, table: string): string {
  const start = existing.indexOf(START)
  const end = existing.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`the README has no "${START}" / "${END}" markers`)
  }
  return `${existing.slice(0, start)}${START}\n\n${table}\n\n${existing.slice(end)}`
}

/** Rewrites the release table in the README. Returns whether it changed. */
export function updateReadme(
  links: ReleaseLink[],
  file: string = README_FILE,
  repo: string = repoSlug(),
): boolean {
  const existing = fs.readFileSync(file, 'utf8')
  const updated = replaceReleases(existing, releasesTable(links, repo))
  if (updated === existing) {
    return false
  }
  fs.writeFileSync(file, updated)
  return true
}
