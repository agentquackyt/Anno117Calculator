/**
 * Provides fetch & caching utilities for goods and production data.
 */

import type { Goods } from '../types/Goods';
import type { RecipeListItem } from '../types/RecipeList';

interface CompatibleItem {
    guid: string;
    displayName: string;
    iconFilename: string;
}

interface CompatibilityChain {
    id: string;
    displayName: string;
    icon: string;
    items: CompatibleItem[];
}

interface CompatibilityPayload {
    chains?: CompatibilityChain[];
}

interface ItemBuffFactoryUpgrade {
    ProductivityUpgrade?: number;
}

interface ItemBuff {
    FactoryUpgrade?: ItemBuffFactoryUpgrade;
}

interface ItemProducedGood {
    name?: string;
    guid?: string;
}

interface ItemTarget {
    producedGoods?: ItemProducedGood[];
}

interface ItemPayload {
    buffs?: ItemBuff[];
    targets?: ItemTarget[];
}

/**
 * Singleton repository for goods and production data.
 */
class GoodsRepository {
    private static _instance: GoodsRepository | null = null;
    private goodsUrl: string;
    private productionBaseUrl: string;
    private goods: RecipeListItem[] = [];
    private goodsMap: Map<string, RecipeListItem> = new Map();
    private productionCache: Map<string, Goods> = new Map();
    private compatibilityByChain: Map<string, CompatibilityChain> = new Map();
    private itemProductivityByGuid: Map<string, number> = new Map();
    private itemTargetsByGuid: Map<string, Set<string>> = new Map();

    private constructor(goodsUrl = './assets/productions/list.json', productionBaseUrl = './assets/productions') {
        this.goodsUrl = goodsUrl;
        this.productionBaseUrl = productionBaseUrl;
    }

    public static getInstance(): GoodsRepository {
        if (!GoodsRepository._instance) {
            GoodsRepository._instance = new GoodsRepository();
        }
        return GoodsRepository._instance;
    }

    /**
     * Loads the goods list from the server and caches it.
     */
    public async loadGoodsList(): Promise<RecipeListItem[]> {
        if (this.goods.length > 0) {
            return this.goods;
        }
        const response = await fetch(this.goodsUrl);
        if (!response.ok) {
            throw new Error(`Failed to load goods list (${response.status})`);
        }
        const payload = await response.json();
        this.goods = payload.goods || [];
        this.goodsMap = new Map(this.goods.map((g) => [g.id, g]));
        return this.goods;
    }

    public getGoodsList(): RecipeListItem[] {
        return this.goods;
    }

    public getGoodById(id: string): RecipeListItem | undefined {
        return this.goodsMap.get(id) ?? this.goods.find((g) => g.id === id);
    }

    /**
     * Loads generated compatibility data for production chains and items.
     */
    public async loadItemCompatibility(): Promise<void> {
        if (this.compatibilityByChain.size > 0) {
            return;
        }

        const response = await fetch(`${this.productionBaseUrl}/item-compatibility.json`);
        if (!response.ok) {
            throw new Error(`Failed to load item compatibility (${response.status})`);
        }

        const payload = (await response.json()) as CompatibilityPayload;
        const chains = payload.chains ?? [];

        this.compatibilityByChain = new Map(
            chains.map((chain) => [chain.id, chain]),
        );
    }

    public getCompatibleItemChains(): CompatibilityChain[] {
        return Array.from(this.compatibilityByChain.values());
    }

    public getCompatibleItems(chainId: string): CompatibleItem[] {
        return this.compatibilityByChain.get(chainId)?.items ?? [];
    }

    /**
     * Preloads productivity percentages for all known compatible items.
     */
    public async preloadItemProductivity(): Promise<void> {
        await this.loadItemCompatibility();

        const guids = new Set<string>();
        this.compatibilityByChain.forEach((chain) => {
            chain.items.forEach((item) => {
                guids.add(item.guid);
            });
        });

        await Promise.all(Array.from(guids).map((guid) => this.loadItemProductivity(guid)));
    }

    public getItemProductivity(guid: string): number {
        return this.itemProductivityByGuid.get(guid) ?? 0;
    }

