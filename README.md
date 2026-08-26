# pake-generator

Turn any website into a lightweight macOS desktop app — and keep it updated.
Every app is a single JSON file in `apps/`; one command builds it with
[Pake](https://github.com/tw93/pake) (Tauri + Rust) and installs it into
`/Applications`.

```sh
pnpm install
pnpm pake install slack
```

## What it does

- **Keeps a registry of apps.** One `apps/<id>.json` per app, in the Pake
  config format, versioned in git — so an app's window size, permissions and
  allowed domains are reviewable history instead of shell flags you forgot.
- **Builds and installs in one step.** `pnpm pake install <id>` compiles the
  `.app`, extracts it and copies it to `/Applications`. Rebuilds only happen
  when the version changed.
- **Versions each app independently.** The version shown in About, Finder and
  `CFBundleVersion` comes from the app's `appVersion`, bumped as patch, minor,
  major or an explicit `x.y.z`.
- **Shares page tweaks between apps.** JS/CSS snippets in `apps/inject/` are
  referenced by name from any app: turning login popups into redirects, warming
  up the microphone, and so on.
- **Publishes releases automatically.** On push to `main`, CI works out which
  apps a commit affects, bumps their versions and publishes a GitHub Release per
  app with the zipped `.app` as asset.
- **Fixes popups on macOS 26.** A pinned pake-cli patch ships with the repo, so
  `window.open` flows that otherwise crash the app (Slack huddles, Google login)
  work.

## Requirements

- macOS with Xcode Command Line Tools
- Node.js >= 24 (see `.nvmrc`) and pnpm
- Rust (`rustup` or `brew install rust`)
- `pnpm install` — pulls in the pinned `pake-cli` and applies the patch

## Apps in this repo

| ID                | Site               | Notes                                      |
| ----------------- | ------------------ | ------------------------------------------ |
| `claude`          | claude.ai          | native popups, drag & drop                 |
| `discord`         | discord.com        | microphone + camera                        |
| `figma`           | figma.com          | native popups                              |
| `notion`          | notion.so          | popups as redirects, drag & drop           |
| `notion-calendar` | calendar.notion.so | popups as redirects                        |
| `slack`           | app.slack.com      | huddles: Chrome UA, mic warm-up, mic + cam |
| `telegram`        | web.telegram.org   | microphone + camera                        |

### Latest releases

Updated by the pipeline after each successful build.

<!-- releases:start -->

| ID                | Latest release                                                                                        | Download                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `claude`          | [claude@1.0.1](https://github.com/d0whc3r/pake-generator/releases/tag/claude@1.0.1)                   | [claude-v1.0.1-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/claude@1.0.1/claude-v1.0.1-macos.zip)                            |
| `discord`         | [discord@1.0.1](https://github.com/d0whc3r/pake-generator/releases/tag/discord@1.0.1)                 | [discord-v1.0.1-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/discord@1.0.1/discord-v1.0.1-macos.zip)                         |
| `figma`           | [figma@1.0.2](https://github.com/d0whc3r/pake-generator/releases/tag/figma@1.0.2)                     | [figma-v1.0.2-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/figma@1.0.2/figma-v1.0.2-macos.zip)                               |
| `notion-calendar` | [notion-calendar@1.0.5](https://github.com/d0whc3r/pake-generator/releases/tag/notion-calendar@1.0.5) | [notion-calendar-v1.0.5-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/notion-calendar@1.0.5/notion-calendar-v1.0.5-macos.zip) |
| `notion`          | [notion@1.0.8](https://github.com/d0whc3r/pake-generator/releases/tag/notion@1.0.8)                   | [notion-v1.0.8-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/notion@1.0.8/notion-v1.0.8-macos.zip)                            |
| `slack`           | [slack@1.0.15](https://github.com/d0whc3r/pake-generator/releases/tag/slack@1.0.15)                   | [slack-v1.0.15-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/slack@1.0.15/slack-v1.0.15-macos.zip)                            |
| `telegram`        | [telegram@1.0.3](https://github.com/d0whc3r/pake-generator/releases/tag/telegram@1.0.3)               | [telegram-v1.0.3-macos.zip](https://github.com/d0whc3r/pake-generator/releases/download/telegram@1.0.3/telegram-v1.0.3-macos.zip)                      |

<!-- releases:end -->

## Everyday use

```sh
pnpm pake list                    # registered apps, version and last build
pnpm pake install slack           # build (if needed) and install into /Applications
pnpm pake install                 # all of them
pnpm pake update slack            # bump appVersion (patch), rebuild and install
pnpm pake update slack --release minor
pnpm pake uninstall slack         # remove the .app from /Applications
```

`pnpm pake update` is `bump` + `build` + `install` in one go. Use it after
editing an app's JSON so the new build carries a new version.

To pick up a new pake-cli release across every app:

```sh
pnpm pake remake --install        # upgrade pake-cli, bump, rebuild, reinstall
pnpm pake remake slack --no-upgrade --no-bump
```

## Add an app

```sh
pnpm pake add https://web.whatsapp.com --name "WhatsApp" \
  --set width=1200 --set height=800 --set hideTitleBar=true
```

That writes `apps/whatsapp.json`. Then install it:

```sh
pnpm pake install whatsapp
```

## Configure an app

`apps/<id>.json` accepts every option of the
[Pake schema](https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json)
plus `appVersion` (semver), which this repo manages. The ones that matter most
in practice:

| Option                 | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `url`, `name`          | Page to wrap and the resulting `.app` name                 |
| `identifier`           | Bundle ID (defaults to `com.pake.<slug>`)                  |
| `width`, `height`      | Initial window size                                        |
| `hideTitleBar`         | Native title bar off, for sites with their own chrome      |
| `newWindow`            | Open popups as real windows instead of navigating in place |
| `safeDomain`           | Domains that stay inside the app (add your login provider) |
| `microphone`, `camera` | Request the macOS permissions the site needs               |
| `enableDragDrop`       | Allow dropping files into the page                         |
| `userAgent`            | Override the UA — some sites gate features on it           |
| `inject`               | Snippets from `apps/inject/` to inject into the page       |

Injected snippets are named, not pathed:

```json
"inject": ["popup-to-redirect.js"]
```

Available snippets:

- `popup-to-redirect.js` — turns login popups into full-page navigation, for
  apps that run with `newWindow: false`.
- `microphone-warmup.js` — grants and releases the mic on load so WebKit
  populates the device list (needed for Slack huddles).
- `huddle-debug.js` — temporary on-screen diagnostic for `window.open` and
  `getUserMedia`; not meant to stay in an app's `inject` list.

After any edit: `pnpm pake update <id>`.

## Versions

```sh
pnpm pake bump slack              # 1.0.13 -> 1.0.14
pnpm pake bump slack minor        # 1.0.14 -> 1.1.0
pnpm pake bump slack 2.0.0        # explicit
```

Released apps are tagged `<id>@<version>` (e.g. `slack@1.0.13`) and each release
carries the zipped `.app`. See [docs/RELEASES.md](docs/RELEASES.md).

## Command reference

| Command                                            | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- |
| `pnpm pake list`                                   | List apps, version and last build                  |
| `pnpm pake add <url> --name "N" [--set k=v]`       | Register a new app                                 |
| `pnpm pake remove <id> [--uninstall]`              | Remove the app from the registry (+ /Applications) |
| `pnpm pake build [id...] [--debug]`                | Build into `dist/<id>/` (all if no id is given)    |
| `pnpm pake install [id...] [--debug]`              | Build if needed + copy to /Applications            |
| `pnpm pake uninstall <id...>`                      | Remove the .app from /Applications                 |
| `pnpm pake bump <id> [patch\|minor\|major\|x.y.z]` | Bump `appVersion`                                  |
| `pnpm pake update <id...> [--release r]`           | bump + build + install                             |
| `pnpm pake update-all [--release r]`               | bump + build + install every registered app        |
| `pnpm pake remake [id...] [--install]`             | Upgrade pake-cli, bump and rebuild                 |
| `pnpm pake help`                                   | Help for any command                               |

`release-detect`, `release-app` and `readme` also exist; they are the CI entry
points and are documented in [docs/RELEASES.md](docs/RELEASES.md).

## Good to know

- The first build is slow: Pake downloads its Tauri template and compiles the
  Rust dependencies. Later builds are much faster.
- The `.app` bundles carry an ad-hoc signature, like any local Tauri build.
  Since they are compiled on your machine they have no Gatekeeper quarantine.
- Don't run `pnpm install <app>` — `install` is pnpm's own command. Always
  `pnpm pake install <app>`.
- The `objc[...] GNotificationCenterDelegate is implemented in both...` warning
  during a build is harmless (it comes from libvips/sharp, a Pake dependency).
- Builds land in `dist/<id>/`, which is git-ignored.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, quality gates, commit conventions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the registry, build and install work
- [docs/RELEASES.md](docs/RELEASES.md) — versioning, tags and the CI pipeline
- [CHANGELOG.md](CHANGELOG.md) — per-app release notes
