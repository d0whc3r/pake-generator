import { Args, Command } from '@oclif/core'
import { parseIds, selectApps } from '../lib/core'
import { uninstallApp } from '../lib/pake'

export default class Uninstall extends Command {
  static description = 'Elimina los .app de /Applications'

  static examples = ['<%= config.bin %> uninstall telegram,slack']

  static args = {
    apps: Args.string({ description: 'IDs separados por coma', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Uninstall)
    const ids = parseIds(args.apps)
    if (ids.length === 0) {
      this.error('indica al menos un id: uninstall telegram,slack')
    }
    for (const app of selectApps(ids)) {
      uninstallApp(app, (msg) => this.log(msg))
    }
  }
}
