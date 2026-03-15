import type { RecipeListItem } from '../types/RecipeList';
import type { Goods } from '../types/Goods';
import { GoodsRepository } from './GoodRepository';
import { ModifierRegistry } from './ModifierRegistry';
import { SettingsManager } from './SettingsManager';
import { formatDuration } from './Utils';

interface GoodsListViewConfig {
    container: HTMLElement;
    onSelect?: (good: RecipeListItem) => void;
}

interface ProductionChainViewConfig {
    container: HTMLElement;
    calculator: {
        cloneRecipe(recipe: Goods): Goods;
        collectBaseInputs(recipe: Goods): Map<string, Goods>;
        findRecommendedRate(recipe: Goods): number;
        getAdjustedTime(node: Goods): number;
        collectAllBuildings(recipe: Goods, rate: number, accum: Record<string, number>): Record<string, number>;
        calculateFuelBuildings(recipe: Goods, allBuildings: Record<string, number>): Array<{ id: string; count: number }>;
        calculateTotals(allBuildings: Record<string, number>): { buildingCost: Record<string, number>; maintenance: Record<string, number> };
    };
    graphRenderer: {
        attach(container: HTMLElement, selectedGoodId?: string): Promise<void>;
        render(productionData: Goods, allBuildings: Record<string, number>): void;
    };
}

interface FuelInfo {
    id: string;
    burning_time?: number;
}

interface BaseBuildingInfo {
    id: string;
}

class GoodsListView {
    container: HTMLElement;
    onSelect?: (good: RecipeListItem) => void;
    goods: RecipeListItem[];
    heading: HTMLElement;
    grid: HTMLElement | null;
    searchInput: HTMLInputElement | null;

    constructor(config: GoodsListViewConfig) {
        const { container, onSelect } = config;
        this.container = container;
        this.onSelect = onSelect;
        this.goods = [];
        this.heading = container.querySelector('h3') as HTMLElement | null || this.createHeading();
        this.grid = null;
        this.searchInput = null;
    }

    createHeading(): HTMLElement {
        const heading = document.createElement('h3');
        heading.textContent = 'Select a Good';
        return heading;
    }

    render(goods: RecipeListItem[] = []): void {
        this.goods = goods.slice();
        this.container.classList.remove('hidden');
        this.container.innerHTML = '';
        this.container.appendChild(this.heading);

        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = '<input type="text" placeholder="Search goods..." aria-label="Search goods" id="goods-search" />';
        this.searchInput = searchContainer.querySelector('input') as HTMLInputElement;

        const gridContainer = document.createElement('div');
        gridContainer.className = 'goods-grid-container';
        this.grid = document.createElement('div');
        this.grid.className = 'goods-grid';
        this.grid.id = 'goods-grid';
        gridContainer.appendChild(this.grid);

        this.container.appendChild(searchContainer);
        this.container.appendChild(gridContainer);

        this.bindSearch();
        this.renderCards(goods);
    }

    bindSearch(): void {
        if (!this.searchInput) return;
        this.searchInput.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement;
            const term = target.value.toLowerCase();
            const filtered = this.goods.filter((good) => (
                good.displayName?.toLowerCase().includes(term) ||
                good.id?.toLowerCase().includes(term)
            ));
            this.renderCards(filtered);
        });
    }

    renderCards(goods: RecipeListItem[]): void {
        if (!this.grid) return;
        this.grid.innerHTML = '';
        const grid = this.grid;
        goods.forEach((good) => {
            if (good.startOfChain) return;
            const card = document.createElement('div');
            card.className = 'goods-card';
            card.dataset.goodId = good.id;
            card.innerHTML = `
                <div class="goods-card-icon">
                    <img src="./assets/icons/${good.icon}.png" alt="${good.displayName}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <div class="icon-placeholder" style="display:none;">${good.icon.substring(0, 2).toUpperCase()}</div>
                </div>
                <div class="goods-card-name">${good.displayName}</div>
            `;
            card.addEventListener('click', () => {
                this.highlight(good.id);
                this.onSelect?.(good);
            });
            grid.appendChild(card);
        });
    }

    highlight(goodId: string): void {
        if (!this.grid) return;
        this.grid.querySelectorAll('.goods-card').forEach((card) => {
            const cardElement = card as HTMLElement;
            cardElement.classList.toggle('selected', cardElement.dataset.goodId === goodId);
        });
    }

    show(): void {
        this.container.classList.remove('hidden');
    }

    hide(): void {
        this.container.classList.add('hidden');
    }

    showError(message: string): void {
        this.container.innerHTML = `<p class="error">${message}</p>`;
    }
}

