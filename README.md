# Atmos GNOME

GNOME Shell Quick Settings toggle for the Atmos Agent VPN client.

## Requirements

- GNOME Shell 50.
- Atmos Agent installed locally.
- `atmosctl` from [`atmos-cli`](https://github.com/reuben-geonet/atmos-cli),
  with `--json` support.

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

On Wayland, log out and back in after installing or updating the extension.
