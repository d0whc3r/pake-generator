import { Args, Command, Flags } from '@oclif/core'
import fs from 'node:fs'
import {
  appFile,
  isValidVersion,
  PAKE_SCHEMA,
  type PakeConfig,
  slugify,
  writeApp,
} from '../lib/core'

export default class Add extends Command {
  static description = 'Registra una app nueva creando apps/<id>.json con la config de Pake'

  static examples = [
    '<%= config.bin %> add https://web.whatsapp.com --name "WhatsApp" --set width=1200 --set hideTitleBar=true',
  ]

  static args = {
    url: Args.string({ description: 'URL de la web a empaquetar', required: true }),
  }

  static flags = {
    id: Flags.string({ description: 'Identificador interno (por defecto, slug del nombre)' }),
    identifier: Flags.string({ description: 'Bundle ID (por defecto com.pake.<slug>)' }),
    name: Flags.string({ description: 'Nombre de la app (pasa a ser el .app)', required: true }),
    set: Flags.string({
      description: 'Opcion de Pake como clave=valor (repetible, p. ej. --set width=1200)',
      multiple: true,
    }),
    version: Flags.string({ default: '1.0.0', description: 'Version inicial (appVersion)' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Add)

    if (!isValidVersion(flags.version)) {
      this.error(`version no valida: "${flags.version}" (usa formato x.y.z)`)
    }

    const config: PakeConfig = {
      $schema: PAKE_SCHEMA,
      appVersion: flags.version,
      identifier: flags.identifier ?? `com.pake.${slugify(flags.name).replace(/-/g, '')}`,
      name: flags.name,
      url: args.url,
    }
    for (const entry of flags.set ?? []) {
      const eq = entry.indexOf('=')
      if (eq === -1) {
        this.error(`--set ${entry} no tiene formato clave=valor`)
      }
      config[entry.slice(0, eq)] = parseValue(entry.slice(eq + 1))
    }

    const id = flags.id ?? slugify(flags.name)
    if (fs.existsSync(appFile(id))) {
      this.error(`ya existe la app "${id}" (${appFile(id)})`)
    }

    writeApp({ id, ...config })
    this.log(`OK app "${config.name}" registrada como apps/${id}.json (v${flags.version})`)
    this.log(`   Siguiente paso: pnpm pake install ${id}`)
  }
}

function parseValue(value: string): unknown {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }
  return value
}
