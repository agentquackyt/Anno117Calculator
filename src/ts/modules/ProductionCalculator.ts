import type { Goods } from '../types/Goods';
import { Aqueduct } from './modifier/Aqueduct';
import type { AbstractProductionModifier } from './ProductionModifier';
import { SettingsManager } from './SettingsManager';

const SECONDS_PER_MINUTE = 60;

// The buildings map stores counts (numbers) plus a special '_metadata' key for production data.
// We use 'any' here since we need to mix counts and metadata in the same Record
// that is compatible with the existing interface contract (Record<string, number>).
type BuildingsMap = Record<string, any>;

/**
 * Pure calculation utilities for production chains.
 * Singleton — always access via ProductionCalculator.getInstance().
 */
export class ProductionCalculator {
    private static _instance: ProductionCalculator | null = null;
    private productionModifiers: AbstractProductionModifier[] = [];

    public static getInstance(): ProductionCalculator {
        if (!ProductionCalculator._instance) {
            ProductionCalculator._instance = new ProductionCalculator();
        }
        return ProductionCalculator._instance;
    }

    private constructor() {
        // Register production modifiers here — loadConfig() seeds state from URL params
        const aqueduct = new Aqueduct();
        aqueduct.loadConfig();
        this.productionModifiers.push(aqueduct);

        // Keep modifier configs in sync when the settings panel changes
        SettingsManager.getInstance().onChange((config) => {
            aqueduct.applySettings(config);
        });
    }

    /** Returns icon filenames for all modifiers that are boosting the given node. */
    getActiveVisualModifiers(buildingType: string): string[] {
        const goodsLike = { type: buildingType } as Goods;
        return this.productionModifiers.flatMap(m => {
            const icon = m.getVisualModifier();
            if (!icon) return [];
            return m.getProductivity(goodsLike).isAffected ? [icon] : [];
        });
    }

    private get config() {
        return SettingsManager.getInstance().getConfig();
    }

    getProductivity(node: Goods): number {
        if (!node) return 1;
        let productivity = 1;

        for (const modifier of this.productionModifiers) {
            const modType = modifier.getType();
            if (modType === 'flat') {
                productivity += modifier.getValue(node);
            } else if (modType === 'percentage') {
                productivity += (100 * modifier.getValue(node));
            }
        }

        console.debug(`[ProductionCalculator] Productivity for ${node.name || node.id}: ${productivity.toFixed(2)}x`);
        return productivity;
    }

    getAdjustedTime(node: Goods): number {
        if (!node) return 60;
        const time = node.time || 60;
        const productivity = this.getProductivity(node);
        return productivity ? time / productivity : time;
    }

    collectAllBuildings(productionData: Goods, requiredPerMinute: number, result: BuildingsMap = {}, depth = 0): BuildingsMap {
        if (!productionData || depth > 10) return result;

        const adjustedDuration = this.getAdjustedTime(productionData);
        const key = productionData.id || 'unknown';
        const buildings = adjustedDuration > 0
            ? (requiredPerMinute * adjustedDuration) / SECONDS_PER_MINUTE
            : 0;

        result[key] = (result[key] || 0) + buildings;
        if (!result['_metadata']) result['_metadata'] = {};
        if (!result['_metadata'][key]) {
            result['_metadata'][key] = productionData;
        }

        const outputCyclesPerMinute = adjustedDuration > 0
            ? (buildings * SECONDS_PER_MINUTE) / adjustedDuration
            : 0;

        if (Array.isArray(productionData.input)) {
            for (const input of productionData.input) {
                if (!input.id) continue;
                const requiredInputPerMinute = outputCyclesPerMinute;

                if (input.start_of_chain) {
                    const inputBuildings = this.calculateStartOfChainBuildings(input, requiredInputPerMinute, buildings, productionData);
                    result[input.id] = (result[input.id] || 0) + inputBuildings;
                    if (!result['_metadata'][input.id]) {
                        result['_metadata'][input.id] = input;
                    }
                    continue;
                }

                if (Array.isArray(input.input)) {
                    this.collectAllBuildings(input, requiredInputPerMinute, result, depth + 1);
                }
            }
        }

        return result;
    }

    private calculateStartOfChainBuildings(input: Goods, requiredInputPerMinute: number, consumingBuildings: number, parentProduction: Goods): number {
        const parentNeedsCharcoal = (parentProduction as any).fuel?.some((fuel: { id: string }) => fuel.id === 'charcoal') || parentProduction.needs_fuel;

        if (input.id === 'charcoal' && parentNeedsCharcoal) {
            const charcoalConsumptionPerBuildingPerMinute = SECONDS_PER_MINUTE / 120;
            const charcoalRequiredPerMinute = consumingBuildings * charcoalConsumptionPerBuildingPerMinute;
            const charcoalProductionDuration = 30;
            const perBuildingRate = SECONDS_PER_MINUTE / charcoalProductionDuration;
            return perBuildingRate > 0 ? charcoalRequiredPerMinute / perBuildingRate : 0;
        }

        const adjustedInputDuration = this.getAdjustedTime(input);
        const inputRatePerBuilding = adjustedInputDuration > 0
            ? SECONDS_PER_MINUTE / adjustedInputDuration
            : 0;
        return inputRatePerBuilding > 0
            ? requiredInputPerMinute / inputRatePerBuilding
            : 0;
    }

