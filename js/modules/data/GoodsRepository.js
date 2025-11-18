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
        return this.goods;
    }

    getGoods() {
        return this.goods;
    }

    getGoodById(id) {
        return this.goods.find((good) => good.id === id);
    }

    async loadProductionChain(goodId, visited = new Set()) {
        if (!goodId) return null;
        if (visited.has(goodId)) {
            return null;
        }
        visited.add(goodId);

        const baseRecipe = await this.fetchProduction(goodId);
        if (!baseRecipe) {
            visited.delete(goodId);
            return null;
        }
        const recipe = this.cloneRecipe(baseRecipe);

        if (Array.isArray(recipe.input)) {
            for (const input of recipe.input) {
                if (!input.start_of_chain && input.id) {
                    const nested = await this.loadProductionChain(input.id, visited);
                    if (nested) {
                        input.recipe = nested;
                    }
                }
            }
        }

        visited.delete(goodId);
        return recipe;
    }

    async fetchProduction(goodId) {
        if (this.productionCache.has(goodId)) {
            return this.productionCache.get(goodId);
        }
        try {
            const response = await fetch(`${this.productionBaseUrl}/${goodId}.json`);
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            this.productionCache.set(goodId, data);
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
