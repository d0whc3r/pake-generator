import { Args, Command, Flags } from '@oclif/core'
import fs from 'node:fs'
import path from 'node:path'
import { appFile, DIST_DIR, readApp, readState, writeState } from '../lib/core'
import { uninstallApp } from '../lib/pake'

export default class Remove extends Command {
  static description = 'Elimina una app del registro (y de /Applications con --uninstall)'

  static examples = ['<%= config.bin %> remove telegram --uninstall']

  static args = {
    id: Args.string({ description: 'ID de la app', required: true }),
  }

  static flags = {
    uninstall: Flags.boolean({
      default: false,
      description: 'Elimina tambien el .app de /Applications',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Remove)
    const app = readApp(args.id)
    if (flags.uninstall) {
      uninstallApp(app, (msg) => this.log(msg))
    }
    fs.rmSync(appFile(app.id))
    fs.rmSync(path.join(DIST_DIR, app.id), { force: true, recursive: true })
    const state = readState()
    delete state[app.id]
    writeState(state)
    this.log(`OK app "${app.id}" eliminada del registro`)
  }
}
