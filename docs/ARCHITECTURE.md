# Architecture

The repo is a registry of app configs plus a small oclif CLI that drives
`pake-cli`. There is no runtime and no server: every command is a local build or
a file edit.

## Layout

```
apps/                 registry: one <id>.json per app
apps/inject/          JS/CSS snippets shared between apps
src/cli.ts            oclif entry point
src/commands/         one file per command (add, build, install, ...)
src/lib/core.ts       registry, state, versions, process helpers
src/lib/pake.ts       pake-cli invocation, bundle resolution, install/uninstall
src/lib/release.ts    semantic-release wiring (detection and publishing)
src/lib/changelog.ts  CHANGELOG.md sections
test/                 vitest, mirrors src/lib and the commands
patches/              pake-cli patch applied by pnpm on install
dist/                 build output, git-ignored
dist-cli/             tsdown output of the CLI
```

`ROOT` is found by walking up until `pnpm-workspace.yaml` appears, so the same
code works from `src/` in dev and from a bundled chunk in `dist-cli/`.

## The registry

An app is `apps/<id>.json`: a Pake config (the `$schema` in the file points at
the upstream schema) plus `appVersion`, which is this repo's own field.

- The **id** is the file name — it's what every command takes.
- The **id is not the bundle name**; the `.app` is named after `name`.
- Ids are enumerated by listing `apps/*.json`, so adding a file is enough to
  register an app.

`writeApp()` serializes with `JSON.stringify(..., 2)`, which expands the short
arrays oxfmt keeps on one line. Anything writing a registry file in CI has to run
`pnpm format` on it afterwards — the release step does, and skipping it caused a
release loop: the bump commit failed `format:check`, and the commit fixing the
formatting touched `apps/<id>.json` again, releasing those apps a second time.

## Injected snippets

An app lists snippets by name:

```json
"inject": ["popup-to-redirect.js"]
```

`injectArgs()` resolves each name against `apps/inject/`, fails loudly if the
file is missing, and passes them to pake as `--inject <abs>` flags **instead of
leaving them in the config**. That is deliberate: pake resolves relative paths in
the config against its cwd, and the cwd during a build is `dist/<id>/`, where
the snippets don't exist.

Current snippets and the behaviour they work around:

| Snippet                | Why it exists                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `popup-to-redirect.js` | With `newWindow: false`, Pake's `window.open` only navigates the popup URL in place. That breaks sites that open an intermediate page which then redirects (Notion's OAuth). The snippet turns those into full-page navigation. |
| `microphone-warmup.js` | WebKit keeps the device list empty until capture has been granted once, and Slack gives up before opening a huddle. Granting and releasing the mic on load makes the devices visible.                                           |
| `huddle-debug.js`      | Temporary on-screen log of `window.open` / `getUserMedia` / page errors, for debugging without devtools.                                                                                                                        |

## Build

`buildApp()`:

1. Wipes and recreates `dist/<id>/`.
2. Runs `pake <url> --config apps/<id>.json --app-version <appVersion> [--inject ...] --json`
   with cwd `dist/<id>/`. `--json` puts a single result object on stdout and the
   logs on stderr, so failures are structured (`error.code`, `message`, `hint`)
   instead of scraped.
3. Resolves the bundle: an `.app` in the outputs is used directly; a `.dmg` is
   mounted with `hdiutil`, the `.app` copied out with `ditto` and the image
   detached; otherwise it falls back to scanning the out dir.
4. Records `{ version, bundle, builtAt }` for the app in `dist/state.json`.

With `"targets": "apple"` Pake produces a `.dmg`, hence step 3. CI sets
`PAKE_CREATE_APP=1` to get the `.app` straight away — creating a `.dmg` only to
mount it again costs ~20s per app.

## Install

`installApp()` reuses `dist/state.json`: if the recorded build matches the
current `appVersion` and the bundle is still on disk, it skips the build
entirely. Otherwise it builds, then:

- `ditto` the bundle to `/Applications/<Name>.app` (removing any previous copy),
- `xattr -dr com.apple.quarantine` on the result, in case it inherited the
  attribute.

Bundles keep the ad-hoc signature Tauri gives any local build.

`uninstallApp()` removes the bundle from `/Applications`; `pake remove` deletes
the registry file and, with `--uninstall`, the installed app too.

## The pake-cli patch

`patches/pake-cli@3.15.5.patch` (applied by pnpm on install, pinned in
`package.json` under `pnpm.patchedDependencies`) makes popups work on macOS 26.

Pake builds a popup as a Tauri window, which crashes there. The patch answers
wry with `NewWindowResponse::Allow` so the window is built from the
`WKWebViewConfiguration` WebKit hands over, and lets `about:blank` popups through
Pake's `window.open` override — that's what gives windows the site fills via
`window.opener` (Slack huddles) a real window.

After upgrading pake-cli the patch has to be rebuilt:

```sh
pnpm patch pake-cli@<version>
```

`pnpm pake remake` upgrades pake-cli, bumps and rebuilds every app; run it when
the patch has been re-rolled so the installed apps actually pick up the new CLI.

## The CLI

oclif, one class per file in `src/commands/`, `topicSeparator: " "`. Commands are
thin: they parse args and call `src/lib/`. All filesystem entry points take
optional `dir` / `stateFile` / `distDir` overrides, which is how tests avoid
touching the real registry.

`src/lib/core.ts` holds everything shared: registry reads/writes, `dist/state.json`,
semver bumping, id slugging and `run()` (a `spawnSync` wrapper returning a
boolean).
