export interface CalculatorConfig {
    aqueductsEnabled: boolean;
    aquaArborica: boolean;
    fieldIrrigation: boolean;
    hushing: boolean;
}

const DEFAULT_CONFIG: CalculatorConfig = {
    aqueductsEnabled: false,
    aquaArborica: false,
    fieldIrrigation: false,
    hushing: false,
};

type ConfigChangeListener = (config: CalculatorConfig) => void;

/**
 * Handles persistence and UI wiring for calculator settings and info modal.
 * Singleton — always access via SettingsManager.getInstance().
 */
export class SettingsManager {
    private static _instance: SettingsManager | null = null;

    public static getInstance(): SettingsManager {
        if (!SettingsManager._instance) {
            SettingsManager._instance = new SettingsManager();
        }
        return SettingsManager._instance;
    }

    private storageKey: string;
    private config: CalculatorConfig;
    private listeners: Set<ConfigChangeListener>;
    private overlay: HTMLElement | null;
    private settingsPanel: HTMLElement | null;
    private settingsToggle: HTMLElement | null;
    private settingsClose: HTMLElement | null;
    private infoModal: HTMLElement | null;
    private infoToggle: HTMLElement | null;
    private infoClose: HTMLElement | null;

    private constructor(storageKey = 'anno117_calculator_settings') {
        this.storageKey = storageKey;
        this.config = { ...DEFAULT_CONFIG };
        this.listeners = new Set();
        this.overlay = null;
        this.settingsPanel = null;
        this.settingsToggle = null;
        this.settingsClose = null;
        this.infoModal = null;
        this.infoToggle = null;
        this.infoClose = null;
    }

    /**
     * Initialize settings UI and restore persisted configuration.
     */
    init(): void {
        this.loadFromStorage();
        this.cacheDom();
        this.ensureOverlay();
        this.bindSettingInputs();
        this.bindInfoModal();
        this.syncUIWithConfig();
    }

    /**
     * Register a callback that fires whenever settings change.
     * Returns an unsubscribe function.
     */
    onChange(callback: ConfigChangeListener): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    getConfig(): CalculatorConfig {
        return { ...this.config };
    }

    private cacheDom(): void {
        this.settingsPanel = document.getElementById('saved-store-panel');
        this.settingsToggle = document.getElementById('saved-store-toggle');
        this.settingsClose = document.getElementById('saved-store-close');
        this.infoToggle = document.getElementById('info-toggle');
        this.infoClose = document.getElementById('info-close');
        this.infoModal = document.getElementById('info-modal');
    }

    private ensureOverlay(): void {
        let overlay = document.getElementById('settings-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'settings-overlay';
            overlay.className = 'settings-overlay';
            document.body.appendChild(overlay);
        }
        this.overlay = overlay;
    }

    private bindSettingInputs(): void {
        if (!this.settingsPanel) return;

        this.settingsToggle?.addEventListener('click', () => this.openSettings());
        this.settingsClose?.addEventListener('click', () => this.closeSettings());

        this.overlay?.addEventListener('click', () => {
            if (this.settingsPanel && !this.settingsPanel.classList.contains('hidden')) {
                this.closeSettings();
            } else if (this.infoModal && !this.infoModal.classList.contains('hidden')) {
                this.closeInfo();
            }
        });

        const aqueductToggle = document.getElementById('settings-use-aqueducts') as HTMLInputElement | null;
        const arboricaToggle = document.getElementById('settings-aqua-arborica') as HTMLInputElement | null;
        const irrigationToggle = document.getElementById('settings-field-irrigation') as HTMLInputElement | null;
        const hushingToggle = document.getElementById('settings-hushing') as HTMLInputElement | null;

        aqueductToggle?.addEventListener('change', (e) => {
            this.updateSetting('aqueductsEnabled', (e.target as HTMLInputElement).checked);
        });
        arboricaToggle?.addEventListener('change', (e) => {
            this.updateSetting('aquaArborica', (e.target as HTMLInputElement).checked);
        });
        irrigationToggle?.addEventListener('change', (e) => {
            this.updateSetting('fieldIrrigation', (e.target as HTMLInputElement).checked);
        });
        hushingToggle?.addEventListener('change', (e) => {
            this.updateSetting('hushing', (e.target as HTMLInputElement).checked);
        });
    }

    private bindInfoModal(): void {
        if (!this.infoModal) return;
        this.infoToggle?.addEventListener('click', () => this.openInfo());
        this.infoClose?.addEventListener('click', () => this.closeInfo());
    }

    openSettings(): void {
        this.settingsPanel?.classList.remove('hidden');
        this.overlay?.classList.add('active');
    }

    closeSettings(): void {
        this.settingsPanel?.classList.add('hidden');
        if (!this.infoModal || this.infoModal.classList.contains('hidden')) {
            this.overlay?.classList.remove('active');
        }
    }

    openInfo(): void {
        this.infoModal?.classList.remove('hidden');
        this.overlay?.classList.add('active');
    }

    closeInfo(): void {
        this.infoModal?.classList.add('hidden');
        if (!this.settingsPanel || this.settingsPanel.classList.contains('hidden')) {
            this.overlay?.classList.remove('active');
        }
    }

    private updateSetting<K extends keyof CalculatorConfig>(key: K, value: CalculatorConfig[K]): void {
        if (this.config[key] === value) return;
        this.config[key] = value;
        this.persist();
        this.notify();
    }

    private loadFromStorage(): void {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<CalculatorConfig>;
                this.config = { ...DEFAULT_CONFIG, ...parsed };
            }
        } catch (error) {
            console.error('[Settings] Failed to parse stored settings', error);
        }
    }

    private persist(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.config));
        } catch (error) {
            console.error('[Settings] Failed to persist settings', error);
        }
        this.syncUIWithConfig();
    }

    private syncUIWithConfig(): void {
        const aqueductToggle = document.getElementById('settings-use-aqueducts') as HTMLInputElement | null;
        const arboricaToggle = document.getElementById('settings-aqua-arborica') as HTMLInputElement | null;
        const irrigationToggle = document.getElementById('settings-field-irrigation') as HTMLInputElement | null;
        const hushingToggle = document.getElementById('settings-hushing') as HTMLInputElement | null;

        if (aqueductToggle) aqueductToggle.checked = this.config.aqueductsEnabled;
        if (arboricaToggle) arboricaToggle.checked = this.config.aquaArborica;
        if (irrigationToggle) irrigationToggle.checked = this.config.fieldIrrigation;
        if (hushingToggle) hushingToggle.checked = this.config.hushing;
    }

    private notify(): void {
        const snapshot = this.getConfig();
        this.listeners.forEach((listener) => listener(snapshot));
    }
}
