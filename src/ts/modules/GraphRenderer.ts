import type { Goods } from '../types/Goods';
import type { RecipeListItem } from '../types/RecipeList';
import { ProductionCalculator } from './ProductionCalculator';
import { GoodsRepository } from './GoodRepository';

const CENTER_X = 200;
const CENTER_Y = 40;

interface GraphRendererConfig {
    templatePath?: string;
}

interface ViewBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

interface GoodMetadata {
    id: string;
    displayName: string;
    icon: string;
}

interface NodeData {
    x: number;
    y: number;
    good: GoodMetadata;
    buildings: number;
    textAlign: 'left' | 'right';
    hasFuel: boolean;
    buildingType: string;
    prodNode: Goods;
    depth: number;
    maxDepth: number;
    isLeaf: boolean;
    startOfChain: boolean;
    buildingCost?: Record<string, number>;
    maintenanceCost?: Record<string, number>;
    productivity: number;
}

interface LabelGeometry {
    labelX: number;
    labelY: number;
    labelAnchor: 'start' | 'middle' | 'end';
    buildingsY: number;
}

/**
 * Renders dependency graphs inside an external SVG template.
 * Singleton — always access via GraphRenderer.getInstance().
 */
export class GraphRenderer {
    private static _instance: GraphRenderer | null = null;

    public static getInstance(): GraphRenderer {
        if (!GraphRenderer._instance) {
            GraphRenderer._instance = new GraphRenderer();
        }
        return GraphRenderer._instance;
    }

    templatePath: string;
    svgMarkup: string | null;
    svgElement: SVGSVGElement | null;
    interactionsBound: boolean;
    private viewBoxes: Map<string, ViewBox> = new Map();
    private currentGoodId: string | null = null;

    private constructor(config: GraphRendererConfig = {}) {
        const { templatePath = 'svg/dependency-graph.svg' } = config;

        this.templatePath = templatePath;
        this.svgMarkup = null;
        this.svgElement = null;
        this.interactionsBound = false;
        this.displayInfoMenue = this.displayInfoMenue.bind(this);
    }

    async attach(container: HTMLElement | null, goodId?: string): Promise<void> {
        if (!container) return;

        if (this.svgElement && this.currentGoodId) {
            this.viewBoxes.set(this.currentGoodId, this.parseViewBox());
        }

        this.currentGoodId = goodId ?? null;
        const savedViewBox = goodId ? this.viewBoxes.get(goodId) : undefined;
        const viewBoxAttr = savedViewBox
            ? `${savedViewBox.x} ${savedViewBox.y} ${savedViewBox.width} ${savedViewBox.height}`
            : '0 0 400 400';

        const svgElement = document.createElement('svg');
        svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgElement.setAttribute('id', 'dependency-graph');
        svgElement.setAttribute('class', 'dependency-graph');
        svgElement.setAttribute('viewBox', viewBoxAttr);
        this.svgMarkup = svgElement.outerHTML;
        container.innerHTML = this.svgMarkup;
        this.svgElement = container.querySelector('#dependency-graph') as SVGSVGElement | null;
        this.interactionsBound = false;
        this.setupInteractions();
    }

    render(productionData: Goods, allBuildings: Record<string, number>): void {
        if (!this.svgElement || !productionData) return;
        this.clearSvg();
        if (!allBuildings || Object.keys(allBuildings).length === 0) return;

        const maxDepth = this.calculateMaxDepth(productionData);
        this.renderRecursiveGraph(productionData, CENTER_X, CENTER_Y, 0, allBuildings, null, null, maxDepth);
    }

    clearSvg(): void {
        if (!this.svgElement) return;
        while (this.svgElement.firstChild) {
            this.svgElement.removeChild(this.svgElement.firstChild);
        }
    }

