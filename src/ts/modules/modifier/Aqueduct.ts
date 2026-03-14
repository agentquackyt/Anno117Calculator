import type { Goods } from "../../types/Goods";
import { AbstractProductionModifier, type ProductionModifierType } from "../ProductionModifier";
import type { CalculatorConfig } from "../SettingsManager";
import { URLTools } from "../Utils";

interface AqueductConfig {
    field_irrigation: boolean;
    aqua_arborica: boolean;
    hushing: boolean;
}

class Aqueduct extends AbstractProductionModifier {
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
    applySettings(config: CalculatorConfig): void {
        this.config = {
            field_irrigation: config.aqueductsEnabled && config.fieldIrrigation,
            aqua_arborica:    config.aqueductsEnabled && config.aquaArborica,
            hushing:          config.aqueductsEnabled && config.hushing,
        };
        this.saveConfig();
    }

    override getVisualModifier(): string | null {
        return "aquaduct.png";
    }
}

export { Aqueduct };
export type { AqueductConfig };
