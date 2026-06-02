import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

export default class AtmosPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.default_width = 560;
        window.default_height = 240;

        const page = new Adw.PreferencesPage({
            title: 'Atmos',
            icon_name: 'network-vpn-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Startup',
        });

        this._startupRow = new Adw.ActionRow({
            title: 'Start at login without window',
            subtitle: 'Checking',
        });

        this._startupSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            sensitive: false,
        });
        this._startupRow.add_suffix(this._startupSwitch);
        this._startupRow.activatable_widget = this._startupSwitch;

        this._startupSwitch.connect('notify::active', () => this._onStartupSwitchChanged());

        group.add(this._startupRow);
        page.add(group);
        window.add(page);

        this._helperPath = findAtmosctl();
        this._startupBusy = false;
        this._startupSyncing = false;
        this._syncStartup();
    }

    _syncStartup() {
        this._startupSwitch.sensitive = false;
        this._startupRow.subtitle = 'Checking';

        this._runHelper(['autostart', 'status'], (success, stdout, stderr) => {
            if (!success) {
                console.warn(`Atmos autostart status failed: ${stderr || stdout}`);
                this._startupRow.subtitle = 'Unavailable';
                return;
            }

            const [state, detail = ''] = stdout.trim().split(/\t/, 2);
            this._setStartupSwitch(state === 'enabled');
            this._startupRow.subtitle = detail || (state === 'enabled' ? 'Enabled' : 'Disabled');
            this._startupSwitch.sensitive = true;
        });
    }

    _onStartupSwitchChanged() {
        if (this._startupSyncing || this._startupBusy)
            return;

        const enabled = this._startupSwitch.active;
        const command = enabled ? 'enable' : 'disable';

        this._startupBusy = true;
        this._startupSwitch.sensitive = false;
        this._startupRow.subtitle = 'Saving';

        this._runHelper(['autostart', command], (success, stdout, stderr) => {
            this._startupBusy = false;

            if (!success) {
                console.warn(`Atmos autostart ${command} failed: ${stderr || stdout}`);
                this._startupRow.subtitle = 'Failed to save';
                this._setStartupSwitch(!enabled);
                this._startupSwitch.sensitive = true;
                return;
            }

            this._syncStartup();
        });
    }

    _setStartupSwitch(enabled) {
        this._startupSyncing = true;
        this._startupSwitch.active = enabled;
        this._startupSyncing = false;
    }

    _runHelper(args, callback) {
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
}