    renderRecursiveGraph(
        prodData: Goods,
        x: number,
        y: number,
        depth: number,
        allBuildings: Record<string, number>,
        parentX: number | null,
        parentY: number | null,
        maxDepth: number
    ): void {
        if (!prodData || depth > 5) return;

        const good = this.findGood(prodData.id, prodData);
        const hasFuel = prodData.needs_fuel === true;
        const buildings = allBuildings[prodData.id] || 0;
        const buildingType = prodData.type || '';

        let textAlign: 'left' | 'right' = 'left';
        if (depth === 0) {
            textAlign = 'left';
        } else if (parentX !== null && parentX !== undefined) {
            textAlign = x < parentX ? 'left' : x > parentX ? 'right' : x < CENTER_X ? 'left' : 'right';
        } else {
            textAlign = x < CENTER_X ? 'left' : 'right';
        }

        const inputs = Array.isArray(prodData.input) ? prodData.input : [];
        const isLeaf = inputs.length === 0 || inputs.every((input) => input.start_of_chain);

        this.addNode({
            x,
            y,
            good,
            buildings,
            textAlign,
            hasFuel,
            buildingType,
            prodNode: prodData,
            depth,
            maxDepth,
            isLeaf,
            startOfChain: prodData.start_of_chain === true,
            buildingCost: prodData.building_cost,
            maintenanceCost: prodData.maintanance_cost,
            productivity: this.calculateProductivity(prodData)
        });

        if (typeof parentX === 'number' && typeof parentY === 'number') {
            this.drawLink(parentX, parentY + 32, x, y - 32, depth === 0);
        }

        if (!inputs.length) return;
        const nextY = y + 120;

        const inputWidths = inputs.map((input) => {
            if (Array.isArray(input.input)) return this.calculateTreeWidth(input);
            return 1;
        });
        const totalWidth = inputWidths.reduce((sum, width) => sum + width, 0);

        let hasRightAlignedText = false;
        let probeOffset = x - (totalWidth * 90) / 2;
        inputWidths.forEach((width) => {
            const tentativeX = probeOffset + (width * 90) / 2;
            if (tentativeX >= CENTER_X) {
                hasRightAlignedText = true;
            }
            probeOffset += width * 90;
        });

        const nodeSpacing = hasRightAlignedText ? 160 : 120;
        let currentOffset = x - (totalWidth * nodeSpacing) / 2;

        inputs.forEach((input, index) => {
            if (!input.id) return;
            const widthUnits = inputWidths[index] ?? 1;
            const inputX = currentOffset + (widthUnits * nodeSpacing) / 2;
            currentOffset += widthUnits * nodeSpacing;

            if (Array.isArray(input.input)) {
                this.renderRecursiveGraph(input, inputX, nextY, depth + 1, allBuildings, x, y, maxDepth);
                return;
            }

            if (input.start_of_chain) {
                const inputGood = this.findGood(input.id, input);
                const inputBuildings = allBuildings[input.id] || 0;

                let align: 'left' | 'right' = 'left';
                align = inputX < x ? 'left' : inputX > x ? 'right' : inputX < CENTER_X ? 'left' : 'right';

                this.addNode({
                    x: inputX,
                    y: nextY,
                    good: inputGood,
                    buildings: inputBuildings,
                    textAlign: align,
                    hasFuel: false,
                    buildingType: input.type || '',
                    prodNode: input,
                    depth: depth + 1,
                    maxDepth,
                    isLeaf: true,
                    startOfChain: true,
                    buildingCost: input.building_cost,
                    maintenanceCost: input.maintanance_cost,
                    productivity: this.calculateProductivity(input)
                });
                this.drawLink(x, y + 32, inputX, nextY - 32, false);
            }
        });
    }

