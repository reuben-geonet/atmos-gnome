# Atmos GNOME

GNOME Shell Quick Settings toggle for the Atmos Agent VPN client.

## Requirements

- Atmos Agent installed locally.
- `atmosctl` from [`atmos-cli`](https://github.com/reuben-geonet/atmos-cli)

## Install

### From GNOME Extensions (Recommended)

[![Extension Downloads](https://img.shields.io/gnome-extensions/dt/atmos-vpn%40reuben-geonet.github.io?logo=gnome&logoColor=white&cacheSeconds=86400)](https://extensions.gnome.org/extension/10075/atmos-vpn/)

[<img width="200" alt="Get it on GNOME Extensions" src="https://github.com/andyholmes/gnome-shell-extensions-badge/raw/master/get-it-on-ego.png">](https://extensions.gnome.org/extension/10075/atmos-vpn/)

### From Source

#### Build

```sh
make pack
```

This creates `<extension-uuid>.shell-extension.zip` in the repository root.

#### Install

```sh
make install
gnome-extensions enable <extension-uuid>
```

On Wayland, log out and back in after installing or updating the extension.
