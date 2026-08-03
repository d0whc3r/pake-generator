#!/usr/bin/env node
import { execute } from '@oclif/core'

// In dev (`pnpm pake`, via tsx) the URL points to the .ts; in the build it is .js.
const development = import.meta.url.endsWith('.ts')

await execute({ development, dir: import.meta.url })
