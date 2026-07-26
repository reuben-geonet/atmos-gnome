import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const HELPER_NAME = 'atmosctl';
const MIN_HELPER_VERSION = [0, 3, 0];
const MIN_HELPER_VERSION_NAME = '0.3.0';
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

function parseHelperVersion(version) {
    if (typeof version !== 'string')
        return null;

    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match)
        return null;

    return match.slice(1).map(part => Number(part));
}

function helperVersionSupported(version) {
    const parsed = parseHelperVersion(version);
    if (!parsed)
        return false;

    for (let i = 0; i < MIN_HELPER_VERSION.length; i++) {
        if (parsed[i] > MIN_HELPER_VERSION[i])
            return true;
        if (parsed[i] < MIN_HELPER_VERSION[i])
            return false;
    }

    return true;
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
        startupGroup.visible = false;

        const startupRow = new Adw.ActionRow({
            title: 'Open GUI at login',
            subtitle: 'Checking',
        });

        const startupSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            sensitive: false,
        });

        const controls = {
            startupGroup,
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
        controls.dependencyBanner.title = 'Atmos CLI is not installed';
        controls.dependencyRow.subtitle = 'Checking';
        controls.dependencyIcon.icon_name = 'network-vpn-acquiring-symbolic';
        controls.installButton.visible = false;
        controls.startupGroup.visible = false;

        if (!controls.helperPath) {
            this._setHelperUnavailable(controls, `${HELPER_NAME} was not found`);
            return;
        }

        this._runJSONHelper(controls.helperPath, ['version'], (success, result, error) => {
            if (!success) {
                console.warn(`Atmos CLI version check failed: ${error}`);
                this._setHelperUnavailable(
                    controls,
                    `${HELPER_NAME} could not be run`,
                    'Atmos CLI could not be run');
                return;
            }

            const helperVersion = result?.version;
            const version = helperVersion ? `${HELPER_NAME} ${helperVersion}` : HELPER_NAME;
            if (!helperVersionSupported(helperVersion)) {
                this._setHelperUnavailable(
                    controls,
                    `${version} at ${controls.helperPath}`,
                    `Requires ${HELPER_NAME} ${MIN_HELPER_VERSION_NAME}+`);
                return;
            }

            controls.dependencyRow.subtitle = `${version} at ${controls.helperPath}`;
            controls.dependencyIcon.icon_name = 'emblem-ok-symbolic';
            controls.installButton.visible = false;
            controls.startupGroup.visible = true;
            this._syncStartup(controls);
        });
    }

    _setHelperUnavailable(controls, detail, title = 'Atmos CLI is not installed') {
        controls.dependencyBanner.title = title;
        controls.dependencyBanner.revealed = true;
        controls.dependencyRow.subtitle = detail;
        controls.dependencyIcon.icon_name = 'dialog-warning-symbolic';
        controls.installButton.visible = true;
        controls.startupGroup.visible = false;
        controls.startupRow.subtitle = 'Unavailable';
        controls.startupSwitch.sensitive = false;
    }

    _syncStartup(controls) {
        controls.startupSwitch.sensitive = false;
        controls.startupRow.subtitle = 'Checking';

        this._runJSONHelper(controls.helperPath, ['gui-autostart', 'status'], (success, status, error) => {
            if (!success) {
                console.warn(`Atmos GUI autostart status failed: ${error}`);
                controls.startupRow.subtitle = 'Unavailable';
                return;
            }

            this._setStartupSwitch(controls, Boolean(status?.enabled));
            controls.startupRow.subtitle = this._formatGuiAutostartStatus(status);
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

        this._runJSONHelper(controls.helperPath, ['gui-autostart', command], (success, result, error) => {
            controls.busy = false;

            if (!success || result?.ok === false) {
                console.warn(`Atmos GUI autostart ${command} failed: ${error}`);
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

    _formatGuiAutostartStatus(status) {
        if (status?.enabled && status?.serviceEnabled)
            return 'GUI opens at login. Service also starts in background.';

        if (status?.enabled)
            return 'GUI opens at login. Service starts when needed.';

        if (status?.serviceEnabled)
            return 'GUI stays closed. Service starts in background.';

        return 'GUI hidden at login, but service startup is disabled.';
    }

    _openInstallPage() {
        try {
            Gio.AppInfo.launch_default_for_uri(INSTALL_URL, null);
        } catch (e) {
            console.warn(`Failed to open ${INSTALL_URL}: ${e.message}`);
        }
    }

    _runJSONHelper(helperPath, args, callback) {
        if (!helperPath) {
            callback(false, '', `${HELPER_NAME} not found`);
            return;
        }

        let proc;
        try {
            proc = Gio.Subprocess.new(
                [helperPath, '--json', ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            callback(false, '', e.message);
            return;
        }

        proc.communicate_utf8_async(null, null, (source, result) => {
            try {
                const [success, stdout, stderr] = source.communicate_utf8_finish(result);
                if (!success || !source.get_successful()) {
                    callback(false, null, stderr || stdout || 'command failed');
                    return;
                }

                try {
                    callback(true, JSON.parse(stdout), '');
                } catch (e) {
                    callback(false, null, `invalid JSON: ${e.message}`);
                }
            } catch (e) {
                callback(false, null, e.message);
            }
        });
    }
}
