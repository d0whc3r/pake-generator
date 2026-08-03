import { Args, Command } from '@oclif/core'
import { parseIds, selectApps } from '../lib/core'
import { uninstallApp } from '../lib/pake'

export default class Uninstall extends Command {
  static description = 'Remove the .app bundles from /Applications'

  static examples = ['<%= config.bin %> uninstall telegram,slack']

  static args = {
    apps: Args.string({ description: 'Comma-separated IDs', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Uninstall)
    const ids = parseIds(args.apps)
    if (ids.length === 0) {
      this.error('give at least one id: uninstall telegram,slack')
    }
    for (const app of selectApps(ids)) {
      uninstallApp(app, (msg) => this.log(msg))
    }
  }
}
