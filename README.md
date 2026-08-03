# pake-generator

Repo to generate, install and maintain macOS desktop apps out of web pages
using [Pake](https://github.com/tw93/pake) (Tauri + Rust).

## Requirements

- macOS with Xcode Command Line Tools
- Node.js >= 24 and pnpm
- Rust (`rustup` or `brew install rust`)
- The repo dependencies: `pnpm install` (includes `pake-cli` pinned in `package.json`)

## How it works

Each app is an `apps/<id>.json` file in the Pake config format
([schema](https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json))
plus an extra `appVersion` field (semver) managed by this repo.

Builds are generated in `dist/<id>/` (git-ignored) and the state of the last
build is kept in `dist/state.json`.

### Injected snippets

`apps/inject/` holds the JS/CSS injected into the page, shared across apps. An
app uses them by naming them in its `inject` field:

```json
"inject": ["popup-to-redirect.js"]
```

The names are resolved against `apps/inject/` and passed to pake as flags, not
in the config: pake resolves the config's relative paths against its cwd, which
during the build is `dist/<id>/`.

## Daily usage

```sh
pnpm pake list                    # see registered apps, version and last build
pnpm pake install telegram        # build (if needed) and install into /Applications
pnpm pake install                 # install all of them
pnpm pake update telegram         # bump appVersion (patch), rebuild and install
pnpm pake update slack --release minor
pnpm pake uninstall telegram      # remove the .app from /Applications
```

## Adding a new app

```sh
pnpm pake add https://web.whatsapp.com --name "WhatsApp" \
  --set width=1200 --set height=800 --set hideTitleBar=true
```

This creates `apps/whatsapp.json`. Edit the file to tweak any option from the
Pake schema (`safeDomain`, `inject`, `showSystemTray`, etc.) and then:

```sh
pnpm pake install whatsapp
```

## Version management

The version visible in the app (About, Finder, CFBundleVersion) comes from the
`appVersion` field of each `apps/<id>.json`:

```sh
pnpm pake bump telegram           # 1.0.0 -> 1.0.1 (patch)
pnpm pake bump telegram minor     # 1.0.1 -> 1.1.0
pnpm pake bump telegram 2.0.0     # explicit version
```

`pnpm pake update <id>` is equivalent to `bump` + `build` + `install`.

The `install` script only rebuilds when the version of the build in `dist/`
does not match `appVersion`; if a build of that version already exists, it
reuses the bundle and only copies it to `/Applications`.

## Commands

| Command                                            | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- |
| `pnpm pake list`                                   | List apps, version and last build                  |
| `pnpm pake add <url> --name "N" [--set k=v]`       | Register a new app                                 |
| `pnpm pake remove <id> [--uninstall]`              | Remove the app from the registry (+ /Applications) |
| `pnpm pake build [id...] [--debug]`                | Build into `dist/<id>/` (all if no id is given)    |
| `pnpm pake install [id...]`                        | Build if needed + copy to /Applications            |
| `pnpm pake uninstall <id...>`                      | Remove the .app from /Applications                 |
| `pnpm pake bump <id> [patch\|minor\|major\|x.y.z]` | Bump `appVersion`                                  |
| `pnpm pake update <id...> [--release r]`           | bump + build + install                             |
| `pnpm pake help`                                   | Help                                               |

## Notes

- The first Pake build is slow: it downloads its Tauri template and compiles
  the Rust dependencies. The following ones are much faster.
- With `"targets": "apple"` Pake produces a `.dmg`; the script mounts it,
  extracts the `.app` into `dist/<id>/` and installs it from there.
- The `.app` bundles are installed with an ad-hoc signature (like any local
  Tauri build); since they are compiled on your machine they carry no
  Gatekeeper quarantine.
- Do not use `pnpm install <app>`: `install` is pnpm's own command. Always
  `pnpm pake install <app>`.
- The `objc[...] GNotificationCenterDelegate is implemented in both...` warning
  during the build is harmless (it comes from libvips/sharp, a Pake dependency).
