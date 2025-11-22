/**
 * Provides fetch & caching utilities for goods and production data.
 */
export class GoodsRepository {
    constructor({
        goodsUrl = 'productions/list.json',
        productionBaseUrl = 'productions'
    } = {}) {
        this.goodsUrl = goodsUrl;
        this.productionBaseUrl = productionBaseUrl;
        this.goods = [];
        this.productionCache = new Map();
    }

    async loadGoodsList() {
        if (this.goods.length) {
            return this.goods;
        }

        const response = await fetch(this.goodsUrl);
        if (!response.ok) {
            throw new Error(`Failed to load goods list (${response.status})`);
        }
        const payload = await response.json();
        this.goods = payload.goods || [];
        this.goodsMap = new Map(this.goods.map(g => [g.id, g]));
        return this.goods;
    }

    getGoods() {
        return this.goods;
    }

    getGoodById(id) {
        return this.goodsMap ? this.goodsMap.get(id) : this.goods.find((good) => good.id === id);
    }

    async loadProductionChain(goodId, region, visited = new Set()) {
        if (!goodId) return null;
        if (visited.has(goodId)) {
            return null;
        }
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

    async expandRecipe(node, region, visited) {
        if (Array.isArray(node.input)) {
            for (const input of node.input) {
                if (Array.isArray(input.input)) {
                    // Already defined, just recurse
                    await this.expandRecipe(input, region, visited);
                } else if (!input.start_of_chain && input.id) {
                    // Reference, fetch it
                    const nested = await this.loadProductionChain(input.id, region, visited);
                    if (nested) {
                        Object.assign(input, nested);
                    }
                }
            }
        }
    }

    async fetchProduction(goodId, region) {
        const cacheKey = `${goodId}:${region || 'default'}`;
        if (this.productionCache.has(cacheKey)) {
            return this.productionCache.get(cacheKey);
        }
        
        const good = this.getGoodById(goodId);
        let filename = goodId;
        
        if (good && good.files) {
            let candidates = Object.entries(good.files);
            
            if (region) {
                // Filter by region if provided
                const regionMatches = candidates.filter(([file, regions]) => 
                    regions.some(r => r.toLowerCase() === region.toLowerCase())
                );
                if (regionMatches.length > 0) {
                    candidates = regionMatches;
                }
            }
            
            // Tie-breaker: Exact ID match
            const exactMatch = candidates.find(([file]) => file === goodId);
            if (exactMatch) {
                filename = exactMatch[0];
            } else if (candidates.length > 0) {
                filename = candidates[0][0];
            }
        }

        try {
            const response = await fetch(`${this.productionBaseUrl}/${filename}.json`);
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            this.productionCache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`[GoodsRepository] Failed to fetch production data for ${goodId}`, error);
            return null;
        }
    }

    cloneRecipe(recipe) {
        if (typeof structuredClone === 'function') {
            return structuredClone(recipe);
        }
        return JSON.parse(JSON.stringify(recipe));
    }
}
