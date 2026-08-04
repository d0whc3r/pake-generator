# Contributing

Two kinds of change land here, and they need different care:

- **App changes** — a new `apps/<id>.json`, a tweak to an existing one, or an
  injected snippet. These publish a release for the affected app(s).
- **Tooling changes** — the CLI in `src/`, tests, the pipeline, the pake-cli
  patch. A shared change republishes _every_ app.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching `src/`, and
[docs/RELEASES.md](docs/RELEASES.md) before touching versions or the pipeline.

## Setup

```sh
nvm use                # Node from .nvmrc (>= 24)
pnpm install           # also applies the pake-cli patch
pnpm test
```

Rust and the Xcode Command Line Tools are only needed to build an actual `.app`;
tests and type-checks run without them.

## Quality gates

The same commands CI runs, in the same order:

```sh
pnpm lint              # oxlint
pnpm format:check      # oxfmt
pnpm type-check        # tsc --noEmit
pnpm test              # vitest
pnpm build             # tsdown -> dist-cli/
```

Shortcuts while iterating:

```sh
pnpm lint:fix
pnpm format:fix        # lint --fix-suggestions + oxfmt
pnpm test:coverage
```

Run the CLI from source with `pnpm pake <command>`; `pnpm pake:built` runs the
tsdown output in `dist-cli/` instead.

## Commits

Conventional commits, because they drive releases — the type of the commit is
the version bump, and the files it touches decide which apps get released:

```
fix(slack): warm up the microphone before opening a huddle
feat(notion): open login popups as redirects
chore: bump oxlint
```

| Type              | Effect        |
| ----------------- | ------------- |
| `fix:`            | patch release |
| `feat:`           | minor release |
| `BREAKING CHANGE` | major release |
| anything else     | no release    |

A commit touching `apps/<id>.json` releases that app. A commit touching
`apps/inject/`, `patches/`, `package.json`, `pnpm-lock.yaml` or
`pnpm-workspace.yaml` releases every app, since those change every build's
output. Keep unrelated changes in separate commits so you don't rebuild the
whole registry for a typo.

Don't bump `appVersion` by hand in a PR — the pipeline does it on `main`.

## Pull requests

CI runs the quality gates plus `pnpm pake release-detect --dry`, which reports
what _would_ be released without pushing tags or a bump commit. Nothing is ever
published from a PR.

Before opening one:

- `pnpm format:fix && pnpm lint && pnpm type-check && pnpm test`
- If you changed build or install behaviour, prove it on a real app:
  `pnpm pake install <id>` and open the `.app`.
- If you changed an app's JSON, say in the PR what you verified in the running
  app (login, notifications, mic, drag & drop — whatever the change touches).

## Adding an app

1. `pnpm pake add <url> --name "Name" --set width=... --set height=...`
2. Add the login provider to `safeDomain` if the site uses OAuth, otherwise the
   login navigates out of the app.
3. `pnpm pake install <id>` and check the flows you care about.
4. Commit `apps/<id>.json` as `feat(<id>): add <Name>`.

## Injected snippets

Snippets live in `apps/inject/` and are shared, so treat them as public API of
the registry: a change there rebuilds and republishes every app that lists them.

- One concern per file, named after what it does.
- Start the file with a comment explaining _why_ it is needed — the WebKit or
  Pake behaviour being worked around, not what the code does.
- Reference it by file name in an app's `inject` list; never by path.
- Diagnostics (`huddle-debug.js`) are temporary. Remove them from `inject` lists
  before merging.

## Tests

`test/` mirrors `src/lib/` and the commands. Vitest, no globals config beyond
`vitest.config.ts`. Filesystem-touching helpers take `dir` / `stateFile` /
`distDir` options precisely so tests can point them at a temp dir — use those
instead of mocking `node:fs`.

Anything that shells out to `pake`, `hdiutil` or `ditto` is not covered by
tests; verify those by building an app for real.
