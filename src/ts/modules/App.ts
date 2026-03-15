import { GoodsRepository } from './GoodRepository';
import { SettingsManager } from './SettingsManager';
import { ProductionCalculator } from './ProductionCalculator';
import { GraphRenderer } from './GraphRenderer';
import { GoodsListView, ProductionChainView } from './ProductionChainView';
import { Item } from './modifier/Item';
import type { RecipeListItem } from '../types/RecipeList';
import type { Goods } from '../types/Goods';

// ---------------------------------------------------------------------------
// ParameterParser — owns all URL state serialisation / deserialisation
// ---------------------------------------------------------------------------

interface AppUrlState {
    good?: string;
    region?: string;
    items?: string[];
}

class ParameterParser {
    static readonly PARAMS = {
        GOOD: 'good',
        REGION: 'region',
        ITEMS: 'items',
    } as const;

    private static readonly RESERVED = Object.values(ParameterParser.PARAMS);

    /** Extract app state from the current URL. */
    static parse(url: URL): AppUrlState {
        const itemsRaw = url.searchParams.get(ParameterParser.PARAMS.ITEMS) ?? '';
        const items = itemsRaw
            .split('~')
            .map((entry) => entry.trim())
            .filter(Boolean);
        return {
            good:   url.searchParams.get(ParameterParser.PARAMS.GOOD)   ?? undefined,
            region: url.searchParams.get(ParameterParser.PARAMS.REGION) ?? undefined,
            items,
        };
    }

    /** Build a URL that reflects the given app state, preserving unrelated params. */
    static create(state: AppUrlState, base: URL = new URL(window.location.href)): URL {
        const url = new URL(base.href);

        if (state.region) {
            url.searchParams.set(ParameterParser.PARAMS.REGION, state.region);
        } else {
            url.searchParams.delete(ParameterParser.PARAMS.REGION);
        }

        if (state.good) {
            url.searchParams.set(ParameterParser.PARAMS.GOOD, state.good);
        } else {
            url.searchParams.delete(ParameterParser.PARAMS.GOOD);
        }

        if (state.items && state.items.length) {
            url.searchParams.set(ParameterParser.PARAMS.ITEMS, state.items.join('~'));
        } else {
            url.searchParams.delete(ParameterParser.PARAMS.ITEMS);
        }

        return url;
    }

    /** Any query params not managed by this parser (pass-through preservation). */
    static parseExtras(url: URL): Record<string, string> {
        const extras: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
            if (!ParameterParser.RESERVED.includes(key as typeof ParameterParser.RESERVED[number])) {
                extras[key] = value;
            }
        });
        return extras;
    }
}

// ---------------------------------------------------------------------------
// App — singleton application root
// ---------------------------------------------------------------------------

export class App {
    private static _instance: App | null = null;

    public static getInstance(): App {
        if (!App._instance) {
            App._instance = new App();
        }
        return App._instance;
    }

    private readonly goodsRepository: GoodsRepository;
    private readonly settingsManager: SettingsManager;
    private readonly selectionContainer: HTMLElement;
    private readonly calculatorContainer: HTMLElement;
    private readonly goodsListView: GoodsListView;
    private readonly productionView: ProductionChainView;

    private currentGood: RecipeListItem | null = null;
    private currentRegion = 'Roman';
    private allGoods: RecipeListItem[] = [];

    private constructor() {
        this.goodsRepository   = GoodsRepository.getInstance();
        this.settingsManager   = SettingsManager.getInstance();

        this.selectionContainer  = document.getElementById('selection-container')  as HTMLElement;
        this.calculatorContainer = document.getElementById('calculator-container') as HTMLElement;

        this.goodsListView = new GoodsListView({
            container: this.selectionContainer,
            onSelect: (good) => this.handleGoodSelection(good),
        });

        this.productionView = new ProductionChainView({
            container: this.calculatorContainer,
            calculator: ProductionCalculator.getInstance(),
            graphRenderer: GraphRenderer.getInstance(),
        });

        this.productionView.setBackHandler(() => this.showSelectionView());
    }

    public async initialize(): Promise<void> {
        this.registerServiceWorker();
        this.settingsManager.init();
        this.settingsManager.onChange(() => this.handleSettingsChange());
        this.bindRegionToggle();
        await this.loadGoodsList();
        this.restoreFromUrl();
    }

    // -----------------------------------------------------------------------
    // Region toggle
    // -----------------------------------------------------------------------

    private bindRegionToggle(): void {
        const toggleBtn = document.getElementById('region-toggle-btn');
        const icon = toggleBtn?.querySelector<HTMLImageElement>('.region-icon');
        const text = toggleBtn?.querySelector<HTMLElement>('.region-text');

        const updateButtonState = (region: string) => {
            if (icon) icon.src = region === 'Roman' ? './assets/icons/latium.webp' : './assets/icons/albion.webp';
            if (text) text.textContent = region === 'Roman' ? 'Latium' : 'Albion';
        };

        const setRegion = (region: string) => {
            if (this.currentRegion === region) return;
            this.currentRegion = region;
            updateButtonState(region);
            this.pushUrl();
            this.updateGoodsList();
            if (this.currentGood) {
                this.handleGoodSelection(this.currentGood);
            }
        };

        toggleBtn?.addEventListener('click', () => {
            setRegion(this.currentRegion === 'Roman' ? 'Celtic' : 'Roman');
        });

        updateButtonState(this.currentRegion);
    }

