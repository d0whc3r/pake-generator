import { Args, Command, Flags } from '@oclif/core'
import {
  type AppEntry,
  bumpAppVersion,
  parseIds,
  readApp,
  ROOT,
  run,
  selectApps,
} from '../lib/core'
import { buildApp, installApp, pakeCliVersion } from '../lib/pake'

export default class Remake extends Command {
  static description =
    'Update pake-cli to the latest version and rebuild the apps (with a version bump and, optionally, reinstall)'

  static examples = [
    '<%= config.bin %> remake --install',
    '<%= config.bin %> remake telegram --no-upgrade --no-bump',
    '<%= config.bin %> remake --release minor --install',
  ]

  static args = {
    apps: Args.string({ description: 'Comma-separated IDs (empty = all)', required: false }),
  }

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Debug build with verbose output' }),
    install: Flags.boolean({
      default: false,
      description: 'Reinstall the .app bundles into /Applications after building',
    }),
    'no-bump': Flags.boolean({ default: false, description: "Do not bump the apps' appVersion" }),
    'no-upgrade': Flags.boolean({
      default: false,
      description: 'Do not update pake-cli, use the current version',
    }),
    release: Flags.string({
      default: 'patch',
      description: 'appVersion bump type: patch | minor | major',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Remake)

    if (!flags['no-upgrade']) {
      const before = pakeCliVersion()
      this.log('>> updating pake-cli to the latest version...')
      if (!run('pnpm', ['add', '-D', 'pake-cli@latest'], { cwd: ROOT })) {
        this.error('could not update pake-cli')
      }
      const after = pakeCliVersion()
      this.log(
        before === after
          ? `OK pake-cli was already at v${after}`
          : `OK pake-cli: v${before} -> v${after}`,
      )
    }

    const succeeded: string[] = []
    const failed: string[] = []
    for (const app of selectApps(parseIds(args.apps))) {
      try {
        const target: AppEntry = flags['no-bump']
          ? readApp(app.id)
          : bumpAppVersion(app.id, flags.release, (msg) => this.log(msg))
        if (flags.install) {
          installApp(target, { debug: flags.debug, log: (msg) => this.log(msg) })
        } else {
          buildApp(target, { debug: flags.debug, log: (msg) => this.log(msg) })
        }
        succeeded.push(app.id)
      } catch (error) {
        this.warn(`${app.id}: ${error instanceof Error ? error.message : String(error)}`)
        failed.push(app.id)
      }
    }

    this.log(
      `\nSummary: ${succeeded.length} OK${succeeded.length > 0 ? ` (${succeeded.join(', ')})` : ''}`,
    )
    if (failed.length > 0) {
      this.error(`${failed.length} app(s) failed: ${failed.join(', ')}`, { exit: 1 })
    }
  }
}
