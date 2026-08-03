#!/usr/bin/env node
import { execute } from '@oclif/core'

// En dev (`pnpm pake`, via tsx) la URL apunta al .ts; en el build es .js.
const development = import.meta.url.endsWith('.ts')

await execute({ development, dir: import.meta.url })