    // -----------------------------------------------------------------------
    // Service worker
    // -----------------------------------------------------------------------

    private registerServiceWorker(): void {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((registration) => setInterval(() => registration.update(), 60_000))
                .catch((error) => console.error('[SW] Registration failed:', error));
        });
    }

    // -----------------------------------------------------------------------
    // Goods list
    // -----------------------------------------------------------------------

    private async loadGoodsList(): Promise<void> {
        try {
            this.allGoods = await this.goodsRepository.loadGoodsList();
            try {
                await this.goodsRepository.loadItemCompatibility();
                await this.goodsRepository.preloadItemProductivity();
            } catch (error) {
                console.warn('[App] Failed to preload item modifier data', error);
            }
            this.updateGoodsList();
        } catch (error) {
            console.error('Error loading goods list:', error);
            this.goodsListView.showError('Error loading goods list. Please try again later.');
        }
    }

    private updateGoodsList(): void {
        const filtered = this.allGoods.filter((good) => {
            if (good.startOfChain) return true;
            if (!good.regions?.length) return false;
            return good.regions.includes(this.currentRegion);
        });
        this.goodsListView.render(filtered);
    }

    // -----------------------------------------------------------------------
    // Good selection
    // -----------------------------------------------------------------------

    private async handleGoodSelection(good: RecipeListItem): Promise<void> {
        this.currentGood = good;
        Item.setActiveChain(good.id);
        this.pushUrl();
        this.goodsListView.highlight(good.id);
        this.selectionContainer.classList.add('hidden');
        this.calculatorContainer.classList.remove('hidden');
        this.productionView.showLoading(good);
        try {
            const recipe: Goods | null = await this.goodsRepository.loadProductionChain(good.id, this.currentRegion);
            if (recipe) {
                await this.productionView.showChain(good, recipe);
            } else {
                this.productionView.showBasicInfo(good);
            }
        } catch (error) {
            console.error(`Failed to load production data for ${good.id}`, error);
            this.productionView.showBasicInfo(good);
        }
    }

    private showSelectionView(): void {
        this.currentGood = null;
        Item.setActiveChain(null);
        this.pushUrl();
        this.calculatorContainer.classList.add('hidden');
        this.selectionContainer.classList.remove('hidden');
    }

    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------

    private handleSettingsChange(): void {
        if (this.productionView.hasSelection()) {
            this.productionView.applySettingsToCurrentView();
        }
        this.pushUrl();
    }

    // -----------------------------------------------------------------------
    // URL state — delegated to ParameterParser
    // -----------------------------------------------------------------------

    private restoreFromUrl(): void {
        const url = new URL(window.location.href);
        const state = ParameterParser.parse(url);

        if (state.region) {
            const region = state.region.charAt(0).toUpperCase() + state.region.slice(1).toLowerCase();
            if (region === 'Roman' || region === 'Celtic') {
                this.currentRegion = region;
                const toggleBtn = document.getElementById('region-toggle-btn');
                const icon = toggleBtn?.querySelector<HTMLImageElement>('.region-icon');
                const text = toggleBtn?.querySelector<HTMLElement>('.region-text');
                if (icon) icon.src = region === 'Roman' ? './assets/icons/latium.webp' : './assets/icons/albion.webp';
                if (text) text.textContent = region === 'Roman' ? 'Latium' : 'Albion';
            }
        }

        if (state.good) {
            const good = this.goodsRepository.getGoodsList().find((item) => item.id === state.good);
            if (good) {
                this.applyItemsFromUrl(good.id, state.items ?? []);
                this.handleGoodSelection(good);
            }
        }
    }

    private pushUrl(): void {
        const activeItems = this.getActiveItemsForCurrentChain();
        const url = ParameterParser.create({
            good:   this.currentGood?.id,
            region: this.currentRegion.toLowerCase(),
            items: activeItems,
        });
        window.history.pushState(
            { good: this.currentGood?.id, region: this.currentRegion },
            '',
            url,
        );
    }

    private applyItemsFromUrl(chainId: string, guids: string[]): void {
        if (!guids.length) return;

        const urlGuids = new Set(guids);
        const compatibleItems = this.goodsRepository.getCompatibleItems(chainId);

        for (const item of compatibleItems) {
            const key = Item.getItemSettingKey(chainId, item.guid);
            this.settingsManager.setSettingValue(key, urlGuids.has(item.guid));
        }
    }

    private getActiveItemsForCurrentChain(): string[] {
        if (!this.currentGood) return [];
        const settings = this.settingsManager.getConfig();
        return Item.getActiveGuidsForChain(settings, this.currentGood.id);
    }
}