class ProductionChainView {
    container: HTMLElement;
    goodsRepository: GoodsRepository;
    settingsManager: SettingsManager;
    modifierRegistry: ModifierRegistry;
    calculator: ProductionChainViewConfig['calculator'];
    graphRenderer: ProductionChainViewConfig['graphRenderer'];
    currentGood: RecipeListItem | null;
    sourceRecipe: Goods | null;
    currentRate: number;
    baseInputs: Map<string, Goods>;
    graphHost: HTMLElement | null;
    targetInput: HTMLInputElement | null;
    recommendButton: HTMLElement | null;
    buildingCostElement: HTMLElement | null;
    maintenanceElement: HTMLElement | null;
    onBack: (() => void) | null;

    constructor(config: ProductionChainViewConfig) {
        const { container, calculator, graphRenderer } = config;
        this.container = container;
        this.goodsRepository = GoodsRepository.getInstance()!;
        this.settingsManager = SettingsManager.getInstance();
        this.modifierRegistry = ModifierRegistry.getInstance();
        this.calculator = calculator;
        this.graphRenderer = graphRenderer;
        this.currentGood = null;
        this.sourceRecipe = null;
        this.currentRate = 1;
        this.baseInputs = new Map();
        this.graphHost = null;
        this.targetInput = null;
        this.recommendButton = null;
        this.buildingCostElement = null;
        this.maintenanceElement = null;
        this.onBack = null;
    }

    setBackHandler(handler: () => void): void {
        this.onBack = handler;
    }

    hasSelection(): boolean {
        return Boolean(this.currentGood && this.sourceRecipe);
    }

    showLoading(good: RecipeListItem): void {
        this.currentGood = good;
        this.container.classList.remove('hidden');
        this.container.innerHTML = `
            <div class="calculator-header">
                <button type="button" class="back-button" data-action="back">&larr;</button>
                <h3>Production Chain: ${good.displayName}</h3>
            </div>
            <div class="calculator-content">
                <p>Loading production data for <strong>${good.displayName}</strong>...</p>
            </div>
        `;
        this.bindBackButton();
    }

    async showChain(good: RecipeListItem, recipe: Goods, options: { preserveRate?: boolean } = {}): Promise<void> {
        this.currentGood = good;
        if (!options.preserveRate || !this.sourceRecipe) {
            this.sourceRecipe = this.calculator.cloneRecipe(recipe);
        }
        await this.renderFromSource({ preserveRate: Boolean(options.preserveRate) });
    }

    async refresh(): Promise<void> {
        if (!this.hasSelection()) return;
        await this.renderFromSource({ preserveRate: true });
    }

    async renderFromSource(options: { preserveRate: boolean }): Promise<void> {
        if (!this.sourceRecipe || !this.currentGood) return;
        if (!options.preserveRate) {
            this.currentRate = 1;
        }
        const recipe = this.calculator.cloneRecipe(this.sourceRecipe);
        this.baseInputs = this.calculator.collectBaseInputs(recipe);
        this.container.classList.remove('hidden');
        this.container.innerHTML = this.buildMarkup(this.currentGood, recipe, this.baseInputs);
        this.graphHost = this.container.querySelector('[data-role="graph-host"]') as HTMLElement | null;
        this.targetInput = this.container.querySelector('#target-rate') as HTMLInputElement | null;
        this.recommendButton = this.container.querySelector('#recommend-ratio-btn') as HTMLElement | null;
        this.buildingCostElement = this.container.querySelector('#total-building-cost') as HTMLElement | null;
        this.maintenanceElement = this.container.querySelector('#total-maintenance') as HTMLElement | null;
        this.bindBackButton();
        this.bindControls(recipe);
        if (this.graphHost) {
            await this.graphRenderer.attach(this.graphHost, this.currentGood.id);
        }
        this.updateCalculations(recipe);
    }

