import { Command } from '@oclif/core'
import { appVersion, listAppIds, readApp, readState } from '../lib/core'

export default class List extends Command {
  static description = 'List the registered apps, their version and last build'

  static examples = ['<%= config.bin %> list']

  async run(): Promise<void> {
    await this.parse(List)
    const ids = listAppIds()
    if (ids.length === 0) {
      this.log('No apps registered. Add one with:')
      this.log('  pnpm pake add https://example.com --name "Example"')
      return
    }
    const state = readState()
    this.log(`${'ID'.padEnd(18)} ${'VERSION'.padEnd(9)} ${'BUILD'.padEnd(9)} NAME`)
    for (const id of ids) {
      const app = readApp(id)
      const built = state[id]?.version ?? '-'
      this.log(
        `${id.padEnd(18)} ${appVersion(app).padEnd(9)} ${built.padEnd(9)} ${app.name} (${app.url})`,
      )
    }
  }
}
