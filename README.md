# Atmos GNOME

GNOME Shell Quick Settings toggle for the Atmos Agent VPN client.

This project is experimental and is not affiliated with Axis Security or the
Atmos Agent product.

## Requirements

- GNOME Shell 50.
- Atmos Agent installed locally.
- `atmosctl` from [`atmos-cli`](https://github.com/reuben-geonet/atmos-cli).

## Build

```sh
make pack
```

This creates `atmos-toggle@reubena.local.shell-extension.zip`.

## Install

```sh
make install
gnome-extensions enable atmos-toggle@reubena.local
```

On Wayland, log out and back in after installing or updating the extension.

## Publishing

The `Upload to EGO` GitHub Actions workflow packs the extension and uploads it
to extensions.gnome.org when a GitHub Release is published. It runs Shexli
before upload and requires `EGO_USERNAME` and `EGO_PASSWORD` repository secrets.
