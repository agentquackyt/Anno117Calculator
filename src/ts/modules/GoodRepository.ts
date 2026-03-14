/**
 * Provides fetch & caching utilities for goods and production data.
 */

import type { Goods } from '../types/Goods';
import type { RecipeListItem, ProductionNode } from '../types/RecipeList';

/**
 * Singleton repository for goods and production data.
 */
class GoodsRepository {
    private static _instance: GoodsRepository | null = null;
    private goodsUrl: string;
    private productionBaseUrl: string;
    private goods: RecipeListItem[] = [];
    private recipeCache: Map<string, Goods> = new Map();

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
        return this.goods;
    }
}

export { GoodsRepository };