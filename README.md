# Atmos GNOME

GNOME Shell Quick Settings toggle for the Atmos Agent VPN client.

This project is experimental and is not affiliated with Axis Security or the
Atmos Agent product.

## Requirements

- GNOME Shell 50.
- Atmos Agent installed locally.
- `atmosctl` from [`atmos-cli`](https://github.com/reuben-geonet/atmos-cli),
  with `--json` support.

If `atmosctl` is missing, the extension preferences show a warning and link to
the `atmos-cli` repository.

## Build

```sh
make pack
```

This creates `<extension-uuid>.shell-extension.zip` in the repository root.

## Install

```sh
make install
gnome-extensions enable <extension-uuid>
```

Use the UUID from `extension/*/metadata.json`.

On Wayland, log out and back in after installing or updating the extension.

## Publishing

The `Upload to EGO` GitHub Actions workflow packs the extension and uploads it
to extensions.gnome.org when a GitHub Release is published. It runs Shexli
before upload and requires `EGO_USERNAME` and `EGO_PASSWORD` repository secrets.
