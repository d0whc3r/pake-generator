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
  static description = 'Register a new app by creating apps/<id>.json with the Pake config'

  static examples = [
    '<%= config.bin %> add https://web.whatsapp.com --name "WhatsApp" --set width=1200 --set hideTitleBar=true',
  ]

  static args = {
    url: Args.string({ description: 'URL of the website to package', required: true }),
  }

  static flags = {
    id: Flags.string({ description: 'Internal identifier (defaults to the slug of the name)' }),
    identifier: Flags.string({ description: 'Bundle ID (defaults to com.pake.<slug>)' }),
    name: Flags.string({ description: 'App name (becomes the .app name)', required: true }),
    set: Flags.string({
      description: 'Pake option as key=value (repeatable, e.g. --set width=1200)',
      multiple: true,
    }),
    version: Flags.string({ default: '1.0.0', description: 'Initial version (appVersion)' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Add)

    if (!isValidVersion(flags.version)) {
      this.error(`invalid version: "${flags.version}" (use the x.y.z format)`)
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
        this.error(`--set ${entry} is not in key=value format`)
      }
      config[entry.slice(0, eq)] = parseValue(entry.slice(eq + 1))
    }

    const id = flags.id ?? slugify(flags.name)
    if (fs.existsSync(appFile(id))) {
      this.error(`app "${id}" already exists (${appFile(id)})`)
    }

    writeApp({ id, ...config })
    this.log(`OK app "${config.name}" registered as apps/${id}.json (v${flags.version})`)
    this.log(`   Next step: pnpm pake install ${id}`)
  }
}

export function parseValue(value: string): unknown {
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
