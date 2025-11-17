const DEFAULT_CONFIG = {
    aqueductsEnabled: false,
    aquaArborica: false,
    fieldIrrigation: false
};

/**
 * Handles persistence and UI wiring for calculator settings and info modal.
 */
export class SettingsManager {
    constructor(storageKey = 'anno117_calculator_settings') {
        this.storageKey = storageKey;
        this.config = { ...DEFAULT_CONFIG };
        this.listeners = new Set();
        this.overlay = null;
        this.settingsPanel = null;
        this.infoModal = null;
    }

    /**
     * Initialize settings UI and restore persisted configuration.
     */
    init() {
        this.loadFromStorage();
        this.cacheDom();
        this.ensureOverlay();
        this.bindSettingInputs();
        this.bindInfoModal();
        this.syncUIWithConfig();
    }

    /**
     * Register a callback that fires whenever settings change.
     */
    onChange(callback) {
        if (typeof callback === 'function') {
            this.listeners.add(callback);
        }
        return () => this.listeners.delete(callback);
    }

    getConfig() {
        return { ...this.config };
    }

    cacheDom() {
        this.settingsPanel = document.getElementById('settings-panel');
        this.settingsToggle = document.getElementById('settings-toggle');
        this.settingsClose = document.getElementById('settings-close');
        this.infoToggle = document.getElementById('info-toggle');
        this.infoClose = document.getElementById('info-close');
        this.infoModal = document.getElementById('info-modal');
    }

    ensureOverlay() {
        let overlay = document.getElementById('settings-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'settings-overlay';
            overlay.className = 'settings-overlay';
            document.body.appendChild(overlay);
        }
        this.overlay = overlay;
    }

    bindSettingInputs() {
        if (!this.settingsPanel) return;

        this.settingsToggle?.addEventListener('click', () => this.openSettings());
        this.settingsClose?.addEventListener('click', () => this.closeSettings());

        const overlayHandler = () => {
            if (!this.settingsPanel.classList.contains('hidden')) {
                this.closeSettings();
            } else if (this.infoModal && !this.infoModal.classList.contains('hidden')) {
                this.closeInfo();
            }
        };

        this.overlay?.addEventListener('click', overlayHandler);

        const aqueductToggle = document.getElementById('settings-use-aqueducts');
        const arboricaToggle = document.getElementById('settings-aqua-arborica');
        const irrigationToggle = document.getElementById('settings-field-irrigation');

        aqueductToggle?.addEventListener('change', (e) => {
            this.updateSetting('aqueductsEnabled', Boolean(e.target.checked));
        });
        arboricaToggle?.addEventListener('change', (e) => {
            this.updateSetting('aquaArborica', Boolean(e.target.checked));
        });
        irrigationToggle?.addEventListener('change', (e) => {
            this.updateSetting('fieldIrrigation', Boolean(e.target.checked));
        });
    }

    bindInfoModal() {
        if (!this.infoModal) return;

        this.infoToggle?.addEventListener('click', () => this.openInfo());
        this.infoClose?.addEventListener('click', () => this.closeInfo());
    }

    openSettings() {
        this.settingsPanel?.classList.remove('hidden');
        this.overlay?.classList.add('active');
    }

    closeSettings() {
        this.settingsPanel?.classList.add('hidden');
        if (!this.infoModal || this.infoModal.classList.contains('hidden')) {
            this.overlay?.classList.remove('active');
        }
    }

    openInfo() {
        this.infoModal?.classList.remove('hidden');
        this.overlay?.classList.add('active');
    }

    closeInfo() {
        this.infoModal?.classList.add('hidden');
        if (!this.settingsPanel || this.settingsPanel.classList.contains('hidden')) {
            this.overlay?.classList.remove('active');
        }
    }

    updateSetting(key, value) {
        if (!(key in this.config)) return;
        if (this.config[key] === value) return;
        this.config[key] = value;
        this.persist();
        this.notify();
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.config = { ...this.config, ...parsed };
            }
        } catch (error) {
            console.error('[Settings] Failed to parse stored settings', error);
        }
    }

    persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.config));
        } catch (error) {
            console.error('[Settings] Failed to persist settings', error);
        }
        this.syncUIWithConfig();
    }

    syncUIWithConfig() {
        const aqueductToggle = document.getElementById('settings-use-aqueducts');
        const arboricaToggle = document.getElementById('settings-aqua-arborica');
        const irrigationToggle = document.getElementById('settings-field-irrigation');

        if (aqueductToggle) aqueductToggle.checked = this.config.aqueductsEnabled;
        if (arboricaToggle) arboricaToggle.checked = this.config.aquaArborica;
        if (irrigationToggle) irrigationToggle.checked = this.config.fieldIrrigation;
    }

    notify() {
        const snapshot = this.getConfig();
        this.listeners.forEach((listener) => listener(snapshot));
    }
}
