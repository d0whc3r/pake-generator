import { Args, Command, Flags } from '@oclif/core'
import { parseIds, selectApps } from '../lib/core'
import { installApp } from '../lib/pake'

export default class Install extends Command {
  static description = 'Build if needed and install the .app into /Applications'

  static examples = ['<%= config.bin %> install telegram', '<%= config.bin %> install']

  static args = {
    apps: Args.string({ description: 'Comma-separated IDs (empty = all)', required: false }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Debug build with verbose output' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Install)
    for (const app of selectApps(parseIds(args.apps))) {
      installApp(app, { debug: flags.debug, log: (msg) => this.log(msg) })
    }
  }
}
