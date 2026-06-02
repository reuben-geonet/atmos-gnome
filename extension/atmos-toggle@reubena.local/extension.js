import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const POLL_SECONDS = 5;
const RESYNC_DELAY_MS = 900;
const PENDING_TIMEOUT_MS = 45000;
const VPN_ICON_CONNECTED = 'network-vpn-symbolic';
const VPN_ICON_PENDING = 'network-vpn-acquiring-symbolic';
const VPN_ICON_PAUSED = 'network-vpn-disabled-symbolic';
const HELPER_NAME = 'atmosctl';

function findAtmosctl() {
    const helperPath = GLib.find_program_in_path(HELPER_NAME);
    if (helperPath)
        return helperPath;

    const candidates = [
        '/usr/bin/atmosctl',
        '/usr/local/bin/atmosctl',
        GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', HELPER_NAME]),
        GLib.build_filenamev([GLib.get_home_dir(), 'go', 'bin', HELPER_NAME]),
    ];

    for (const candidate of candidates) {
        if (GLib.file_test(candidate, GLib.FileTest.IS_EXECUTABLE))
            return candidate;
    }

    return null;
}

const AtmosToggle = GObject.registerClass(
class AtmosToggle extends QuickToggle {
    _init(helperPath, indicator) {
        super._init({
            title: 'Atmos',
            subtitle: 'Checking',
            iconName: VPN_ICON_PENDING,
            toggleMode: true,
        });

        this._helperPath = helperPath;
        this._indicator = indicator;
        this._pollId = 0;
        this._resyncId = 0;
        this._busy = false;
        this._helperAvailable = true;
        this._pendingState = null;
        this._pendingSinceMs = 0;

        this.connectObject(
            'clicked', () => this._toggleAtmos(),
            'destroy', () => this._destroy(),
            this);

        this._sync();
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._sync();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._pollId, '[atmos-toggle] status poll');
    }

    _destroy() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        if (this._resyncId) {
            GLib.source_remove(this._resyncId);
            this._resyncId = 0;
        }
    }

    _toggleAtmos() {
        if (this._busy || !this._helperAvailable)
            return;

        const desiredConnected = this.checked;
        const command = desiredConnected ? 'resume' : 'pause';

        this._busy = true;
        this.reactive = false;
        this._setPendingState(desiredConnected ? 'connected' : 'disconnected');

        this._runHelper(['vpn', command], (success, stdout, stderr) => {
            this._busy = false;
            this.reactive = true;

            if (!success) {
                console.warn(`Atmos ${command} failed: ${stderr || stdout}`);
                this._clearPendingState();
                this._setError();
                return;
            }

            this._scheduleSync();
        });
    }

    _scheduleSync(delayMs = RESYNC_DELAY_MS) {
        if (this._resyncId)
            GLib.source_remove(this._resyncId);

        this._resyncId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._resyncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._resyncId, '[atmos-toggle] resync');
    }

    _sync() {
        if (this._busy)
            return;

        this._runHelper(['vpn', 'status'], (success, stdout, stderr) => {
            if (!success) {
                console.warn(`Atmos status failed: ${stderr || stdout}`);
                this._setError();
                return;
            }

            this._helperAvailable = true;
            this.reactive = true;
            this._setState(stdout.trim());
        });
    }

    _setState(statusLine) {
        const [state] = statusLine.split(/\s+/, 1);

        if (this._pendingState) {
            if (state === this._pendingState) {
                this._clearPendingState();
            } else if (Date.now() - this._pendingSinceMs < PENDING_TIMEOUT_MS) {
                this._showPendingState();
                this._scheduleSync();
                return;
            } else {
                this._clearPendingState();
            }
        }

        switch (state) {
        case 'connected':
            this.checked = true;
            this.iconName = VPN_ICON_CONNECTED;
            this.subtitle = 'Connected';
            this._indicator.icon_name = VPN_ICON_CONNECTED;
            this._indicator.visible = true;
            break;
        case 'disconnected':
            this.checked = false;
            this.iconName = VPN_ICON_PAUSED;
            this.subtitle = 'Paused';
            this._indicator.visible = false;
            break;
        default:
            this.checked = false;
            this.iconName = VPN_ICON_PAUSED;
            this.subtitle = 'Unknown';
            this._indicator.visible = false;
            break;
        }
    }

    _setPendingState(state) {
        this._pendingState = state;
        this._pendingSinceMs = Date.now();
        this._showPendingState();
    }

    _clearPendingState() {
        this._pendingState = null;
        this._pendingSinceMs = 0;
    }

    _showPendingState() {
        if (this._pendingState === 'connected') {
            this.checked = true;
            this.iconName = VPN_ICON_PENDING;
            this.subtitle = 'Resuming';
            this._indicator.icon_name = VPN_ICON_PENDING;
            this._indicator.visible = true;
        } else if (this._pendingState === 'disconnected') {
            this.checked = false;
            this.iconName = VPN_ICON_PAUSED;
            this.subtitle = 'Pausing';
            this._indicator.visible = false;
        }
    }

    _setError() {
        this._helperAvailable = false;
        this.reactive = false;
        this.checked = false;
        this.iconName = VPN_ICON_PAUSED;
        this.subtitle = 'Unavailable';
        this._indicator.visible = false;
    }

    _runHelper(args, callback) {
        if (!this._helperPath)
            this._helperPath = findAtmosctl();

        if (!this._helperPath) {
            callback(false, '', `${HELPER_NAME} not found`);
            return;
        }

        let proc;
        try {
            proc = Gio.Subprocess.new(
                [this._helperPath, ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            callback(false, '', e.message);
            return;
        }

        proc.communicate_utf8_async(null, null, (source, result) => {
            try {
                const [success, stdout, stderr] = source.communicate_utf8_finish(result);
                callback(success && source.get_successful(), stdout ?? '', stderr ?? '');
            } catch (e) {
                callback(false, '', e.message);
            }
        });
    }
});

const AtmosIndicator = GObject.registerClass(
class AtmosIndicator extends SystemIndicator {
    _init(helperPath) {
        super._init();

        this._indicator = this._addIndicator();
        this._indicator.icon_name = VPN_ICON_CONNECTED;
        this._indicator.visible = false;

        this._toggle = new AtmosToggle(helperPath, this._indicator);
        this.quickSettingsItems.push(this._toggle);

        this.connect('destroy', () => this._toggle.destroy());
    }
});

export default class AtmosExtension extends Extension {
    enable() {
        const helperPath = findAtmosctl();
        this._indicator = new AtmosIndicator(helperPath);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
