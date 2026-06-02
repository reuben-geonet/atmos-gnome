# Atmos GNOME

GNOME Shell Quick Settings toggle for the Atmos Agent VPN client.

The extension appears in GNOME as `Atmos VPN` and uses the UUID
`atmos-vpn@reuben-geonet.github.io`.

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

Use the UUID from `extension/*/metadata.json`.

On Wayland, log out and back in after installing or updating the extension.
