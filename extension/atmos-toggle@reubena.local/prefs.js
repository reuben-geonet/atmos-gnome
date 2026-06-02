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

        const startupRow = new Adw.ActionRow({
            title: 'Start at login without window',
            subtitle: 'Checking',
        });

        const startupSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            sensitive: false,
        });

        const controls = {
            row: startupRow,
            switch: startupSwitch,
            helperPath: findAtmosctl(),
            busy: false,
            syncing: false,
        };

        startupRow.add_suffix(startupSwitch);
        startupRow.activatable_widget = startupSwitch;

        startupSwitch.connect('notify::active', () => this._onStartupSwitchChanged(controls));

        group.add(startupRow);
        page.add(group);
        window.add(page);

        this._syncStartup(controls);
    }

    _syncStartup(controls) {
        controls.switch.sensitive = false;
        controls.row.subtitle = 'Checking';

        this._runHelper(controls.helperPath, ['autostart', 'status'], (success, stdout, stderr) => {
            if (!success) {
                console.warn(`Atmos autostart status failed: ${stderr || stdout}`);
                controls.row.subtitle = 'Unavailable';
                return;
            }

            const [state, detail = ''] = stdout.trim().split(/\t/, 2);
            this._setStartupSwitch(controls, state === 'enabled');
            controls.row.subtitle = detail || (state === 'enabled' ? 'Enabled' : 'Disabled');
            controls.switch.sensitive = true;
        });
    }

    _onStartupSwitchChanged(controls) {
        if (controls.syncing || controls.busy)
            return;

        const enabled = controls.switch.active;
        const command = enabled ? 'enable' : 'disable';

        controls.busy = true;
        controls.switch.sensitive = false;
        controls.row.subtitle = 'Saving';

        this._runHelper(controls.helperPath, ['autostart', command], (success, stdout, stderr) => {
            controls.busy = false;

            if (!success) {
                console.warn(`Atmos autostart ${command} failed: ${stderr || stdout}`);
                controls.row.subtitle = 'Failed to save';
                this._setStartupSwitch(controls, !enabled);
                controls.switch.sensitive = true;
                return;
            }

            this._syncStartup(controls);
        });
    }

    _setStartupSwitch(controls, enabled) {
        controls.syncing = true;
        controls.switch.active = enabled;
        controls.syncing = false;
    }

    _runHelper(helperPath, args, callback) {
        if (!helperPath) {
            callback(false, '', `${HELPER_NAME} not found`);
            return;
        }

        let proc;
        try {
            proc = Gio.Subprocess.new(
                [helperPath, ...args],
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
