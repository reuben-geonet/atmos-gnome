# <img src="resources/images/atmos-vpn-logo-header.png" height="32" alt="Atmos VPN logo"/> Atmos GNOME

GNOME Shell Quick Settings toggle for the Atmos Agent VPN client.

## Settings

The Atmos VPN GUI startup behavior can be managed from the extension settings.

![Atmos VPN settings screenshot](resources/images/atmos-vpn-settings.png)

## Requirements

- Atmos Agent installed locally.
- `atmosctl` 0.3.0 or newer from [`atmos-cli`](https://github.com/reuben-geonet/atmos-cli)

When Atmos is logged out, the Quick Settings tile shows `Logged out` and opens
the Atmos application when clicked instead of trying to resume the VPN.

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