    addNode(nodeData: NodeData): void {
        if (!this.svgElement) return;
        const { x, y, good, buildings, textAlign, hasFuel, buildingType, prodNode, depth, maxDepth, isLeaf, startOfChain, buildingCost, maintenanceCost, productivity } = nodeData;
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const size = 64;
        rect.setAttribute('x', String(x - size / 2));
        rect.setAttribute('y', String(y - size / 2));
        rect.setAttribute('width', String(size));
        rect.setAttribute('height', String(size));
        rect.setAttribute('rx', '12');
        rect.setAttribute('ry', '12');
        rect.setAttribute('class', 'graph-node');
        group.appendChild(rect);

        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image') as any;
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `./assets/icons/${good.icon || good.id}.png`);
        img.setAttribute('x', String(x - size / 2));
        img.setAttribute('y', String(y - size / 2));
        img.setAttribute('width', String(size));
        img.setAttribute('height', String(size));
        img.dataset.goodId = good.id;
        img.productionData = { buildingCost, maintenanceCost, buildings, good, productivity };
        img.addEventListener('mousedown', this.displayInfoMenue);
        group.appendChild(img);

        if (hasFuel) {
            this.addCornerImage(group, x, y, size, './assets/icons/charcoal.png');
        } else {
            for (const icon of ProductionCalculator.getInstance().getActiveVisualModifiersForNode(prodNode)) {
                this.addCornerImage(group, x, y, size, `./assets/icons/${icon}`, true);
            }
        }



        const { labelX, labelAnchor, labelY, buildingsY } = this.resolveLabelGeometry({
            x,
            y,
            textAlign,
            label: good.displayName || good.id,
            buildings: buildings.toFixed(2),
            depth,
            maxDepth,
            isLeaf,
            startOfChain
        });

        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelText.setAttribute('x', String(labelX));
        labelText.setAttribute('y', String(labelY));
        labelText.setAttribute('text-anchor', labelAnchor);
        labelText.setAttribute('class', 'graph-text');
        labelText.setAttribute('data-role', 'label');
        labelText.setAttribute('data-good-id', good.id || '');
        labelText.textContent = good.displayName || good.id || 'good';
        group.appendChild(labelText);

        const buildingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        buildingText.setAttribute('x', String(labelX));
        buildingText.setAttribute('y', String(buildingsY));
        buildingText.setAttribute('text-anchor', labelAnchor);
        buildingText.setAttribute('class', 'graph-subtext');
        buildingText.setAttribute('data-role', 'buildings');
        buildingText.setAttribute('data-good-id', good.id || '');
        buildingText.textContent = `${buildings.toFixed(2)}x`;
        group.appendChild(buildingText);

