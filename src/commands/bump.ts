import { Args, Command } from '@oclif/core'
import { bumpAppVersion } from '../lib/core'

export default class Bump extends Command {
  static description = 'Sube el campo appVersion de apps/<id>.json'

  static examples = [
    '<%= config.bin %> bump telegram',
    '<%= config.bin %> bump telegram minor',
    '<%= config.bin %> bump telegram 2.0.0',
  ]

  static args = {
    id: Args.string({ description: 'ID de la app', required: true }),
    release: Args.string({
      default: 'patch',
      description: 'patch | minor | major | version explicita x.y.z',
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Bump)
    bumpAppVersion(args.id, args.release, (msg) => this.log(msg))
  }
}
