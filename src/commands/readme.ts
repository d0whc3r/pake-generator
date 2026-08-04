import { Command } from '@oclif/core'
import { updateReadme } from '../lib/readme'
import { latestReleases, tagFor } from '../lib/release'

export default class Readme extends Command {
  static description = 'Refresh the release links in the README from the published tags'

  static examples = ['<%= config.bin %> readme']

  async run(): Promise<void> {
    await this.parse(Readme)
    const links = latestReleases()
    const summary = links.map((link) => tagFor(link.id, link.version)).join(', ')
    if (updateReadme(links)) {
      this.log(`OK README release links updated (${summary})`)
    } else {
      this.log('-- README release links already up to date')
    }
  }
}