        this.svgElement.appendChild(group);
    }

    drawLink(x1: number, y1: number, x2: number, y2: number, primary: boolean): void {
        if (!this.svgElement) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('class', primary ? 'graph-link' : 'graph-link-secondary');
        this.svgElement.insertBefore(line, this.svgElement.firstChild);
    }

    resolveLabelGeometry(params: {
        x: number;
        y: number;
        textAlign: 'left' | 'right';
        label: string;
        buildings: string;
        depth: number;
        maxDepth: number;
        isLeaf: boolean;
        startOfChain: boolean;
    }): LabelGeometry {
        const { x, y, textAlign, depth, startOfChain } = params;

        if (depth >= 2 && startOfChain) {
            return { labelX: x, labelY: y + 50, buildingsY: y + 67, labelAnchor: 'middle' };
        }

        const offset = 45;

        if (textAlign === 'right') {
            return {
                labelX: x + offset,
                labelY: y - 5,
                buildingsY: y + 12,
                labelAnchor: 'start'
            };
        }

        return {
            labelX: x - offset,
            labelY: y - 5,
            buildingsY: y + 12,
            labelAnchor: 'end'
        };
    }

    addCornerImage(group: SVGGElement, x: number, y: number, size: number, href: string, filled: boolean = false): void {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        const iconSize = Math.round(size * 0.56);
        const cornerX = x + size / 2 - iconSize + 6;
        const cornerY = y + size / 2 - iconSize + 6;
        icon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
        icon.setAttribute('x', String(cornerX));
        icon.setAttribute('y', String(cornerY));
        icon.setAttribute('width', String(iconSize));
        icon.setAttribute('height', String(iconSize));

        if (filled) {
            // square with rounded corners as background for better visibility
            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bg.setAttribute('x', String(cornerX));
            bg.setAttribute('y', String(cornerY));
            bg.setAttribute('width', String(iconSize));
            bg.setAttribute('height', String(iconSize));
            bg.setAttribute('rx', '5');
            bg.setAttribute('ry', '5');
            // color depends on whether it's a fuel icon or a modifier icon
            bg.setAttribute('fill', '#5f032e');
            group.appendChild(bg);
        }
        group.appendChild(icon);
    }

    calculateProductivity(node: Goods): number {
        return ProductionCalculator.getInstance().getProductivity(node);
    }

    calculateTreeWidth(prodData: Goods): number {
        if (!prodData || !Array.isArray(prodData.input) || !prodData.input.length) {
            return 1;
        }
        return prodData.input.reduce((sum, input) => {
            if (Array.isArray(input.input)) {
                return sum + this.calculateTreeWidth(input);
            }
            return sum + 1;
        }, 0);
    }

    calculateMaxDepth(prodData: Goods, depth: number = 0): number {
        if (!prodData || !Array.isArray(prodData.input) || !prodData.input.length) {
            return depth;
        }
        return prodData.input.reduce((max, input) => {
            if (Array.isArray(input.input)) {
                return Math.max(max, this.calculateMaxDepth(input, depth + 1));
            }
            return Math.max(max, depth + 1);
        }, depth);
    }

    findGood(id: string, node?: Goods): GoodMetadata {
        const goods = GoodsRepository.getInstance().getGoodsList();
        const found = goods.find((good: RecipeListItem) => good.id === id);
        if (found) {
            return {
                id: found.id,
                displayName: found.displayName,
                icon: found.icon
            };
        }
        return { id, displayName: node?.name || id, icon: id };
    }

    setupInteractions(): void {
        if (!this.svgElement || this.interactionsBound) return;
        this.interactionsBound = true;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let viewBox = this.parseViewBox();
        const activeTouches = new Map<number, Point>();
        let initialPinchDistance: number | null = null;
        let initialViewBox: ViewBox | null = null;

        this.svgElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.svgElement.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button === 2) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                this.svgElement!.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        this.svgElement.addEventListener('mousemove', (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = (e.clientX - startX) * (viewBox.width / this.svgElement!.clientWidth);
            const dy = (e.clientY - startY) * (viewBox.height / this.svgElement!.clientHeight);
            viewBox.x -= dx;
            viewBox.y -= dy;
            this.updateViewBox(viewBox);
            startX = e.clientX;
            startY = e.clientY;
        });

        this.svgElement.addEventListener('mouseup', (e: MouseEvent) => {
            if (e.button === 2) {
                isDragging = false;
                this.svgElement!.style.cursor = 'default';
            }
        });

        this.svgElement.addEventListener('mouseleave', () => {
            isDragging = false;
            this.svgElement!.style.cursor = 'default';
        });

        this.svgElement.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            const rect = this.svgElement!.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const svgX = viewBox.x + (mouseX / this.svgElement!.clientWidth) * viewBox.width;
            const svgY = viewBox.y + (mouseY / this.svgElement!.clientHeight) * viewBox.height;
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const newWidth = viewBox.width * zoomFactor;
            const newHeight = viewBox.height * zoomFactor;
            viewBox.x = svgX - (mouseX / this.svgElement!.clientWidth) * newWidth;
            viewBox.y = svgY - (mouseY / this.svgElement!.clientHeight) * newHeight;
            viewBox.width = newWidth;
            viewBox.height = newHeight;
            this.updateViewBox(viewBox);
        });

        this.svgElement.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length > 0) e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches.item(i);
                if (!touch) continue;
                activeTouches.set(touch.identifier, this.clientToSvgPoint(touch));
            }
            if (activeTouches.size === 1) {
                const point = Array.from(activeTouches.values())[0]!;
                isDragging = true;
                startX = point.x;
                startY = point.y;
                this.svgElement!.style.cursor = 'grabbing';
            } else if (activeTouches.size === 2) {
                const points = Array.from(activeTouches.values());
                const p1 = points[0]!;
                const p2 = points[1]!;
                initialPinchDistance = this.distance(p1, p2);
                initialViewBox = { ...viewBox };
                isDragging = false;
            }
        }, { passive: false });

        this.svgElement.addEventListener('touchmove', (e: TouchEvent) => {
            if (e.touches.length > 0) e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches.item(i);
                if (!touch) continue;
                activeTouches.set(touch.identifier, this.clientToSvgPoint(touch));
            }
            if (activeTouches.size === 1 && isDragging) {
                const point = Array.from(activeTouches.values())[0]!;
                const dx = (point.x - startX) * (viewBox.width / this.svgElement!.clientWidth);
                const dy = (point.y - startY) * (viewBox.height / this.svgElement!.clientHeight);
                viewBox.x -= dx;
                viewBox.y -= dy;
                this.updateViewBox(viewBox);
                startX = point.x;
                startY = point.y;
            } else if (activeTouches.size === 2 && initialPinchDistance && initialViewBox) {
                const points = Array.from(activeTouches.values());
                const p1 = points[0]!;
                const p2 = points[1]!;
                const currentDistance = this.distance(p1, p2);
                if (currentDistance <= 0) return;
                const scale = initialPinchDistance / currentDistance;
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                const focusX = initialViewBox.x + (mid.x / this.svgElement!.clientWidth) * initialViewBox.width;
                const focusY = initialViewBox.y + (mid.y / this.svgElement!.clientHeight) * initialViewBox.height;
                const newWidth = initialViewBox.width * scale;
                const newHeight = initialViewBox.height * scale;
                viewBox.x = focusX - (mid.x / this.svgElement!.clientWidth) * newWidth;
                viewBox.y = focusY - (mid.y / this.svgElement!.clientHeight) * newHeight;
                viewBox.width = newWidth;
                viewBox.height = newHeight;
                this.updateViewBox(viewBox);
            }
        }, { passive: false });

        const resetTouches = () => {
            activeTouches.clear();
            initialPinchDistance = null;
            initialViewBox = null;
            isDragging = false;
            this.svgElement!.style.cursor = 'default';
        };

        this.svgElement.addEventListener('touchend', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches.item(i);
                if (!touch) continue;
                activeTouches.delete(touch.identifier);
            }
            if (activeTouches.size < 2) {
                initialPinchDistance = null;
                initialViewBox = null;
            }
            if (activeTouches.size === 0) {
                resetTouches();
            } else if (activeTouches.size === 1) {
                const point = Array.from(activeTouches.values())[0]!;
                isDragging = true;
                startX = point.x;
                startY = point.y;
            }
        });

        this.svgElement.addEventListener('touchcancel', resetTouches);
    }

    parseViewBox(): ViewBox {
        if (!this.svgElement) {
            return { x: 0, y: 0, width: 400, height: 400 };
        }
        const viewBoxStr = this.svgElement.getAttribute('viewBox');
        if (!viewBoxStr) {
            return { x: 0, y: 0, width: 400, height: 400 };
        }
        const vb = viewBoxStr.split(' ').map(Number).filter(v => !Number.isNaN(v));
        if (vb.length !== 4) {
            return { x: 0, y: 0, width: 400, height: 400 };
        }
        return { x: vb[0]!, y: vb[1]!, width: vb[2]!, height: vb[3]! };
    }

    updateViewBox(viewBox: ViewBox): void {
        this.svgElement?.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        if (this.currentGoodId) {
            this.viewBoxes.set(this.currentGoodId, { ...viewBox });
        }
    }

    clientToSvgPoint(touch: Touch): Point {
        const rect = this.svgElement!.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    distance(p1: Point, p2: Point): number {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.hypot(dx, dy);
    }

    /**
     * Click Event on the icon
     */
    displayInfoMenue(event: MouseEvent): void {
        if ((event as any).button !== 0) return;

        event.preventDefault();
        event.stopPropagation();

        const currentTarget = event.currentTarget as any;
        const { buildingCost, maintenanceCost, buildings, good } = currentTarget.productionData || {};
        if (!good) return;

        let infoContainer = document.createElement('div');
        infoContainer.classList.add("metadata-container");
        infoContainer.style.position = "absolute";
        infoContainer.style.left = `${event.clientX}px`;
        infoContainer.style.top = `${event.clientY}px`;
        infoContainer.tabIndex = -1;
        infoContainer.style.zIndex = '1000';

        const content = document.createElement('div');
        content.className = 'metadata-content';

        // Header
        const header = document.createElement('div');
        header.className = 'metadata-header';
        header.innerHTML = `
            <img src="./assets/icons/${good.icon || good.id}.png" alt="${good.displayName}" class="metadata-icon" onerror="this.style.display='none';"/>
            <h4>${good.displayName || good.id}</h4>
        `;
        content.appendChild(header);

        // Building Count
        const countInfo = document.createElement('div');
        countInfo.className = 'metadata-row';

        if (currentTarget.productionData.productivity) {
            const productivity = currentTarget.productionData.productivity;
            const productivityInfo = document.createElement('div');
            productivityInfo.className = 'metadata-row';
            productivityInfo.innerHTML = `<strong>Productivity:</strong> ${((productivity * 100) * Math.min(buildings, 1)).toFixed(0)}%`;
            content.appendChild(productivityInfo);
        }

        countInfo.innerHTML = `<strong>Required:</strong> ${buildings ? buildings.toFixed(2) : '0.00'}x`;
        content.appendChild(countInfo);

        // Helper to render cost list
        const renderCostList = (title: string, costs?: Record<string, number>) => {
            if (!costs || Object.keys(costs).length === 0) return null;
            const validCosts = Object.entries(costs).filter(([, amount]) => amount > 0);
            if (validCosts.length === 0) return null;

            const container = document.createElement('div');
            container.className = 'metadata-section';
            container.innerHTML = `<h5>${title}</h5>`;

            const list = document.createElement('div');
            list.className = 'cost-list';

            validCosts.forEach(([resource, amount]) => {
                const item = document.createElement('div');
                item.className = 'cost-resource';
                const label = resource.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                item.innerHTML = `<img src="./assets/icons/${resource}.png" alt="${label}" class="cost-icon-small" onerror="this.style.display='none';"/><span>${amount}</span>`;

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

                list.appendChild(item);
            });
            container.appendChild(list);
            return container;
        };

        // Costs
        const buildingCostEl = renderCostList('Construction Cost', buildingCost);
        if (buildingCostEl) content.appendChild(buildingCostEl);

        const maintenanceCostEl = renderCostList('Maintenance', maintenanceCost);
        if (maintenanceCostEl) content.appendChild(maintenanceCostEl);

        infoContainer.appendChild(content);
        document.body.appendChild(infoContainer);

        // Focus and cleanup
        setTimeout(() => {
            infoContainer.focus();
        }, 10);

        let closed = false;
        const closeMenu = () => {
            if (closed) return;
            closed = true;
            infoContainer.remove();
            document.removeEventListener('mousedown', outsideClickListener);
        };

        const outsideClickListener = (e: MouseEvent) => {
            if (!infoContainer.contains(e.target as Node)) {
                closeMenu();
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', outsideClickListener);
        }, 0);

        infoContainer.addEventListener("focusout", (e: FocusEvent) => {
            if (infoContainer.contains(e.relatedTarget as Node)) return;
            closeMenu();
        });

        // Also close on Escape
        infoContainer.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMenu();
        });
    }
}
