import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const POLL_SECONDS = 5;
const RESYNC_DELAY_MS = 900;
const PENDING_TIMEOUT_MS = 45000;
const TOOLTIP_OFFSET = 6;
const TOOLTIP_ANIMATION_TIME = 150;
const VPN_ICON_CONNECTED = 'network-vpn-symbolic';
const VPN_ICON_PENDING = 'network-vpn-acquiring-symbolic';
const VPN_ICON_PAUSED = 'network-vpn-disabled-symbolic';
const VPN_ICON_AGENT_STOPPED = 'dialog-warning-symbolic';
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
        this._agentActive = true;
        this._pendingState = null;
        this._pendingSinceMs = 0;
        this._statusDetail = '';
        this._tooltip = new St.Label({
            style_class: 'dash-label',
            visible: false,
        });
        Main.uiGroup.add_child(this._tooltip);
        this.reactive = false;

        this.connectObject(
            'clicked', () => this._toggleAtmos(),
            'notify::hover', () => this._syncTooltip(),
            'destroy', () => this._destroy(),
            this);

        this._sync();
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._sync();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._pollId, '[atmos-vpn] status poll');
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
        if (this._tooltip) {
            this._tooltip.destroy();
            this._tooltip = null;
        }
    }

    _toggleAtmos() {
        if (this._busy || !this._helperAvailable || !this._agentActive)
            return;

        const desiredConnected = this.checked;
        const command = desiredConnected ? 'resume' : 'pause';

        this._busy = true;
        this.reactive = false;
        this._setPendingState(desiredConnected ? 'connected' : 'disconnected');

        this._runJSONHelper(['vpn', command], (success, result, error) => {
            this._busy = false;
            this.reactive = true;

            if (!success || result?.ok === false) {
                console.warn(`Atmos ${command} failed: ${error}`);
                this._clearPendingState();
                this._setError(error || `${HELPER_NAME} ${command} failed`);
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
        GLib.Source.set_name_by_id(this._resyncId, '[atmos-vpn] resync');
    }

    _sync() {
        if (this._busy)
            return;

        this._runJSONHelper(['vpn', 'status'], (success, status, error) => {
            if (!success) {
                console.warn(`Atmos status failed: ${error}`);
                this._setError(error);
                return;
            }

            this._helperAvailable = true;
            this._setState(status);
        });
    }

    _setState(status) {
        const state = status?.state ?? 'unknown';

        if (status?.serviceActive === false) {
            this._clearPendingState();
            this._setAgentStopped(status);
            return;
        }

        this._agentActive = true;
        this.reactive = true;
        this._setStatusDetail('');

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

    _setAgentStopped(status) {
        this._helperAvailable = true;
        this._agentActive = false;
        this.reactive = false;
        this.checked = false;
        this.iconName = VPN_ICON_AGENT_STOPPED;
        this.subtitle = this._agentSubtitle(status?.serviceState);
        this._setStatusDetail(this._agentDetail(status));
        this._indicator.visible = false;
    }

    _agentSubtitle(serviceState) {
        switch (serviceState) {
        case 'failed':
            return 'Agent failed';
        case 'activating':
            return 'Agent starting';
        case 'deactivating':
            return 'Agent stopping';
        case 'inactive':
            return 'Agent stopped';
        default:
            return 'Agent unavailable';
        }
    }

    _agentDetail(status) {
        const service = status?.service ?? 'atmos-agent.service';
        const serviceState = status?.serviceState ?? 'unavailable';

        return `${service} is ${serviceState}.`;
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
            this._setStatusDetail('');
            this._indicator.icon_name = VPN_ICON_PENDING;
            this._indicator.visible = true;
        } else if (this._pendingState === 'disconnected') {
            this.checked = false;
            this.iconName = VPN_ICON_PAUSED;
            this.subtitle = 'Pausing';
            this._setStatusDetail('');
            this._indicator.visible = false;
        }
    }

    _setError(error) {
        const {subtitle, detail} = this._errorStatus(error);

        this._helperAvailable = false;
        this._agentActive = false;
        this.reactive = false;
        this.checked = false;
        this.iconName = VPN_ICON_PAUSED;
        this.subtitle = subtitle;
        this._setStatusDetail(detail);
        this._indicator.visible = false;
    }

    _errorStatus(error) {
        const detail = String(error || 'The status command failed.').trim();

        if (detail === `${HELPER_NAME} not found`) {
            return {
                subtitle: 'CLI not found',
                detail: `${HELPER_NAME} is not installed or is not in a common path.`,
            };
        }

        if (detail.includes(HELPER_NAME) && detail.includes('No such file or directory'))
            return {subtitle: 'CLI missing', detail};

        if (detail.startsWith('invalid JSON:'))
            return {subtitle: 'CLI output invalid', detail};

        if (detail.includes('Operation not permitted'))
            return {subtitle: 'Status blocked', detail};

        return {subtitle: 'Status unavailable', detail};
    }

    _setStatusDetail(detail) {
        this._statusDetail = detail;
        this.get_accessible()?.set_description(detail);
        this._syncTooltip();
    }

    _syncTooltip() {
        if (!this._tooltip)
            return;

        const showTooltip = Boolean(this.hover && this._statusDetail);

        if (showTooltip) {
            this._tooltip.set({
                text: this._statusDetail,
                visible: true,
                opacity: 0,
            });

            const [stageX, stageY] = this.get_transformed_position();
            const [tileWidth, tileHeight] = this.allocation.get_size();
            const [tooltipWidth, tooltipHeight] = this._tooltip.get_size();
            const xOffset = Math.floor((tileWidth - tooltipWidth) / 2);
            const monitor = Main.layoutManager.findMonitorForActor(this);
            const x = Math.clamp(
                stageX + xOffset,
                monitor.x,
                monitor.x + monitor.width - tooltipWidth);
            const y = stageY - monitor.y > tooltipHeight + TOOLTIP_OFFSET
                ? stageY - tooltipHeight - TOOLTIP_OFFSET
                : stageY + tileHeight + TOOLTIP_OFFSET;
            this._tooltip.set_position(x, y);
        }

        this._tooltip.ease({
            opacity: showTooltip ? 255 : 0,
            duration: TOOLTIP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._tooltip)
                    this._tooltip.visible = Boolean(showTooltip);
            },
        });
    }

    _newHelperProcess(args) {
        if (!this._helperPath)
            this._helperPath = findAtmosctl();

        if (!this._helperPath)
            throw new Error(`${HELPER_NAME} not found`);

        const helperPath = this._helperPath;

        try {
            return Gio.Subprocess.new(
                [helperPath, '--json', ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            this._helperPath = null;
            this._helperPath = findAtmosctl();

            if (!this._helperPath || this._helperPath === helperPath)
                throw e;

            return Gio.Subprocess.new(
                [this._helperPath, '--json', ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        }
    }

    _runJSONHelper(args, callback) {
        let proc;
        try {
            proc = this._newHelperProcess(args);
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