    collectBaseInputs(productionData: Goods, baseInputs: Map<string, Goods> = new Map()): Map<string, Goods> {
        if (!productionData || !Array.isArray(productionData.input)) {
            return baseInputs;
        }
        for (const input of productionData.input) {
            if (!input.id) continue;
            if (input.start_of_chain) {
                if (!baseInputs.has(input.id)) {
                    baseInputs.set(input.id, input);
                }
                continue;
            }
            if (Array.isArray(input.input)) {
                this.collectBaseInputs(input, baseInputs);
            }
        }
        return baseInputs;
    }

    calculateFuelBuildings(productionData: Goods, allBuildings: BuildingsMap): Array<{ id: string; count: number }> {
        const fuelList: Array<{ id: string; burning_time?: number }> =
            (productionData as any).fuel?.length
                ? (productionData as any).fuel
                : productionData.needs_fuel
                    ? [{ id: 'charcoal', burning_time: 120 }]
                    : [];

        if (!fuelList.length) return [];
        const consumingBuildings = productionData.id ? (allBuildings[productionData.id] || 0) : 0;

        return fuelList.map((fuel) => {
            const burningTime = fuel.burning_time || 120;
            const fuelBuildingDuration = 30;
            const fuelPerBuildingPerMinute = burningTime > 0 ? SECONDS_PER_MINUTE / burningTime : 0;
            const totalFuelNeededPerMinute = consumingBuildings * fuelPerBuildingPerMinute;
            const fuelProductionPerBuilding = fuelBuildingDuration > 0 ? SECONDS_PER_MINUTE / fuelBuildingDuration : 0;
            const fuelBuildingsNeeded = fuelProductionPerBuilding > 0
                ? totalFuelNeededPerMinute / fuelProductionPerBuilding
                : 0;
            return { id: fuel.id, count: fuelBuildingsNeeded };
        });
    }

    findRecommendedRate(productionData: Goods): number {
        const cycleTimes = this.collectCycleTimes(productionData);
        if (!cycleTimes.length) return 1;

        const lcmTime = cycleTimes.reduce((acc, time) => this.lcm(acc, time), 1);
        const baseIncrement = SECONDS_PER_MINUTE / lcmTime;

        for (let multiplier = 1; multiplier <= 100; multiplier++) {
            const candidateRate = baseIncrement * multiplier;
            if (this.allBuildingsAreWholeNumbers(productionData, candidateRate)) {
                return candidateRate;
            }
        }
        return 1;
    }

    private collectCycleTimes(productionData: Goods, bucket: number[] = []): number[] {
        if (!productionData) return bucket;
        bucket.push(productionData.time || 60);

        if (Array.isArray(productionData.input)) {
            for (const input of productionData.input) {
                if (Array.isArray(input.input)) {
                    this.collectCycleTimes(input, bucket);
                } else if (input.time) {
                    bucket.push(input.time);
                }
            }
        }
        return bucket;
    }

    private allBuildingsAreWholeNumbers(productionData: Goods, rate: number): boolean {
        const allBuildings = this.collectAllBuildings(this.cloneRecipe(productionData), rate, {});
        for (const [key, value] of Object.entries(allBuildings)) {
            if (key === '_metadata') continue;
            const num = value as number;
            const fraction = Math.abs(num - Math.round(num));
            if (fraction > 0.05 && fraction < 0.95) {
                return false;
            }
        }
        return true;
    }

    calculateTotals(allBuildings: BuildingsMap): { buildingCost: Record<string, number>; maintenance: Record<string, number> } {
        const totals = {
            buildingCost: {} as Record<string, number>,
            maintenance: {} as Record<string, number>,
        };
        if (!allBuildings || !allBuildings['_metadata']) {
            return totals;
        }

        for (const [goodId, count] of Object.entries(allBuildings)) {
            if (goodId === '_metadata') continue;
            const metadata = allBuildings['_metadata'][goodId] as Goods | undefined;
            if (!metadata) continue;
            const ceiled = Math.ceil(count as number);

            if (metadata.building_cost) {
                this.accumulateCosts(totals.buildingCost, metadata.building_cost, ceiled);
            }
            if (metadata.maintanance_cost) {
                this.accumulateCosts(totals.maintenance, metadata.maintanance_cost, ceiled);
            }
        }
        return totals;
    }

    private accumulateCosts(target: Record<string, number>, costs: Record<string, number>, multiplier: number): void {
        for (const [resource, amount] of Object.entries(costs)) {
            const total = amount * multiplier;
            if (total <= 0) continue;
            target[resource] = (target[resource] || 0) + total;
        }
    }

    private lcm(a: number, b: number): number {
        return (a * b) / this.gcd(a, b);
    }

    private gcd(a: number, b: number): number {
        if (!b) return a;
        return this.gcd(b, a % b);
    }

    cloneRecipe(recipe: Goods): Goods {
        return structuredClone(recipe);
    }
}