    public getItemTargetGoodNames(guid: string): Set<string> {
        return this.itemTargetsByGuid.get(guid) ?? new Set();
    }

    /**
     * Recursively loads and expands the full production chain for a good.
     * @param goodId The ID of the good to load.
     * @param region The region to fetch data for (e.g. "Roman" or "Celtic").
     * @param visited Set used to detect circular references.
     */
    public async loadProductionChain(goodId: string, region: string, visited: Set<string> = new Set()): Promise<Goods | null> {
        if (!goodId || visited.has(goodId)) return null;
        visited.add(goodId);

        const baseRecipe = await this.fetchProduction(goodId, region);
        if (!baseRecipe) {
            visited.delete(goodId);
            return null;
        }
        const recipe = this.cloneRecipe(baseRecipe);
        await this.expandRecipe(recipe, region, visited);
        visited.delete(goodId);
        return recipe;
    }

    private async expandRecipe(node: Goods, region: string, visited: Set<string>): Promise<void> {
        if (!Array.isArray(node.input)) return;
        for (const input of node.input) {
            if (Array.isArray(input.input)) {
                // Already expanded, recurse into it
                await this.expandRecipe(input, region, visited);
            } else if (!input.start_of_chain && input.id) {
                // Reference node — fetch and expand
                const nested = await this.loadProductionChain(input.id, region, visited);
                if (nested) {
                    Object.assign(input, nested);
                }
            }
        }
    }

    private async fetchProduction(goodId: string, region: string): Promise<Goods | null> {
        const cacheKey = `${goodId}:${region.toLowerCase()}`;
        if (this.productionCache.has(cacheKey)) {
            return this.productionCache.get(cacheKey)!;
        }

        const filename = this.resolveFilename(goodId, region);

        try {
            const response = await fetch(`${this.productionBaseUrl}/${filename}.json`);
            if (!response.ok) return null;
            const data: Goods = await response.json();
            this.productionCache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`[GoodsRepository] Failed to fetch production data for ${goodId}`, error);
            return null;
        }
    }

    private async loadItemProductivity(guid: string): Promise<number> {
        const cached = this.itemProductivityByGuid.get(guid);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const response = await fetch(`./assets/data/items/${guid}.json`);
            if (!response.ok) {
                this.itemProductivityByGuid.set(guid, 0);
                return 0;
            }

            const payload = (await response.json()) as ItemPayload;
            const value = this.extractProductivity(payload);
            this.itemProductivityByGuid.set(guid, value);
            this.itemTargetsByGuid.set(guid, this.extractTargetGoodNames(payload));
            return value;
        } catch (error) {
            console.warn(`[GoodsRepository] Failed to load item details for ${guid}`, error);
            this.itemProductivityByGuid.set(guid, 0);
            return 0;
        }
    }

    private extractTargetGoodNames(item: ItemPayload): Set<string> {
        const names = new Set<string>();
        for (const target of item.targets ?? []) {
            for (const pg of target.producedGoods ?? []) {
                if (typeof pg.name === 'string' && pg.name) {
                    names.add(pg.name.trim().toLowerCase().replace(/[_-]/g, ' '));
                }
            }
        }
        return names;
    }

    private extractProductivity(item: ItemPayload): number {
        const buffs = item.buffs ?? [];
        return buffs.reduce((sum, buff) => {
            const value = buff.FactoryUpgrade?.ProductivityUpgrade;
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return sum;
            }
            return sum + (value / 100);
        }, 0);
    }

    /**
     * Resolves the filename to use for a good/region combination.
     * Uses case-insensitive matching on file keys.
     */
    private resolveFilename(goodId: string, region: string): string {
        const good = this.getGoodById(goodId);
        if (!good?.files) return goodId;

        const entries = Object.entries(good.files);
        const regionLower = region.toLowerCase();

        // Try case-insensitive key match against region
        const regionMatch = entries.find(([key]) => key.toLowerCase() === regionLower);
        if (regionMatch) return regionMatch[1];

        // Fallback: first entry
        const first = entries[0];
        if (first) return first[1];

        return goodId;
    }

    private cloneRecipe(recipe: Goods): Goods {
        return structuredClone(recipe);
    }
}

export { GoodsRepository };
