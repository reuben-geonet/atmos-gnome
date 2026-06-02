# Project Notes

This repository contains the GNOME Shell Quick Settings integration for Atmos
Agent. The command-line helper now lives in the separate `atmos-cli` repository
and provides the `atmosctl` binary.

## Key Files

- `extension/atmos-toggle@reubena.local/extension.js`: GNOME Shell 50 Quick
  Settings tile.
- `extension/atmos-toggle@reubena.local/prefs.js`: preferences UI.
- `extension/atmos-toggle@reubena.local/metadata.json`: extension metadata.
- `.github/workflows/ego-upload.yml`: manual extensions.gnome.org upload
  workflow.
- `Makefile`: local pack, install, and cleanup shortcuts.

## Commands

```bash
make pack
make install
make clean
```

The extension expects `atmosctl` to be installed separately and available from
the GNOME Shell process environment or one of these common paths:

- `/usr/bin/atmosctl`
- `/usr/local/bin/atmosctl`
- `~/.local/bin/atmosctl`
- `~/go/bin/atmosctl`

Useful manual helper checks:

```bash
atmosctl version
atmosctl vpn status
atmosctl autostart status
```

## GitHub Actions

`Upload to EGO` is a manual workflow for publishing to extensions.gnome.org.
It requires repository secrets:

- `EGO_USERNAME`
- `EGO_PASSWORD`

The workflow packs the extension with `gnome-extensions pack` and uploads it
with `gnome-extensions upload --accept-tos`.

## Commit Style

Use Conventional Commits for all commits, for example:

```text
feat: add quick settings tile
fix: handle missing atmosctl helper
ci: upload extension to EGO
docs: document atmosctl dependency
```

## Development Notes

GNOME Shell 50 caches loaded extension code and metadata in the current Wayland
session. Code, metadata, and newly added prefs changes generally require a
logout/login before `gnome-extensions info` and Extension Manager reflect the
new version.

Avoid restarting GNOME Shell from automation on Wayland. It is the compositor
and restarting it can effectively end the session.
