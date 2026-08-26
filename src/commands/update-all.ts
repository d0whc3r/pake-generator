import { Command, Flags } from '@oclif/core'
import { bumpAppVersion, listAppIds, readApp } from '../lib/core'
import { installApp } from '../lib/pake'

export default class UpdateAll extends Command {
  static description = 'bump + build + install every registered app in a single step'

  static examples = ['<%= config.bin %> update-all', '<%= config.bin %> update-all --release minor']

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Debug build with verbose output' }),
    release: Flags.string({
      default: 'patch',
      description: 'patch | minor | major | explicit x.y.z version',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(UpdateAll)
    const ids = listAppIds()
    if (ids.length === 0) {
      this.log('No apps registered. Add one with:')
      this.log('  pnpm pake add https://example.com --name "Example"')
      return
    }
    for (const id of ids) {
      const app = bumpAppVersion(id, flags.release, (msg) => this.log(msg))
      installApp(readApp(app.id), { debug: flags.debug, log: (msg) => this.log(msg) })
    }
  }
}
