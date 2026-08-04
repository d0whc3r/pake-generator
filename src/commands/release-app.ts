import { Args, Command, Flags } from '@oclif/core'
import { releaseApp } from '../lib/release'

export default class ReleaseApp extends Command {
  static description = 'Build one app with pake and publish its GitHub release (semantic-release)'

  static examples = ['<%= config.bin %> release-app telegram']

  static args = {
    id: Args.string({ description: 'App ID', required: true }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Debug build with verbose output' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ReleaseApp)
    const result = await releaseApp(args.id, { debug: flags.debug, log: (msg) => this.log(msg) })
    if (result) {
      this.log(`OK ${args.id} v${result.nextRelease.version} released`)
    } else {
      this.log(`-- ${args.id}: nothing to release`)
    }
  }
}
