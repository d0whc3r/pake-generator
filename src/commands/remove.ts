import { Args, Command, Flags } from '@oclif/core'
import fs from 'node:fs'
import path from 'node:path'
import { appFile, DIST_DIR, readApp, readState, writeState } from '../lib/core'
import { uninstallApp } from '../lib/pake'

export default class Remove extends Command {
  static description = 'Remove an app from the registry (and from /Applications with --uninstall)'

  static examples = ['<%= config.bin %> remove telegram --uninstall']

  static args = {
    id: Args.string({ description: 'App ID', required: true }),
  }

  static flags = {
    uninstall: Flags.boolean({
      default: false,
      description: 'Also remove the .app from /Applications',
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
    this.log(`OK app "${app.id}" removed from the registry`)
  }
}
