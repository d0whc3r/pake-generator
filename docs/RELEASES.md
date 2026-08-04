# Releases

Each app is released on its own: its own version, its own tag, its own GitHub
Release with the zipped `.app` as asset. The repo version in `package.json` is
irrelevant to that.

## Versioning model

- The version of an app lives in the `appVersion` field of `apps/<id>.json`, and
  is what shows up in About, Finder and `CFBundleVersion`.
- Tags are `<id>@<version>` — e.g. `slack@1.0.13`.
- Release notes are collected per app and prepended to `CHANGELOG.md`.

Locally you bump by hand (`pnpm pake bump`, or `pnpm pake update` which bumps,
rebuilds and installs). On `main` the pipeline does it for you — don't bump
`appVersion` in a PR.

## What triggers a release

A commit releases an app when **both** hold:

1. It is a conventional commit: `fix:` → patch, `feat:` → minor,
   `BREAKING CHANGE` → major. Anything else releases nothing.
2. It touches a file that affects that app:
   - `apps/<id>.json` → only that app;
   - `apps/inject/**`, `patches/**`, `package.json`, `pnpm-lock.yaml`,
     `pnpm-workspace.yaml` → **every** app, because those change every build's
     output (shared snippets, the pake-cli patch, the pinned pake-cli).

Everything else (`src/`, `test/`, `.github/`, docs) changes the tooling, not the
bundles, so it publishes nothing.

Preview it without pushing anything:

```sh
pnpm pake release-detect --dry
```

## The pipeline

`.github/workflows/pipeline.yml`, two jobs.

### 1. `quality` (every PR, push to `main`, and manual runs)

`pnpm lint`, `format:check`, `type-check`, `test`, `build`, then
`pnpm pake release-detect`.

Detection is a **dry run** everywhere except a push to `main` — PRs and manual
runs on branches only report what would be released. On `main` it:

- pushes a seed tag for any app that has never been released (see below),
- writes the new `appVersion` into each released `apps/<id>.json`, runs
  `pnpm format` over them, prepends the notes to `CHANGELOG.md`, and pushes a
  single `chore(release): bump <tags> [skip ci]` commit,
- emits the list of apps to release plus the sha of that bump commit.

### 2. `release` (only pushes to `main`, one macOS job for every app)

Checks out the bump commit, then loops `pnpm pake release-app <id>` over the
detected apps: builds with pake, tags `<id>@<version>` and creates the GitHub
Release with the zipped `.app`. A failing app doesn't skip the rest, the job
just fails at the end. Apps are never published from a PR.

One job instead of a matrix because the Rust dependency graph is what costs:
with a runner per app each one recompiles those ~344 crates and they all race to
save the same cache key. Sequentially in a single warm `CARGO_TARGET_DIR` only
the `pake` crate and the link are per-app.

## Seed tags

semantic-release needs a starting point per app. The first time an app goes
through the pipeline there is no `<id>@<version>` tag, so one is created from its
current `appVersion` pointing at the root commit; versions continue from there.

## CI build tuning

Building the same Rust dependency graph once per app is the whole cost of the
release job, so the workflow sets:

| Setting                                               | Why                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CARGO_TARGET_DIR=.cargo-target`                      | Out of `node_modules` (a pnpm symlink farm) so it can be cached, and shared by every app: only the `pake` crate embeds the per-app config, its ~344 dependencies compile identically.                                                                 |
| `CARGO_PROFILE_RELEASE_LTO=false`, `CODEGEN_UNITS=16` | Pake's release profile is tuned for binary size, and every app pays the whole-program link again — the `pake` crate embeds the config, so its codegen and the LTO pass never come from the cache. ~1 MB more binary buys a 45% shorter per-app build. |
| `PAKE_CREATE_APP=1`                                   | Bundle the `.app` directly instead of a `.dmg` the build would only mount again; the release asset is the zip of the `.app` anyway.                                                                                                                   |

The cargo cache is keyed on a hash of `pake-cli`'s `Cargo.lock` plus the two
profile overrides — not on `pnpm-lock.yaml`, so bumping a JS devDependency
doesn't throw away compiled crates, and changing a profile can't restore
artifacts cargo would then discard as stale. The bundle dir is deleted before
each build — its contents belong to the cache or to the previous app in the
loop — so a build that stops short can't publish another app's `.app`.

## Manual release

```sh
pnpm pake release-detect          # push seed tags + bump commit (needs GITHUB_TOKEN)
pnpm pake release-app slack       # build, tag and publish one app
```

Both expect a clean `main` and a `GITHUB_TOKEN` in the environment. Normally the
pipeline is the only thing that runs them.
