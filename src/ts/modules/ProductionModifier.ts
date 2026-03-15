import type { Goods } from "../types/Goods";

type ProductionModifierType = 'percentage' | 'flat';
type SettingsSnapshot = Record<string, boolean | number | string>;

interface ModifierToggleDefinition {
    key: string;
    label: string;
    description: string;
    icon: string;
    requires?: string;
}

interface ModifierNumInputDefinition {
    key: string;
    label: string;
    description: string;
    icon: string;
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: number;
    requires?: string;
}

interface ModifierSelectDefinition {
    key: string;
    label: string;
    description: string;
    icon: string;
    options: Array<{ value: string; label: string }>;
    defaultValue?: string;
    requires?: string;
}

interface ModifierDefinition {
    id: string;
    label: string;
    description: string;
    icon: string;
    toggles?: ModifierToggleDefinition[];
    numInputs?: ModifierNumInputDefinition[];
    selects?: ModifierSelectDefinition[];
}

/**
 * Represents a production modifier that can affect the output of goods in the Anno 1177 calculator. Each modifier has a type (percentage or flat) and a value that determines how it modifies the production of specific goods. The isAffected property indicates whether the modifier currently applies to the good in question, allowing for dynamic adjustments based on user settings or game conditions.
 */
interface ProductionModifier {
    type: ProductionModifierType;
    value: number;
    isAffected?: boolean; 
}

abstract class AbstractProductionModifier {
    readonly configKey: string;
    constructor(key: string) {this.configKey = key;}

    abstract saveConfig(): void;    
    abstract loadConfig(): void;    
    abstract applySettings(config: SettingsSnapshot): void;
    abstract getDefinition(): ModifierDefinition;

    abstract getVisualModifier(): string | null;
    abstract getType(): ProductionModifierType;    
    abstract getValue(good: Goods): number;

    /**
     * Returns the icon path to display on a specific graph node, or null if this modifier
     * does not visually affect the given good. Default delegates to getVisualModifier().
     */
    getVisualModifierForNode(good: Goods): string | null {
        return this.getVisualModifier();
    }
    getProductivity(good: Goods): ProductionModifier {
        const value = this.getValue(good);
        return {
            type: this.getType(),
            value,
            isAffected: this.getType() === 'percentage' ? value !== 1 : value > 0
        }
    };
}

export { AbstractProductionModifier };
export type { ProductionModifier, ProductionModifierType, SettingsSnapshot, ModifierDefinition, ModifierToggleDefinition, ModifierNumInputDefinition, ModifierSelectDefinition };
