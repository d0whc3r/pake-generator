import { Args, Command, Flags } from '@oclif/core';

import { type AppEntry, bumpAppVersion, parseIds, readApp, ROOT, run, selectApps } from '../lib/core';
import { buildApp, installApp, pakeCliVersion } from '../lib/pake';

export default class Remake extends Command {
  static description =
    'Actualiza pake-cli a la ultima version y regenera las apps (con bump de version y, opcionalmente, reinstalacion)';

  static examples = [
    '<%= config.bin %> remake --install',
    '<%= config.bin %> remake telegram --no-upgrade --no-bump',
    '<%= config.bin %> remake --release minor --install',
  ];

  static args = {
    apps: Args.string({ description: 'IDs separados por coma (vacio = todas)', required: false }),
  };

  static flags = {
    debug: Flags.boolean({ default: false, description: 'Build en modo debug con salida verbose' }),
    install: Flags.boolean({ default: false, description: 'Reinstala los .app en /Applications tras compilar' }),
    'no-bump': Flags.boolean({ default: false, description: 'No subir appVersion de las apps' }),
    'no-upgrade': Flags.boolean({ default: false, description: 'No actualizar pake-cli, usar la version actual' }),
    release: Flags.string({ default: 'patch', description: 'Tipo de bump de appVersion: patch | minor | major' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Remake);

    if (!flags['no-upgrade']) {
      const before = pakeCliVersion();
      this.log('>> actualizando pake-cli a la ultima version...');
      if (!run('pnpm', ['add', '-D', 'pake-cli@latest'], { cwd: ROOT })) {
        this.error('no se pudo actualizar pake-cli');
      }
      const after = pakeCliVersion();
      this.log(before === after ? `OK pake-cli ya estaba en v${after}` : `OK pake-cli: v${before} -> v${after}`);
    }

    const succeeded: string[] = [];
    const failed: string[] = [];
    for (const app of selectApps(parseIds(args.apps))) {
      try {
        const target: AppEntry = flags['no-bump']
          ? readApp(app.id)
          : bumpAppVersion(app.id, flags.release, (msg) => this.log(msg));
        if (flags.install) {
          installApp(target, { debug: flags.debug, log: (msg) => this.log(msg) });
        } else {
          buildApp(target, { debug: flags.debug, log: (msg) => this.log(msg) });
        }
        succeeded.push(app.id);
      } catch (error) {
        this.warn(`${app.id}: ${error instanceof Error ? error.message : String(error)}`);
        failed.push(app.id);
      }
    }

    this.log(`\nResumen: ${succeeded.length} OK${succeeded.length > 0 ? ` (${succeeded.join(', ')})` : ''}`);
    if (failed.length > 0) {
      this.error(`fallaron ${failed.length} app(s): ${failed.join(', ')}`, { exit: 1 });
    }
  }
}
