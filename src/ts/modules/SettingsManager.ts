import { ModifierRegistry } from './ModifierRegistry';

export type SettingsSnapshot = Record<string, boolean | number | string>;

type ConfigChangeListener = (config: SettingsSnapshot) => void;

interface SavedPreset {
    id: string;
    name: string;
    createdAt: number;
    config: SettingsSnapshot;
}

/**
 * Handles persistence and UI wiring for calculator settings and storage presets.
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

    private readonly storageKey: string;
    private readonly presetsKey: string;
    private config: SettingsSnapshot;
    private presets: SavedPreset[];
    private listeners: Set<ConfigChangeListener>;
    private overlay: HTMLElement | null;
    private settingsPanel: HTMLElement | null;
    private settingsToggle: HTMLElement | null;
    private settingsClose: HTMLElement | null;
    private settingsContent: HTMLElement | null;
    private infoModal: HTMLElement | null;
    private infoToggle: HTMLElement | null;
    private infoClose: HTMLElement | null;

    private constructor(storageKey = 'anno117_calculator_settings') {
        this.storageKey = storageKey;
        this.presetsKey = `${storageKey}_presets`;
        this.config = {};
        this.presets = [];
        this.listeners = new Set();
        this.overlay = null;
        this.settingsPanel = null;
        this.settingsToggle = null;
        this.settingsClose = null;
        this.settingsContent = null;
        this.infoModal = null;
        this.infoToggle = null;
        this.infoClose = null;
    }

    init(): void {
        this.loadFromStorage();
        this.loadPresets();
        this.cacheDom();
        this.ensureOverlay();
        this.bindShellButtons();
        this.bindInfoModal();
        this.renderStoragePanel();
        this.notify();
    }

    onChange(callback: ConfigChangeListener): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    getConfig(): SettingsSnapshot {
        return { ...this.config };
    }

    getSetting(key: string): boolean {
        return Boolean(this.config[key]);
    }

    getSettingRaw(key: string): boolean | number | string {
        return this.config[key] ?? false;
    }

    setSetting(key: string, value: boolean): void {
        this.setSettingValue(key, value);
    }

    setSettingValue(key: string, value: boolean | number | string): void {
        if (this.config[key] === value) return;
        this.config[key] = value;
        this.persist();
        this.notify();
        this.renderStoragePanel();
    }

    toggleSetting(key: string): void {
        this.setSetting(key, !this.getSetting(key));
    }

    saveCurrentAsPreset(name: string): void {
        const normalized = name.trim();
        if (!normalized) return;
        const preset: SavedPreset = {
            id: `preset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: normalized,
            createdAt: Date.now(),
            config: { ...this.config },
        };
        this.presets.unshift(preset);
        this.persistPresets();
        this.renderStoragePanel();
    }

    loadPreset(id: string): void {
        const preset = this.presets.find((entry) => entry.id === id);
        if (!preset) return;
        this.config = { ...preset.config };
        this.persist();
        this.notify();
        this.renderStoragePanel();
    }

    deletePreset(id: string): void {
        this.presets = this.presets.filter((entry) => entry.id !== id);
        this.persistPresets();
        this.renderStoragePanel();
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

    private cacheDom(): void {
        this.settingsPanel = document.getElementById('saved-store-panel');
        this.settingsToggle = document.getElementById('saved-store-toggle');
        this.settingsClose = document.getElementById('saved-store-close');
        this.settingsContent = document.getElementById('saved-store-content');
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

    private bindShellButtons(): void {
        this.settingsToggle?.addEventListener('click', () => this.openSettings());
        this.settingsClose?.addEventListener('click', () => this.closeSettings());
        this.overlay?.addEventListener('click', () => {
            if (this.settingsPanel && !this.settingsPanel.classList.contains('hidden')) {
                this.closeSettings();
            } else if (this.infoModal && !this.infoModal.classList.contains('hidden')) {
                this.closeInfo();
            }
        });
    }

    private bindInfoModal(): void {
        if (!this.infoModal) return;
        this.infoToggle?.addEventListener('click', () => this.openInfo());
        this.infoClose?.addEventListener('click', () => this.closeInfo());
    }

    private renderStoragePanel(): void {
        if (!this.settingsContent) return;

        const presetItems = this.presets.length
            ? this.presets.map((preset) => {
                const date = new Date(preset.createdAt);
                const dateLabel = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                return `
                    <li class="preset-item" data-preset-id="${preset.id}">
                        <div class="preset-meta">
                            <strong>${preset.name}</strong>
                            <span>${dateLabel}</span>
                        </div>
                        <div class="preset-actions">
                            <button type="button" class="preset-load-btn" data-load-preset="${preset.id}">Load</button>
                            <button type="button" class="preset-delete-btn" data-delete-preset="${preset.id}">Delete</button>
                        </div>
                    </li>
                `;
            }).join('')
            : '<li class="preset-empty">No saved configurations yet.</li>';

        const activeToggles = ModifierRegistry.getInstance()
            .getDefinitions()
            .flatMap((modifier) => modifier.toggles ?? [])
            .filter((toggle) => this.getSetting(toggle.key));

        const activeMarkup = activeToggles.length
            ? activeToggles.map((toggle) => `
                <li>
                    <img src="./assets/icons/${toggle.icon}" alt="${toggle.label}">
                    <span>${toggle.label}</span>
                </li>
            `).join('')
            : '<li class="preset-empty">No active modifier toggles.</li>';

        this.settingsContent.innerHTML = `
            <section class="saved-store-section">
                <h3>Saved Configurations</h3>
                <p class="setting-description">Save your current modifier setup and load it later with one click.</p>
                <div class="preset-save-row">
                    <input id="preset-name-input" type="text" placeholder="Preset name" maxlength="40" />
                    <button id="save-current-preset-btn" type="button">Save Current</button>
                </div>
                <ul class="preset-list">
                    ${presetItems}
                </ul>
            </section>
            <section class="saved-store-section">
                <h3>Current Modifier Setup</h3>
                <ul class="active-toggle-list">
                    ${activeMarkup}
                </ul>
            </section>
        `;

        this.bindStorageContentEvents();
    }

    private bindStorageContentEvents(): void {
        if (!this.settingsContent) return;

        const saveButton = this.settingsContent.querySelector('#save-current-preset-btn') as HTMLButtonElement | null;
        const nameInput = this.settingsContent.querySelector('#preset-name-input') as HTMLInputElement | null;

        saveButton?.addEventListener('click', () => {
            const name = nameInput?.value || '';
            this.saveCurrentAsPreset(name);
            if (nameInput) nameInput.value = '';
        });

        this.settingsContent.querySelectorAll('[data-load-preset]').forEach((button) => {
            button.addEventListener('click', () => {
                const id = (button as HTMLElement).dataset.loadPreset;
                if (id) this.loadPreset(id);
            });
        });

        this.settingsContent.querySelectorAll('[data-delete-preset]').forEach((button) => {
            button.addEventListener('click', () => {
                const id = (button as HTMLElement).dataset.deletePreset;
                if (id) this.deletePreset(id);
            });
        });
    }

    private loadFromStorage(): void {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (!saved) return;
            const parsed = JSON.parse(saved) as Record<string, unknown>;
            this.config = this.migrateLegacyConfig(parsed);
        } catch (error) {
            console.error('[Settings] Failed to parse stored settings', error);
            this.config = {};
        }
    }

    private migrateLegacyConfig(raw: Record<string, unknown>): SettingsSnapshot {
        const normalized: SettingsSnapshot = {};
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
                normalized[key] = value;
            }
        }

        const enabled = this.readBoolean(raw, 'aqueduct.enabled', 'aqueductsEnabled');
        const field = this.readBoolean(raw, 'aqueduct.fieldIrrigation', 'fieldIrrigation');
        const arborica = this.readBoolean(raw, 'aqueduct.aquaArborica', 'aquaArborica');
        const hushing = this.readBoolean(raw, 'aqueduct.hushing', 'hushing');

        normalized['aqueduct.enabled'] = enabled;
        normalized['aqueduct.fieldIrrigation'] = field;
        normalized['aqueduct.aquaArborica'] = arborica;
        normalized['aqueduct.hushing'] = hushing;

        return normalized;
    }

    private readBoolean(source: Record<string, unknown>, key: string, fallbackKey?: string): boolean {
        if (typeof source[key] === 'boolean') return Boolean(source[key]);
        if (fallbackKey && typeof source[fallbackKey] === 'boolean') return Boolean(source[fallbackKey]);
        return false;
    }

    private loadPresets(): void {
        try {
            const saved = localStorage.getItem(this.presetsKey);
            if (!saved) return;
            const parsed = JSON.parse(saved) as SavedPreset[];
            this.presets = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('[Settings] Failed to parse saved presets', error);
            this.presets = [];
        }
    }

    private persist(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.config));
        } catch (error) {
            console.error('[Settings] Failed to persist settings', error);
        }
    }

    private persistPresets(): void {
        try {
            localStorage.setItem(this.presetsKey, JSON.stringify(this.presets));
        } catch (error) {
            console.error('[Settings] Failed to persist presets', error);
        }
    }

    private notify(): void {
        const snapshot = this.getConfig();
        this.listeners.forEach((listener) => listener(snapshot));
    }
}
