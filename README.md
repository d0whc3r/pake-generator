# pake-generator

Repo para generar, instalar y mantener apps de escritorio en macOS a partir de
paginas web usando [Pake](https://github.com/tw93/pake) (Tauri + Rust).

## Requisitos

- macOS con Xcode Command Line Tools
- Node.js >= 24 y pnpm
- Rust (`rustup` o `brew install rust`)
- Las dependencias del repo: `pnpm install` (incluye `pake-cli` fijado en `package.json`)

## Como funciona

Cada app es un archivo `apps/<id>.json` con el formato de config de Pake
([schema](https://raw.githubusercontent.com/tw93/Pake/main/schema/pake.schema.json))
mas un campo propio `appVersion` (semver) que gestiona este repo.

Los builds se generan en `dist/<id>/` (ignorado por git) y el estado del
ultimo build queda en `dist/state.json`.

### Snippets inyectados

`apps/inject/` guarda los JS/CSS que se inyectan en la pagina, compartidos entre
apps. Una app los usa nombrandolos en su campo `inject`:

```json
"inject": ["popup-to-redirect.js"]
```

Los nombres se resuelven contra `apps/inject/` y se pasan a pake por flag, no en
la config: pake resuelve las rutas relativas de la config contra su cwd, que
durante el build es `dist/<id>/`.

## Uso diario

```sh
pnpm pake list                    # ver apps registradas, version y ultimo build
pnpm pake install telegram        # compila (si hace falta) e instala en /Applications
pnpm pake install                 # instala todas
pnpm pake update telegram         # sube appVersion (patch), recompila e instala
pnpm pake update slack --release minor
pnpm pake uninstall telegram      # quita el .app de /Applications
```

## Anadir una app nueva

```sh
pnpm pake add https://web.whatsapp.com --name "WhatsApp" \
  --set width=1200 --set height=800 --set hideTitleBar=true
```

Esto crea `apps/whatsapp.json`. Edita el archivo para ajustar cualquier opcion
del schema de Pake (`safeDomain`, `inject`, `showSystemTray`, etc.) y luego:

```sh
pnpm pake install whatsapp
```

## Gestion de versiones

La version visible de la app (About, Finder, CFBundleVersion) sale del campo
`appVersion` de cada `apps/<id>.json`:

```sh
pnpm pake bump telegram           # 1.0.0 -> 1.0.1 (patch)
pnpm pake bump telegram minor     # 1.0.1 -> 1.1.0
pnpm pake bump telegram 2.0.0     # version explicita
```

`pnpm pake update <id>` equivale a `bump` + `build` + `install`.

El script `install` solo recompila si la version del build en `dist/` no
coincide con `appVersion`; si ya hay un build de esa version, reutiliza el
bundle y solo copia a `/Applications`.

## Comandos

| Comando                                            | Descripcion                                      |
| -------------------------------------------------- | ------------------------------------------------ |
| `pnpm pake list`                                   | Lista apps, version y ultimo build               |
| `pnpm pake add <url> --name "N" [--set k=v]`       | Registra una app nueva                           |
| `pnpm pake remove <id> [--uninstall]`              | Elimina la app del registro (y de /Applications) |
| `pnpm pake build [id...] [--debug]`                | Compila a `dist/<id>/` (todas si no hay id)      |
| `pnpm pake install [id...]`                        | Build si hace falta + copia a /Applications      |
| `pnpm pake uninstall <id...>`                      | Elimina el .app de /Applications                 |
| `pnpm pake bump <id> [patch\|minor\|major\|x.y.z]` | Sube `appVersion`                                |
| `pnpm pake update <id...> [--release r]`           | bump + build + install                           |
| `pnpm pake help`                                   | Ayuda                                            |

## Notas

- El primer build de Pake es lento: descarga su plantilla de Tauri y compila
  las dependencias de Rust. Los siguientes son mucho mas rapidos.
- Con `"targets": "apple"` Pake genera un `.dmg`; el script lo monta, extrae
  el `.app` a `dist/<id>/` y lo instala desde ahi.
- Los `.app` se instalan con firma ad-hoc (como cualquier build local de
  Tauri); al ser compilados en tu maquina no llevan cuarentena de Gatekeeper.
- No uses `pnpm install <app>`: `install` es el comando de pnpm. Siempre
  `pnpm pake install <app>`.
- El aviso `objc[...] GNotificationCenterDelegate is implemented in both...`
  al compilar es inofensivo (viene de libvips/sharp, dependencia de Pake).
