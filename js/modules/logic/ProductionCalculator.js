const SECONDS_PER_MINUTE = 60;

/**
 * Pure calculation utilities for production chains.
 */
export class ProductionCalculator {
    constructor(configProvider = () => ({
        aqueductsEnabled: false,
        aquaArborica: false,
        fieldIrrigation: false
    })) {
        this.configProvider = configProvider;
    }

    get config() {
        return this.configProvider();
    }

    getProductivity(node) {
        if (!node) return 1;
        let productivity = 1;
        const type = node.type || '';
        const config = this.config;

        if (config.aqueductsEnabled) {
            if (type === 'plantation' && config.aquaArborica) {
                productivity *= 1.5;
            }
            if (type === 'farm' && config.fieldIrrigation) {
                productivity *= 1.5;
            }
        }
        return productivity;
    }

    getAdjustedTime(node) {
        if (!node) return 60;
        let time = node.time || 60;
        const productivity = this.getProductivity(node);

        return productivity ? time / productivity : time;
    }

    collectAllBuildings(productionData, requiredPerMinute, result = {}, depth = 0) {
        if (!productionData || depth > 10) return result;

        const adjustedDuration = this.getAdjustedTime(productionData);
        const key = productionData.id || 'unknown';
        const buildings = adjustedDuration > 0
            ? (requiredPerMinute * adjustedDuration) / SECONDS_PER_MINUTE
            : 0;

        result[key] = (result[key] || 0) + buildings;
        if (!result._metadata) result._metadata = {};
        if (!result._metadata[key]) {
            result._metadata[key] = productionData;
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
                    if (!result._metadata[input.id]) {
                        result._metadata[input.id] = input;
                    }
                    continue;
                }

                if (input.recipe) {
                    this.collectAllBuildings(input.recipe, requiredInputPerMinute, result, depth + 1);
                }
            }
        }

        return result;
    }

    calculateStartOfChainBuildings(input, requiredInputPerMinute, consumingBuildings, parentProduction) {
        if (input.id === 'charcoal' && parentProduction?.fuel?.some((fuel) => fuel.id === 'charcoal')) {
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

    collectBaseInputs(productionData, baseInputs = new Map()) {
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
            if (input.recipe) {
                this.collectBaseInputs(input.recipe, baseInputs);
            }
        }
        return baseInputs;
    }

    calculateFuelBuildings(productionData, allBuildings) {
        if (!productionData?.fuel?.length) return [];
        const consumingBuildings = productionData.id ? (allBuildings[productionData.id] || 0) : 0;

        return productionData.fuel.map((fuel) => {
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

    findRecommendedRate(productionData) {
        const cycleTimes = this.collectCycleTimes(productionData);
        if (!cycleTimes.length) return 1;

        const lcmTime = cycleTimes.reduce((acc, time) => this.lcm(acc, time), 1);
        const baseIncrement = SECONDS_PER_MINUTE / lcmTime;

        for (let multiplier = 1; multiplier <= 100; multiplier += 1) {
            const candidateRate = baseIncrement * multiplier;
            if (this.allBuildingsAreWholeNumbers(productionData, candidateRate)) {
                return candidateRate;
            }
        }
        return 1;
    }

    collectCycleTimes(productionData, bucket = []) {
        if (!productionData) return bucket;
        bucket.push(productionData.time || 60);

        if (Array.isArray(productionData.input)) {
            for (const input of productionData.input) {
                if (input.recipe) {
                    this.collectCycleTimes(input.recipe, bucket);
                } else if (input.time) {
                    bucket.push(input.time);
                }
            }
        }
        return bucket;
    }

    allBuildingsAreWholeNumbers(productionData, rate) {
        const allBuildings = this.collectAllBuildings(this.cloneRecipe(productionData), rate, {});
        for (const [key, value] of Object.entries(allBuildings)) {
            if (key === '_metadata') continue;
            const fraction = Math.abs(value - Math.round(value));
            if (fraction > 0.05 && fraction < 0.95) {
                return false;
            }
        }
        return true;
    }

    calculateTotals(allBuildings) {
        const totals = {
            buildingCost: {},
            maintenance: {}
        };
        if (!allBuildings || !allBuildings._metadata) {
            return totals;
        }

        for (const [goodId, count] of Object.entries(allBuildings)) {
            if (goodId === '_metadata') continue;
            const metadata = allBuildings._metadata[goodId];
            if (!metadata) continue;
            const ceiled = Math.ceil(count);

            if (metadata.building_cost) {
                this.accumulateCosts(totals.buildingCost, metadata.building_cost, ceiled);
            }
            if (metadata.maintanance_cost) {
                this.accumulateCosts(totals.maintenance, metadata.maintanance_cost, ceiled);
            }
        }
        return totals;
    }

    accumulateCosts(target, costs, multiplier) {
        for (const [resource, amount] of Object.entries(costs)) {
            const total = amount * multiplier;
            if (total <= 0) continue;
            target[resource] = (target[resource] || 0) + total;
        }
    }

    lcm(a, b) {
        return (a * b) / this.gcd(a, b);
    }

    gcd(a, b) {
        if (!b) return a;
        return this.gcd(b, a % b);
    }

    cloneRecipe(recipe) {
        if (typeof structuredClone === 'function') {
            return structuredClone(recipe);
        }
        return JSON.parse(JSON.stringify(recipe));
    }
}
