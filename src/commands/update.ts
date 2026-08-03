import { Args, Command, Flags } from '@oclif/core'
import { bumpAppVersion, parseIds, readApp } from '../lib/core'
import { installApp } from '../lib/pake'

export default class Update extends Command {
  static description = 'bump + build + install en un solo paso'

  static examples = [
    '<%= config.bin %> update telegram',
    '<%= config.bin %> update slack --release minor',
  ]

  static args = {
    apps: Args.string({ description: 'IDs separados por coma', required: true }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Build en modo debug con salida verbose' }),
    release: Flags.string({
      default: 'patch',
      description: 'patch | minor | major | version explicita x.y.z',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Update)
    const ids = parseIds(args.apps)
    if (ids.length === 0) {
      this.error('indica al menos un id: update telegram,slack')
    }
    for (const id of ids) {
      const app = bumpAppVersion(id, flags.release, (msg) => this.log(msg))
      installApp(readApp(app.id), { debug: flags.debug, log: (msg) => this.log(msg) })
    }
  }
}
