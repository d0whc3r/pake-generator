import { Args, Command } from '@oclif/core'
import { bumpAppVersion } from '../lib/core'

export default class Bump extends Command {
  static description = 'Bump the appVersion field of apps/<id>.json'

  static examples = [
    '<%= config.bin %> bump telegram',
    '<%= config.bin %> bump telegram minor',
    '<%= config.bin %> bump telegram 2.0.0',
  ]

  static args = {
    id: Args.string({ description: 'App ID', required: true }),
    release: Args.string({
      default: 'patch',
      description: 'patch | minor | major | explicit x.y.z version',
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Bump)
    bumpAppVersion(args.id, args.release, (msg) => this.log(msg))
  }
}