    bindBackButton(): void {
        const backButton = this.container.querySelector('[data-action="back"]') as HTMLElement;
        backButton?.addEventListener('click', () => this.onBack?.());
    }

    bindControls(recipe: Goods): void {
        if (this.targetInput) {
            this.targetInput.value = (this.currentRate ?? 1).toString();
            this.targetInput.addEventListener('input', () => {
                const value = parseFloat(this.targetInput!.value);
                this.currentRate = Number.isFinite(value) && value >= 0 ? value : 0;
                this.updateCalculations(recipe);
            });
        }
        this.recommendButton?.addEventListener('click', () => {
            const recommended = this.calculator.findRecommendedRate(recipe);
            this.currentRate = recommended;
            if (this.targetInput) {
                this.targetInput.value = recommended.toFixed(2);
            }
            this.updateCalculations(recipe);
        });

        this.container.querySelectorAll('[data-setting-key]').forEach((node) => {
            node.addEventListener('click', () => {
                const button = node as HTMLButtonElement;
                const key = button.dataset.settingKey;
                const requires = button.dataset.settingRequires;
                if (!key) return;
                if (requires && !this.settingsManager.getSetting(requires)) return;
                this.settingsManager.toggleSetting(key);
            });
        });

        this.container.querySelectorAll('[data-setting-num-key]').forEach((node) => {
            node.addEventListener('input', () => {
                const input = node as HTMLInputElement;
                const key = input.dataset.settingNumKey;
                const requires = input.dataset.settingRequires;
                if (!key) return;
                if (requires && !this.settingsManager.getSetting(requires)) return;
                const val = parseFloat(input.value);
                if (Number.isFinite(val)) this.settingsManager.setSettingValue(key, val);
            });
        });

        this.container.querySelectorAll('[data-setting-select-key]').forEach((node) => {
            node.addEventListener('change', () => {
                const select = node as HTMLSelectElement;
                const key = select.dataset.settingSelectKey;
                const requires = select.dataset.settingRequires;
                if (!key) return;
                if (requires && !this.settingsManager.getSetting(requires)) return;
                this.settingsManager.setSettingValue(key, select.value);
            });
        });
    }

