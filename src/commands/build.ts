import { Args, Command, Flags } from '@oclif/core'
import { parseIds, selectApps } from '../lib/core'
import { buildApp } from '../lib/pake'

export default class Build extends Command {
  static description = 'Compila apps a dist/<id>/ (todas si no se indican ids)'

  static examples = ['<%= config.bin %> build', '<%= config.bin %> build telegram,slack']

  static args = {
    apps: Args.string({ description: 'IDs separados por coma (vacio = todas)', required: false }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Build en modo debug con salida verbose' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Build)
    for (const app of selectApps(parseIds(args.apps))) {
      buildApp(app, { debug: flags.debug, log: (msg) => this.log(msg) })
    }
  }
}
