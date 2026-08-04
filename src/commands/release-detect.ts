import { Command, Flags } from '@oclif/core'
import fs from 'node:fs'
import { detectReleases } from '../lib/release'

const DESCRIPTION =
  'Detect which apps need a new release (per-app semantic-release, filtered by changed paths)'

export default class ReleaseDetect extends Command {
  static description = DESCRIPTION

  static examples = ['<%= config.bin %> release-detect', '<%= config.bin %> release-detect --dry']

  static flags = {
    dry: Flags.boolean({
      default: false,
      description: 'Only report; do not push seed tags nor the version bump commit',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ReleaseDetect)
    const { releases, sha } = await detectReleases({ dry: flags.dry, log: (msg) => this.log(msg) })
    const matrix = JSON.stringify({ include: releases })
    this.log(releases.length === 0 ? 'no app needs a release' : `matrix: ${matrix}`)
    writeGithubOutput('has', String(releases.length > 0))
    writeGithubOutput('matrix', matrix)
    writeGithubOutput('sha', sha)
  }
}

function writeGithubOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT
  if (file !== undefined && file !== '') {
    fs.appendFileSync(file, `${name}=${value}\n`)
  }
}
