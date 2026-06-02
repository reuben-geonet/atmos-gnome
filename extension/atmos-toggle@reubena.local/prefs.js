import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const HELPER_NAME = 'atmosctl';
const INSTALL_URL = 'https://github.com/reuben-geonet/atmos-cli';

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
        window.default_height = 320;

        const page = new Adw.PreferencesPage({
            title: 'Atmos',
            icon_name: 'network-vpn-symbolic',
        });

        const dependencyBanner = new Adw.Banner({
            title: 'Atmos CLI is not installed',
            button_label: 'Install Atmos CLI',
            revealed: false,
        });
        dependencyBanner.connect('button-clicked', () => this._openInstallPage());
        page.banner = dependencyBanner;

        const dependencyGroup = new Adw.PreferencesGroup({
            title: 'Dependencies',
        });

        const dependencyRow = new Adw.ActionRow({
            title: 'Atmos CLI',
            subtitle: 'Checking',
            subtitle_selectable: true,
        });

        const dependencyIcon = new Gtk.Image({
            icon_name: 'network-vpn-acquiring-symbolic',
            valign: Gtk.Align.CENTER,
        });

        const installButton = new Gtk.LinkButton({
            label: 'Install Atmos CLI',
            uri: INSTALL_URL,
            valign: Gtk.Align.CENTER,
            visible: false,
        });

        dependencyRow.add_suffix(dependencyIcon);
        dependencyRow.add_suffix(installButton);
        dependencyGroup.add(dependencyRow);

        const startupGroup = new Adw.PreferencesGroup({
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
            startupRow,
            startupSwitch,
            dependencyBanner,
            dependencyRow,
            dependencyIcon,
            installButton,
            helperPath: findAtmosctl(),
            busy: false,
            syncing: false,
        };

        startupRow.add_suffix(startupSwitch);
        startupRow.activatable_widget = startupSwitch;

        startupSwitch.connect('notify::active', () => this._onStartupSwitchChanged(controls));

        startupGroup.add(startupRow);
        page.add(dependencyGroup);
        page.add(startupGroup);
        window.add(page);

        this._syncDependency(controls);
    }

    _syncDependency(controls) {
        controls.dependencyBanner.revealed = false;
        controls.dependencyRow.subtitle = 'Checking';
        controls.dependencyIcon.icon_name = 'network-vpn-acquiring-symbolic';
        controls.installButton.visible = false;

        if (!controls.helperPath) {
            this._setHelperUnavailable(controls, `${HELPER_NAME} was not found`);
            return;
        }

        this._runHelper(controls.helperPath, ['version'], (success, stdout, stderr) => {
            if (!success) {
                console.warn(`Atmos CLI version check failed: ${stderr || stdout}`);
                this._setHelperUnavailable(controls, `${HELPER_NAME} could not be run`);
                return;
            }

            const version = stdout.trim() || HELPER_NAME;
            controls.dependencyRow.subtitle = `${version} at ${controls.helperPath}`;
            controls.dependencyIcon.icon_name = 'emblem-ok-symbolic';
            controls.installButton.visible = false;
            this._syncStartup(controls);
        });
    }

    _setHelperUnavailable(controls, detail) {
        controls.dependencyBanner.revealed = true;
        controls.dependencyRow.subtitle = detail;
        controls.dependencyIcon.icon_name = 'dialog-warning-symbolic';
        controls.installButton.visible = true;
        controls.startupRow.subtitle = 'Unavailable';
        controls.startupSwitch.sensitive = false;
    }

    _syncStartup(controls) {
        controls.startupSwitch.sensitive = false;
        controls.startupRow.subtitle = 'Checking';

        this._runHelper(controls.helperPath, ['autostart', 'status'], (success, stdout, stderr) => {
            if (!success) {
                console.warn(`Atmos autostart status failed: ${stderr || stdout}`);
                controls.startupRow.subtitle = 'Unavailable';
                return;
            }

            const [state, detail = ''] = stdout.trim().split(/\t/, 2);
            this._setStartupSwitch(controls, state === 'enabled');
            controls.startupRow.subtitle = detail || (state === 'enabled' ? 'Enabled' : 'Disabled');
            controls.startupSwitch.sensitive = true;
        });
    }

    _onStartupSwitchChanged(controls) {
        if (controls.syncing || controls.busy)
            return;

        const enabled = controls.startupSwitch.active;
        const command = enabled ? 'enable' : 'disable';

        controls.busy = true;
        controls.startupSwitch.sensitive = false;
        controls.startupRow.subtitle = 'Saving';

        this._runHelper(controls.helperPath, ['autostart', command], (success, stdout, stderr) => {
            controls.busy = false;

            if (!success) {
                console.warn(`Atmos autostart ${command} failed: ${stderr || stdout}`);
                controls.startupRow.subtitle = 'Failed to save';
                this._setStartupSwitch(controls, !enabled);
                controls.startupSwitch.sensitive = true;
                return;
            }

            this._syncStartup(controls);
        });
    }

    _setStartupSwitch(controls, enabled) {
        controls.syncing = true;
        controls.startupSwitch.active = enabled;
        controls.syncing = false;
    }

    _openInstallPage() {
        try {
            Gio.AppInfo.launch_default_for_uri(INSTALL_URL, null);
        } catch (e) {
            console.warn(`Failed to open ${INSTALL_URL}: ${e.message}`);
        }
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
