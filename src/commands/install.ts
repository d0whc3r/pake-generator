import { Args, Command, Flags } from '@oclif/core'
import { parseIds, selectApps } from '../lib/core'
import { installApp } from '../lib/pake'

export default class Install extends Command {
  static description = 'Compila si hace falta e instala el .app en /Applications'

  static examples = ['<%= config.bin %> install telegram', '<%= config.bin %> install']

  static args = {
    apps: Args.string({ description: 'IDs separados por coma (vacio = todas)', required: false }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Build en modo debug con salida verbose' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Install)
    for (const app of selectApps(parseIds(args.apps))) {
      installApp(app, { debug: flags.debug, log: (msg) => this.log(msg) })
    }
  }
}
