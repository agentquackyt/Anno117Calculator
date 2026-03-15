import type { AbstractProductionModifier, ModifierDefinition } from './ProductionModifier';

/**
 * Central registry for all production modifiers.
 * New modifiers only need to register once at bootstrap.
 */
export class ModifierRegistry {
    private static _instance: ModifierRegistry | null = null;
    private readonly modifiers = new Map<string, AbstractProductionModifier>();

    public static getInstance(): ModifierRegistry {
        if (!ModifierRegistry._instance) {
            ModifierRegistry._instance = new ModifierRegistry();
        }
        return ModifierRegistry._instance;
    }

    register(modifier: AbstractProductionModifier): void {
        const id = modifier.getDefinition().id;
        this.modifiers.set(id, modifier);
    }

    getModifiers(): AbstractProductionModifier[] {
        return Array.from(this.modifiers.values());
    }

    getDefinitions(): ModifierDefinition[] {
        return this.getModifiers().map((modifier) => modifier.getDefinition());
    }
}
