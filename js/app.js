import { GoodsRepository } from './modules/data/GoodsRepository.js';
import { ProductionCalculator } from './modules/logic/ProductionCalculator.js';
import { SettingsManager } from './modules/settings/SettingsManager.js';
import { GraphRenderer } from './modules/ui/GraphRenderer.js';

const formatDuration = (seconds = 0) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const secs = Math.round(safeSeconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
};

class GoodsListView {
    constructor({ container, onSelect }) {
        this.container = container;
        this.onSelect = onSelect;
        this.goods = [];
        this.heading = container.querySelector('h3') || this.createHeading();
        this.grid = null;
        this.searchInput = null;
    }

    createHeading() {
        const heading = document.createElement('h3');
        heading.textContent = 'Select a Good';
        return heading;
    }

    render(goods = []) {
        this.goods = goods.slice();
        this.container.classList.remove('hidden');
        this.container.innerHTML = '';
        this.container.appendChild(this.heading);

        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = '<input type="text" placeholder="Search goods..." aria-label="Search goods" id="goods-search" />';
        this.searchInput = searchContainer.querySelector('input');

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

    bindSearch() {
        if (!this.searchInput) return;
        this.searchInput.addEventListener('input', (event) => {
            const term = event.target.value.toLowerCase();
            const filtered = this.goods.filter((good) => (
                good.displayName?.toLowerCase().includes(term) ||
                good.id?.toLowerCase().includes(term)
            ));
            this.renderCards(filtered);
        });
    }

    renderCards(goods) {
        if (!this.grid) return;
        this.grid.innerHTML = '';
        goods.forEach((good) => {
            if (good.startOfChain) return;
            const card = document.createElement('div');
            card.className = 'goods-card';
            card.dataset.goodId = good.id;
            card.innerHTML = `
                <div class="goods-card-icon">
                    <img src="icons/${good.icon}.png" alt="${good.displayName}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <div class="icon-placeholder" style="display:none;">${good.icon.substring(0, 2).toUpperCase()}</div>
                </div>
                <div class="goods-card-name">${good.displayName}</div>
            `;
            card.addEventListener('click', () => {
                this.highlight(good.id);
                this.onSelect?.(good);
            });
            this.grid.appendChild(card);
        });
    }

    highlight(goodId) {
        if (!this.grid) return;
        this.grid.querySelectorAll('.goods-card').forEach((card) => {
            card.classList.toggle('selected', card.dataset.goodId === goodId);
        });
    }

    show() {
        this.container.classList.remove('hidden');
    }

    hide() {
        this.container.classList.add('hidden');
    }

    showError(message) {
        this.container.innerHTML = `<p class="error">${message}</p>`;
    }
}

class ProductionChainView {
    constructor({ container, goodsRepository, calculator, graphRenderer }) {
        this.container = container;
        this.goodsRepository = goodsRepository;
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

    setBackHandler(handler) {
        this.onBack = handler;
    }

    hasSelection() {
        return Boolean(this.currentGood && this.sourceRecipe);
    }

    showLoading(good) {
        this.currentGood = good;
        this.container.classList.remove('hidden');
        this.container.innerHTML = `
            <div class="calculator-header">
                <button type="button" class="back-button" data-action="back">&larr;</button>
                <h3>Production Chain: ${good.id}</h3>
            </div>
            <div class="calculator-content">
                <p>Loading production data for <strong>${good.displayName}</strong>...</p>
            </div>
        `;
        this.bindBackButton();
    }

    async showChain(good, recipe, { preserveRate = false } = {}) {
        this.currentGood = good;
        if (!preserveRate || !this.sourceRecipe) {
            this.sourceRecipe = this.calculator.cloneRecipe(recipe);
        }
        await this.renderFromSource({ preserveRate });
    }

    async refresh() {
        if (!this.hasSelection()) return;
        await this.renderFromSource({ preserveRate: true });
    }

    async renderFromSource({ preserveRate }) {
        if (!this.sourceRecipe || !this.currentGood) return;
        if (!preserveRate) {
            this.currentRate = 1;
        }
        const recipe = this.calculator.cloneRecipe(this.sourceRecipe);
        this.baseInputs = this.calculator.collectBaseInputs(recipe);
        this.container.classList.remove('hidden');
        this.container.innerHTML = this.buildMarkup(this.currentGood, recipe, this.baseInputs);
        this.graphHost = this.container.querySelector('[data-role="graph-host"]');
        this.targetInput = this.container.querySelector('#target-rate');
        this.recommendButton = this.container.querySelector('#recommend-ratio-btn');
        this.buildingCostElement = this.container.querySelector('#total-building-cost');
        this.maintenanceElement = this.container.querySelector('#total-maintenance');
        this.bindBackButton();
        this.bindControls(recipe);
        await this.graphRenderer.attach(this.graphHost);
        this.updateCalculations(recipe);
    }

    bindBackButton() {
        const backButton = this.container.querySelector('[data-action="back"]');
        backButton?.addEventListener('click', () => this.onBack?.());
    }

    bindControls(recipe) {
        if (this.targetInput) {
            this.targetInput.value = (this.currentRate ?? 1).toString();
            this.targetInput.addEventListener('input', () => {
                const value = parseFloat(this.targetInput.value);
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
    }

    buildMarkup(good, recipe, baseInputs) {
        const outputIcon = recipe.head?.icon || recipe.icon || good.icon;
        const baseCards = this.buildBaseInputCards(baseInputs);
        const fuelCards = this.buildFuelCards(recipe.fuel);
        const outputTime = this.buildTimeBadge(recipe);

        return `
            <div class="calculator-header">
                <button class="back-button" type="button" data-action="back" aria-label="Back to list">&larr;</button>
                <h3>Production Chain: ${good.id}</h3>
            </div>
            <div class="production-controls">
                <label for="target-rate">Target output per minute:</label>
                <input id="target-rate" type="number" min="0" step="0.5" value="${this.currentRate ?? 1}" />
                <button id="recommend-ratio-btn" type="button" class="recommend-button">Recommended Ratio</button>
            </div>
            <div class="calculator-content two-column">
                <div class="production-column">
                    <div class="production-info">
                        <h4>Output</h4>
                        <div class="production-grid">
                            <div class="production-card">
                                <div class="production-card-icon">
                                    <img src="icons/${outputIcon}.png" alt="${good.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
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

    buildBaseInputCards(baseInputs = new Map()) {
        if (!baseInputs.size) {
            return '';
        }
        const cards = [];
        baseInputs.forEach((input, id) => {
            const good = this.goodsRepository.getGoodById(id) || { displayName: id, icon: id };
            const time = this.buildTimeBadge(input);
            cards.push(`
                <div class="production-card" data-input-id="${id}">
                    <div class="production-card-icon">
                        <img src="icons/${good.icon}.png" alt="${good.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="icon-placeholder" style="display:none;">${good.icon.substring(0, 2).toUpperCase()}</div>
                    </div>
                    <div class="production-card-name">${good.displayName}</div>
                    ${time}
                    <div class="production-card-count" data-building-count="${id}">0.00x</div>
                </div>
            `);
        });
        return `
            <div class="production-info">
                <h4>Base Inputs</h4>
                <div class="production-grid">
                    ${cards.join('')}
                </div>
            </div>
        `;
    }

    buildFuelCards(fuelList = []) {
        if (!fuelList?.length) {
            return '';
        }
        const cards = fuelList.map((fuel) => {
            const good = this.goodsRepository.getGoodById(fuel.id) || { displayName: fuel.id, icon: fuel.id };
            const burnLabel = fuel.burning_time ? `<div class="production-card-time">${formatDuration(fuel.burning_time)} min</div>` : '';
            return `
                <div class="production-card">
                    <div class="production-card-icon">
                        <img src="icons/${good.icon}.png" alt="${good.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="icon-placeholder" style="display:none;">${good.icon.substring(0, 2).toUpperCase()}</div>
                    </div>
                    <div class="production-card-name">${good.displayName}</div>
                    ${burnLabel}
                    <div class="production-card-count" data-fuel-building-count="${fuel.id}">0.00x</div>
                </div>
            `;
        });
        return `
            <div class="production-info">
                <h4>Fuel</h4>
                <div class="production-grid">
                    ${cards.join('')}
                </div>
            </div>
        `;
    }

    buildTimeBadge(node = {}) {
        if (!node.time) {
            return '';
        }
        const baseTime = node.time;
        const adjusted = this.calculator.getAdjustedTime(node);
        const boosted = Math.abs(adjusted - baseTime) > 0.01;
        return `
            <div class="production-card-time">
                ${formatDuration(adjusted)}${boosted ? ` (${formatDuration(baseTime)})` : ''} min
                ${boosted ? '<div class="boosted-indicator">Boosted</div>' : ''}
            </div>
        `;
    }

    updateCalculations(recipe) {
        if (!recipe) return;
        const rate = typeof this.currentRate === 'number' ? this.currentRate : 1;
        const workingRecipe = this.calculator.cloneRecipe(recipe);
        const allBuildings = this.calculator.collectAllBuildings(workingRecipe, rate, {});
        this.updateBuildingCounts(allBuildings);
        this.updateFuelBuildings(recipe, allBuildings);
        this.updateCostSummary(allBuildings);
        this.graphRenderer.render(recipe, allBuildings);
    }

    updateBuildingCounts(allBuildings = {}) {
        Object.entries(allBuildings).forEach(([goodId, buildings]) => {
            if (goodId === '_metadata') return;
            const target = this.container.querySelector(`[data-building-count="${goodId}"]`);
            if (target) {
                target.textContent = `${(buildings || 0).toFixed(2)}x`;
            }
        });
    }

    updateFuelBuildings(recipe, allBuildings) {
        const fuelCounts = this.calculator.calculateFuelBuildings(recipe, allBuildings);
        const updated = new Set();
        fuelCounts.forEach(({ id, count }) => {
            const target = this.container.querySelector(`[data-fuel-building-count="${id}"]`);
            if (target) {
                target.textContent = `${(count || 0).toFixed(2)}x`;
                updated.add(id);
            }
        });
        this.container.querySelectorAll('[data-fuel-building-count]').forEach((node) => {
            if (!updated.has(node.dataset.fuelBuildingCount)) {
                node.textContent = '0.00x';
            }
        });
    }

    updateCostSummary(allBuildings) {
        if (!this.buildingCostElement || !this.maintenanceElement) return;
        const totals = this.calculator.calculateTotals(allBuildings);
        this.buildingCostElement.innerHTML = this.formatCostMap(totals.buildingCost);
        this.maintenanceElement.innerHTML = this.formatCostMap(totals.maintenance);
    }

    formatCostMap(costs = {}) {
        const entries = Object.entries(costs).filter(([, amount]) => amount > 0);
        if (!entries.length) {
            return '<span class="cost-none">None</span>';
        }
        return entries.map(([resource, amount]) => `
            <span class="cost-resource">
                <img src="icons/${resource}.png" alt="${resource}" class="cost-icon" onerror="this.style.display='none';" />
                <span class="cost-amount">${amount}</span>
            </span>
        `).join('');
    }

    showBasicInfo(good) {
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
                    <p><strong>Start of Chain:</strong> ${good.startOfChain ? 'Yes' : 'No'}</p>
                    ${good.startOfChain ? '<p class="info-note">This is a raw material that starts production chains.</p>' : ''}
                </div>
                <p class="info-note">No detailed production data available for this good.</p>
            </div>
        `;
        this.bindBackButton();
    }
}

class Anno117CalculatorApp {
    constructor() {
        this.goodsRepository = new GoodsRepository();
        this.settingsManager = new SettingsManager();
        this.productionCalculator = new ProductionCalculator(() => this.settingsManager.getConfig());
        this.graphRenderer = new GraphRenderer({
            goodsRepository: this.goodsRepository,
            configProvider: () => this.settingsManager.getConfig()
        });
        this.selectionContainer = document.getElementById('selection-container');
        this.calculatorContainer = document.getElementById('calculator-container');
        this.goodsListView = new GoodsListView({
            container: this.selectionContainer,
            onSelect: (good) => this.handleGoodSelection(good)
        });
        this.productionView = new ProductionChainView({
            container: this.calculatorContainer,
            goodsRepository: this.goodsRepository,
            calculator: this.productionCalculator,
            graphRenderer: this.graphRenderer
        });
        this.productionView.setBackHandler(() => this.showSelectionView());
        this.currentGood = null;
    }

    async init() {
        this.registerServiceWorker();
        this.settingsManager.init();
        this.settingsManager.onChange(() => this.handleSettingsChange());
        await this.loadGoodsList();
        this.restoreFromUrl();
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then((registration) => {
                setInterval(() => registration.update(), 60000);
            }).catch((error) => {
                console.error('[SW] Registration failed:', error);
            });
        });
    }

    async loadGoodsList() {
        try {
            const goods = await this.goodsRepository.loadGoodsList();
            this.goodsListView.render(goods);
        } catch (error) {
            console.error('Error loading goods list:', error);
            this.goodsListView.showError('Error loading goods list. Please try again later.');
        }
    }

    async handleGoodSelection(good) {
        this.currentGood = good;
        this.pushChainToUrl(good.id);
        this.goodsListView.highlight(good.id);
        this.selectionContainer.classList.add('hidden');
        this.calculatorContainer.classList.remove('hidden');
        this.productionView.showLoading(good);
        try {
            const recipe = await this.goodsRepository.loadProductionChain(good.id);
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

    showSelectionView() {
        this.currentGood = null;
        const url = new URL(window.location);
        url.searchParams.delete('chain');
        window.history.pushState({}, '', url);
        this.calculatorContainer.classList.add('hidden');
        this.selectionContainer.classList.remove('hidden');
    }

    handleSettingsChange() {
        if (this.productionView.hasSelection()) {
            this.productionView.refresh();
        }
    }

    restoreFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const chainParam = urlParams.get('chain');
        if (!chainParam) return;
        const good = this.goodsRepository.getGoods().find((item) => item.id === chainParam);
        if (good) {
            this.handleGoodSelection(good);
        }
    }

    pushChainToUrl(goodId) {
        const url = new URL(window.location);
        url.searchParams.set('chain', goodId);
        window.history.pushState({}, '', url);
    }
}

const bootstrap = () => {
    const app = new Anno117CalculatorApp();
    app.init();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
