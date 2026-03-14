import type { Goods } from "../types/Goods";

type ProductionModifierType = 'percentage' | 'flat';

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

    abstract getVisualModifier(): string | null;
    abstract getType(): ProductionModifierType;    
    abstract getValue(good: Goods): number;
    getProductivity(good: Goods): ProductionModifier {
        return {
            type: this.getType(),
            value: this.getValue(good),
            isAffected: this.getType() === 'percentage' ? this.getValue(good) !== 1 : this.getValue(good) > 0
        }
    };
}

export { AbstractProductionModifier };
export type { ProductionModifier, ProductionModifierType };