    buildMarkup(good: RecipeListItem, recipe: Goods, baseInputs: Map<string, Goods>): string {
        const outputIcon = good.icon;
        const baseCards = this.buildBaseInputCards(baseInputs);

        const fuelList: FuelInfo[] = ((recipe as any).fuel?.length
            ? (recipe as any).fuel
            : recipe.needs_fuel
                ? [{ id: 'charcoal', burning_time: 120 }]
                : []) as FuelInfo[];

        const fuelCards = this.buildFuelCards(fuelList);
        const outputTime = this.buildTimeBadge(recipe);
        const modifierToolbar = this.buildModifierToolbar();

        return `
            <div class="calculator-header">
                <button class="back-button" type="button" data-action="back" aria-label="Back to list">&larr;</button>
                <h3>Production Chain: ${good.displayName}</h3>
            </div>
            <div class="calculator-content two-column">
                <div class="production-column">
                    <div class="production-command-deck">
                        <div class="production-rate-inline">
                            <label for="target-rate">Output / min</label>
                            <input id="target-rate" type="number" min="0" step="0.5" value="${this.currentRate ?? 1}" />
                            <button id="recommend-ratio-btn" type="button" class="recommend-button">Auto Ratio</button>
                        </div>
                        ${modifierToolbar}
                    </div>
                    <div class="production-flow-grid">
                        <div class="production-info production-info-compact">
                            <h4>Output</h4>
                            <div class="production-grid compact-grid">
                                <div class="production-card">
                                    <div class="production-card-icon">
                                        <img src="./assets/icons/${outputIcon}.png" alt="${good.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                        <div class="icon-placeholder" style="display:none;">${outputIcon.substring(0, 2).toUpperCase()}</div>
                                    </div>
                                    <div class="production-card-name">${good.displayName}</div>
                                    ${outputTime}
                                    <div class="production-card-count" data-building-count="${recipe.id}">0.00x</div>
                                </div>
                            </div>
                        </div>
                        ${baseCards}
                        ${fuelCards}
                    </div>
                </div>
                <div class="graph-column">
                    <div class="production-graph">
                        <h4>Dependency Graph</h4>
                        <div class="graph-host" data-role="graph-host"></div>
                    </div>
                    <div class="cost-summary">
                        <div class="cost-item">
                            <strong>Building Cost:</strong>
                            <span id="total-building-cost">-</span>
                        </div>
                        <div class="cost-item">
                            <strong>Maintenance:</strong>
                            <span id="total-maintenance">-</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    buildBaseInputCards(baseInputs: Map<string, Goods> = new Map()): string {
        const cards: string[] = [];
        const goodsList = this.goodsRepository.getGoodsList();

        baseInputs.forEach((input, id) => {
            const goodsListEntry = goodsList.find((g: RecipeListItem) => g.id === id);
            const displayName = goodsListEntry?.displayName || input.name || id;
            const icon = goodsListEntry?.icon || input.id || id;
            const time = this.buildTimeBadge(input);
            cards.push(`
                <div class="production-card" data-input-id="${id}">
                    <div class="production-card-icon">
                        <img src="./assets/icons/${icon}.png" alt="${displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="icon-placeholder" style="display:none;">${icon.substring(0, 2).toUpperCase()}</div>
                    </div>
                    <div class="production-card-name">${displayName}</div>
                    ${time}
                    <div class="production-card-count" data-building-count="${id}">0.00x</div>
                </div>
            `);
        });

        const content = cards.length
            ? cards.join('')
            : '<p class="production-empty-note">No direct base input required.</p>';

        return `
            <div class="production-info production-info-compact">
                <h4>Inputs</h4>
                <div class="production-grid compact-grid">
                    ${content}
                </div>
            </div>
        `;
    }

    buildFuelCards(fuelList: FuelInfo[] = []): string {
        const goodsList = this.goodsRepository.getGoodsList();

        const cards = fuelList.map((fuel) => {
            const goodsListEntry = goodsList.find((g: RecipeListItem) => g.id === fuel.id);
            const displayName = goodsListEntry?.displayName || fuel.id;
            const icon = goodsListEntry?.icon || fuel.id;
            const burnLabel = fuel.burning_time ? `<div class="production-card-time">${formatDuration(fuel.burning_time)}</div>` : '';
            return `
                <div class="production-card">
                    <div class="production-card-icon">
                        <img src="./assets/icons/${icon}.png" alt="${displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="icon-placeholder" style="display:none;">${icon.substring(0, 2).toUpperCase()}</div>
                    </div>
                    <div class="production-card-name">${displayName}</div>
                    ${burnLabel}
                    <div class="production-card-count" data-fuel-building-count="${fuel.id}">0.00x</div>
                </div>
            `;
        });

        const content = cards.length
            ? cards.join('')
            : '<p class="production-empty-note">No fuel dependency.</p>';

        return `
            <div class="production-info production-info-compact">
                <h4>Fuel</h4>
                <div class="production-grid compact-grid">
                    ${content}
                </div>
            </div>
        `;
    }

    buildTimeBadge(node: Goods | BaseBuildingInfo | { time?: number }): string {
        const time = (node as any).time;
        if (!time) {
            return '';
        }
        const baseTime = time;
        const adjusted = (node as Goods).time ? this.calculator.getAdjustedTime(node as Goods) : baseTime;
        const boosted = Math.abs(adjusted - baseTime) > 0.01;
        return `
            <div class="production-card-time" title="${boosted ? `Base ${formatDuration(baseTime)}` : 'No active boost'}">
                ${formatDuration(adjusted)}
                ${boosted ? '<div class="boosted-indicator">Boosted</div>' : ''}
            </div>
        `;
    }

    buildModifierToolbar(): string {
        const cards: string[] = [];

        this.modifierRegistry.getDefinitions().forEach((modifier) => {
            const toggles = (modifier.toggles ?? []).map((toggle) => {
                const active = this.settingsManager.getSetting(toggle.key);
                const requiredKey = toggle.requires || '';
                const unlocked = !requiredKey || this.settingsManager.getSetting(requiredKey);
                const classes = [
                    'modifier-toggle-btn',
                    active ? 'active' : '',
                    unlocked ? '' : 'locked',
                ].filter(Boolean).join(' ');
                return `
                    <button
                        type="button"
                        class="${classes}"
                        data-setting-key="${toggle.key}"
                        data-setting-requires="${requiredKey}"
                        aria-label="${toggle.label}"
                        aria-pressed="${active}"
                        data-tooltip="${toggle.label}: ${toggle.description}">
                        <img src="./assets/icons/${toggle.icon}" alt="" aria-hidden="true" />
                        <span>${toggle.label}</span>
                    </button>
                `;
            }).join('');

            const numInputs = (modifier.numInputs ?? []).map((numInput) => {
                const requiredKey = numInput.requires || '';
                const unlocked = !requiredKey || this.settingsManager.getSetting(requiredKey);
                const currentVal = this.settingsManager.getSettingRaw(numInput.key) ?? numInput.defaultValue ?? 0;
                const minAttr = numInput.min !== undefined ? `min="${numInput.min}"` : '';
                const maxAttr = numInput.max !== undefined ? `max="${numInput.max}"` : '';
                const stepAttr = numInput.step !== undefined ? `step="${numInput.step}"` : '';
                return `
                    <label class="modifier-num-input-label ${unlocked ? '' : 'locked'}"
                           data-tooltip="${numInput.label}: ${numInput.description}">
                        <img src="./assets/icons/${numInput.icon}" alt="" aria-hidden="true" />
                        <span>${numInput.label}</span>
                        <input type="number" class="modifier-num-input"
                               ${minAttr} ${maxAttr} ${stepAttr}
                               value="${currentVal}"
                               data-setting-num-key="${numInput.key}"
                               data-setting-requires="${requiredKey}"
                               ${unlocked ? '' : 'disabled'} />
                    </label>
                `;
            }).join('');

            const selects = (modifier.selects ?? []).map((select) => {
                const requiredKey = select.requires || '';
                const unlocked = !requiredKey || this.settingsManager.getSetting(requiredKey);
                const currentVal = this.settingsManager.getSettingRaw(select.key) ?? select.defaultValue ?? '';
                const options = select.options.map((opt) =>
                    `<option value="${opt.value}" ${currentVal === opt.value ? 'selected' : ''}>${opt.label}</option>`
                ).join('');
                return `
                    <label class="modifier-select-label ${unlocked ? '' : 'locked'}"
                           data-tooltip="${select.label}: ${select.description}">
                        <img src="./assets/icons/${select.icon}" alt="" aria-hidden="true" />
                        <span>${select.label}</span>
                        <select class="modifier-select"
                                data-setting-select-key="${select.key}"
                                data-setting-requires="${requiredKey}"
                                ${unlocked ? '' : 'disabled'}>
                            ${options}
                        </select>
                    </label>
                `;
            }).join('');

            const hasControls = toggles || numInputs || selects;
            if (!hasControls) return;

            cards.push(`
                <div class="modifier-toolbar-group compact">
                    <span class="modifier-toolbar-label">${modifier.label} Settings</span>
                    <div class="modifier-toggle-row">
                        ${toggles}
                        ${numInputs}
                        ${selects}
                    </div>
                </div>
            `);
        });

        if (!cards.length) {
            return `
                <section class="aqueduct-settings-panel">
                    <h4>Modifier Settings</h4>
                    <p>Apply productivity boosts directly from the production column.</p>
                    <div class="modifier-toolbar-empty">
                        No modifier settings registered.
                    </div>
                </section>
            `;
        }

        return `
            <section class="aqueduct-settings-panel">
                <h4>Modifier Settings</h4>
                <p>Apply productivity boosts directly from the production column.</p>
                <div class="production-modifier-inline">
                    ${cards.join('')}
                </div>
            </section>
        `;
    }

    updateCalculations(recipe: Goods): void {
        if (!recipe) return;
        const rate = typeof this.currentRate === 'number' ? this.currentRate : 1;
        const workingRecipe = this.calculator.cloneRecipe(recipe);
        const allBuildings = this.calculator.collectAllBuildings(workingRecipe, rate, {});
        this.updateBuildingCounts(allBuildings);
        this.updateFuelBuildings(recipe, allBuildings);
        this.updateCostSummary(allBuildings);
        this.graphRenderer.render(recipe, allBuildings);
    }

    updateBuildingCounts(allBuildings: Record<string, number> = {}): void {
        Object.entries(allBuildings).forEach(([goodId, buildings]) => {
            if (goodId === '_metadata') return;
            const target = this.container.querySelector(`[data-building-count="${goodId}"]`) as HTMLElement | null;
            if (target) {
                target.textContent = `${(buildings || 0).toFixed(2)}x`;
            }
        });
    }

    updateFuelBuildings(recipe: Goods, allBuildings: Record<string, number>): void {
        const fuelCounts = this.calculator.calculateFuelBuildings(recipe, allBuildings);
        const updated = new Set<string>();
        fuelCounts.forEach(({ id, count }) => {
            const target = this.container.querySelector(`[data-fuel-building-count="${id}"]`) as HTMLElement | null;
            if (target) {
                target.textContent = `${(count || 0).toFixed(2)}x`;
                updated.add(id);
            }
        });
        this.container.querySelectorAll('[data-fuel-building-count]').forEach((node) => {
            const element = node as HTMLElement & { dataset: { fuelBuildingCount?: string } };
            if (!updated.has(element.dataset.fuelBuildingCount || '')) {
                element.textContent = '0.00x';
            }
        });
    }

    updateCostSummary(allBuildings: Record<string, number>): void {
        if (!this.buildingCostElement || !this.maintenanceElement) return;
        const totals = this.calculator.calculateTotals(allBuildings);
        this.buildingCostElement.replaceChildren(...this.buildCostElements(totals.buildingCost));
        this.maintenanceElement.replaceChildren(...this.buildCostElements(totals.maintenance));
    }

    buildCostElements(costs: Record<string, number> = {}): HTMLElement[] {
        const entries = Object.entries(costs).filter(([, amount]) => amount > 0);
        if (!entries.length) {
            const none = document.createElement('span');
            none.className = 'cost-none';
            none.textContent = 'None';
            return [none];
        }
        return entries.map(([resource, amount]) => {
            const item = document.createElement('span');
            item.className = 'cost-resource';
            const label = resource.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            item.innerHTML = `<img src="./assets/icons/${resource}.png" alt="${label}" class="cost-icon" onerror="this.style.display='none';"/><span class="cost-amount">${amount}</span>`;

            item.addEventListener('mouseenter', () => {
                const tip = document.createElement('div');
                tip.className = 'cost-tooltip';
                tip.textContent = label;
                document.body.appendChild(tip);
                const rect = item.getBoundingClientRect();
                const tipRect = tip.getBoundingClientRect();
                tip.style.left = `${rect.left + rect.width / 2 - tipRect.width / 2}px`;
                tip.style.top = `${rect.top - tipRect.height - 4}px`;
            });

            item.addEventListener('mouseleave', () => {
                document.querySelectorAll('.cost-tooltip').forEach(el => el.remove());
            });

            return item;
        });
    }

    showBasicInfo(good: RecipeListItem): void {
        this.currentGood = good;
        this.sourceRecipe = null;
        this.container.classList.remove('hidden');
        this.container.innerHTML = `
            <div class="calculator-header">
                <button class="back-button" type="button" data-action="back" aria-label="Back to list">&larr;</button>
                <h3>${good.displayName}</h3>
            </div>
            <div class="calculator-content">
                <div class="production-info">
                    <p><strong>ID:</strong> ${good.id}</p>
                    <p><strong>Icon:</strong> ${good.icon}</p>
                </div>
                <p class="info-note">No detailed production data available for this good.</p>
            </div>
        `;
        this.bindBackButton();
    }
}

export { GoodsListView, ProductionChainView };