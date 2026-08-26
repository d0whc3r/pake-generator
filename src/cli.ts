#!/usr/bin/env node
import { execute } from '@oclif/core'

// ponytail: no `development: true` — it sets settings.debug=true and every CLI error prints its stack
await execute({ dir: import.meta.url })
