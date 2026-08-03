import { Args, Command, Flags } from '@oclif/core'
import { parseIds, selectApps } from '../lib/core'
import { buildApp } from '../lib/pake'

export default class Build extends Command {
  static description = 'Build apps into dist/<id>/ (all of them if no ids are given)'

  static examples = ['<%= config.bin %> build', '<%= config.bin %> build telegram,slack']

  static args = {
    apps: Args.string({ description: 'Comma-separated IDs (empty = all)', required: false }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Debug build with verbose output' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Build)
    for (const app of selectApps(parseIds(args.apps))) {
      buildApp(app, { debug: flags.debug, log: (msg) => this.log(msg) })
    }
  }
}
