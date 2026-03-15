import type { Goods } from "../../types/Goods";
import { ModifierRegistry } from "../ModifierRegistry";
import { AbstractProductionModifier, type ModifierDefinition, type ProductionModifierType, type SettingsSnapshot } from "../ProductionModifier";
import { URLTools } from "../Utils";

interface AqueductConfig {
    field_irrigation: boolean;
    aqua_arborica: boolean;
    hushing: boolean;
}

class Aqueduct extends AbstractProductionModifier {
    static readonly KEYS = {
        enabled: 'aqueduct.enabled',
        fieldIrrigation: 'aqueduct.fieldIrrigation',
        aquaArborica: 'aqueduct.aquaArborica',
        hushing: 'aqueduct.hushing',
    } as const;

    private config: AqueductConfig;

    constructor() {
        super("aqueduct");
        this.config = {
            field_irrigation: false,
            aqua_arborica: false,
            hushing: false
        };
    }

    override loadConfig(): void {
        this.config = URLTools.fromGetParam(
            this.configKey,
            window.location.search,
            { field_irrigation: false, aqua_arborica: false, hushing: false }
        );
    }

    override saveConfig(): void {
        const param = URLTools.toGetParam(this.config as any);
        const url = new URL(window.location.href);
        if(param === "") {
            url.searchParams.delete(this.configKey);
        } else {
            url.searchParams.set(this.configKey, param);
        }
        window.history.replaceState(null, '', url.toString());
    }

    override getType(): ProductionModifierType {
        return 'flat';
    }

    override getDefinition(): ModifierDefinition {
        return {
            id: 'aqueduct',
            label: 'Aqueducts',
            description: 'Water infrastructure boosts for farms, plantations, and mines.',
            icon: 'aquaduct.png',
            toggles: [
                {
                    key: Aqueduct.KEYS.enabled,
                    label: 'Aqueduct Network',
                    description: 'Master switch for all aqueduct boosts.',
                    icon: 'aquaduct.png',
                },
                {
                    key: Aqueduct.KEYS.fieldIrrigation,
                    label: 'Field Irrigation',
                    description: 'Arable Farms get +50% productivity.',
                    icon: 'skill-feldbewaesserung.png',
                    requires: Aqueduct.KEYS.enabled,
                },
                {
                    key: Aqueduct.KEYS.aquaArborica,
                    label: 'Aqua Arborica',
                    description: 'Plantations get +50% productivity.',
                    icon: 'skill-aqua-arborica.png',
                    requires: Aqueduct.KEYS.enabled,
                },
                {
                    key: Aqueduct.KEYS.hushing,
                    label: 'Hushing',
                    description: 'Mines get +50% productivity.',
                    icon: 'skill-hydraulischer-bergbau.png',
                    requires: Aqueduct.KEYS.enabled,
                },
            ],
        };
    }

    override getValue(good: Goods): number {
        switch (good.type) {
            case 'arable_farm':
                return this.config.field_irrigation ? 0.5 : 0;
            case 'plantation':
                return this.config.aqua_arborica ? 0.5 : 0;
            case 'mine':
                return this.config.hushing ? 0.5 : 0;
            default:
                return 0;
        }
    }

    /** Sync config from SettingsManager and persist to URL. */
    override applySettings(config: SettingsSnapshot): void {
        const enabled = this.readSetting(config, Aqueduct.KEYS.enabled, 'aqueductsEnabled');
        this.config = {
            field_irrigation: enabled && this.readSetting(config, Aqueduct.KEYS.fieldIrrigation, 'fieldIrrigation'),
            aqua_arborica: enabled && this.readSetting(config, Aqueduct.KEYS.aquaArborica, 'aquaArborica'),
            hushing: enabled && this.readSetting(config, Aqueduct.KEYS.hushing, 'hushing'),
        };
        this.saveConfig();
    }

    override getVisualModifier(): string | null {
        return "aquaduct.png";
    }

    private readSetting(config: SettingsSnapshot, key: string, legacyKey?: string): boolean {
        if (typeof config[key] === 'boolean') return Boolean(config[key]);
        if (legacyKey && typeof config[legacyKey] === 'boolean') return Boolean(config[legacyKey]);
        return false;
    }
}

function registerAqueductModifier(): void {
    ModifierRegistry.getInstance().register(new Aqueduct());
}

export { Aqueduct };
export { registerAqueductModifier };
export type { AqueductConfig };
