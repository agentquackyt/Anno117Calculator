const CENTER_X = 200;
const CENTER_Y = 40;

/**
 * Renders dependency graphs inside an external SVG template.
 */
export class GraphRenderer {
    constructor({
        templatePath = 'svg/dependency-graph.svg',
        goodsRepository,
        configProvider
    }) {
        this.templatePath = templatePath;
        this.goodsRepository = goodsRepository;
        this.configProvider = configProvider;
        this.svgMarkup = null;
        this.svgElement = null;
        this.interactionsBound = false;
    }

    async attach(container) {
        if (!container) return;
        // replace by creating the element directly and not fetch it?
        // <svg xmlns="http://www.w3.org/2000/svg" id="dependency-graph" class="dependency-graph" viewBox="0 0 400 400"></svg>
        const svgElement = document.createElement('svg');
        svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgElement.setAttribute('id', 'dependency-graph');
        svgElement.setAttribute('class', 'dependency-graph');
        svgElement.setAttribute('viewBox', '0 0 400 400');
        this.svgMarkup = svgElement.outerHTML;
        container.innerHTML = this.svgMarkup;
        this.svgElement = container.querySelector('#dependency-graph');
        this.interactionsBound = false;
        this.setupInteractions();
    }

    render(productionData, allBuildings) {
        if (!this.svgElement || !productionData) return;
        this.clearSvg();
        if (!allBuildings || Object.keys(allBuildings).length === 0) return;

        const maxDepth = this.calculateMaxDepth(productionData);
        const treeWidth = this.calculateTreeWidth(productionData);
        const nodeSpacing = 90;
        const totalWidth = treeWidth * nodeSpacing;

        this.renderRecursiveGraph(productionData, CENTER_X, CENTER_Y, 0, allBuildings, totalWidth, null, null, maxDepth);
    }

    clearSvg() {
        if (!this.svgElement) return;
        while (this.svgElement.firstChild) {
            this.svgElement.removeChild(this.svgElement.firstChild);
        }
    }

    renderRecursiveGraph(prodData, x, y, depth, allBuildings, availableWidth, parentX, parentY, maxDepth) {
        if (!prodData || depth > 5) return;

        const good = this.findGood(prodData.id);
        const hasFuel = Array.isArray(prodData.fuel) && prodData.fuel.length > 0;
        const buildings = allBuildings[prodData.id] || 0;
        const buildingType = prodData.type || '';

        const textAlign = depth === 0 ? 'left' : (x < CENTER_X ? 'left' : 'right');
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
            depth,
            maxDepth,
            isLeaf,
            startOfChain: false
        });

        if (typeof parentX === 'number' && typeof parentY === 'number') {
            this.drawLink(parentX, parentY + 32, x, y - 32, depth === 0);
        }

        if (!inputs.length) return;
        const nextY = y + 120;

        const inputWidths = inputs.map((input) => input.recipe ? this.calculateTreeWidth(input.recipe) : 1);
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

        const nodeSpacing = hasRightAlignedText ? 140 : 90;
        let currentOffset = x - (totalWidth * nodeSpacing) / 2;

        inputs.forEach((input, index) => {
            if (!input.id) return;
            const widthUnits = inputWidths[index];
            const inputX = currentOffset + (widthUnits * nodeSpacing) / 2;
            currentOffset += widthUnits * nodeSpacing;

            if (input.recipe) {
                this.renderRecursiveGraph(input.recipe, inputX, nextY, depth + 1, allBuildings, widthUnits * nodeSpacing, x, y, maxDepth);
                return;
            }

            if (input.start_of_chain) {
                const inputGood = this.findGood(input.id);
                const inputBuildings = allBuildings[input.id] || 0;
                const align = inputX < CENTER_X ? 'left' : 'right';

                this.addNode({
                    x: inputX,
                    y: nextY,
                    good: inputGood,
                    buildings: inputBuildings,
                    textAlign: align,
                    hasFuel: false,
                    buildingType: input.type || '',
                    depth: depth + 1,
                    maxDepth,
                    isLeaf: true,
                    startOfChain: true
                });
                this.drawLink(x, y + 32, inputX, nextY - 32, false);
            }
        });
    }

    addNode({ x, y, good, buildings, textAlign, hasFuel, buildingType, depth, maxDepth, isLeaf, startOfChain }) {
        if (!this.svgElement) return;
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

        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `icons/${good.icon || good.id}.png`);
        img.setAttribute('x', String(x - size / 2));
        img.setAttribute('y', String(y - size / 2));
        img.setAttribute('width', String(size));
        img.setAttribute('height', String(size));
        group.appendChild(img);

        if (hasFuel) {
            this.addCornerImage(group, x, y, size, 'icons/charcoal.png');
        }

        if (this.shouldShowAqueductBadge(buildingType)) {
            this.addAqueductBadge(group, x, y, size);
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

    drawLink(x1, y1, x2, y2, primary) {
        if (!this.svgElement) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('class', primary ? 'graph-link' : 'graph-link-secondary');
        this.svgElement.insertBefore(line, this.svgElement.firstChild);
    }

    resolveLabelGeometry({ x, y, textAlign, label, buildings, depth, maxDepth, isLeaf, startOfChain }) {
        const approxLabelWidth = Math.max(label.length, buildings.length) * 7;
        if (maxDepth >= 3 && isLeaf && startOfChain) {
            return { labelX: x, labelY: y + 50, buildingsY: y + 67, labelAnchor: 'middle' };
        }
        if (textAlign === 'right') {
            const offset = 40 + Math.max(0, approxLabelWidth - 70);
            return {
                labelX: x + offset,
                labelY: y - 5,
                buildingsY: y + 12,
                labelAnchor: 'start'
            };
        }
        const offset = depth === 0 ? 40 : (40 + Math.max(0, approxLabelWidth - 70));
        return {
            labelX: x - offset,
            labelY: y - 5,
            buildingsY: y + 12,
            labelAnchor: 'end'
        };
    }

    addCornerImage(group, x, y, size, href) {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        const iconSize = 32;
        icon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
        icon.setAttribute('x', String(x + 37 - size / 2));
        icon.setAttribute('y', String(y + 37 - size / 2));
        icon.setAttribute('width', String(iconSize));
        icon.setAttribute('height', String(iconSize));
        group.appendChild(icon);
    }

    addAqueductBadge(group, x, y, size) {
        const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const badgeSize = 32;
        box.setAttribute('x', String(x + 37 - size / 2));
        box.setAttribute('y', String(y + 37 - size / 2));
        box.setAttribute('width', String(badgeSize));
        box.setAttribute('height', String(badgeSize));
        box.setAttribute('rx', '4');
        box.setAttribute('ry', '4');
        box.setAttribute('class', 'aquaduct-box');
        group.appendChild(box);

        this.addCornerImage(group, x, y, size, 'icons/aquaduct.png');
    }

    shouldShowAqueductBadge(buildingType) {
        const config = this.configProvider ? this.configProvider() : {};
        if (!config.aqueductsEnabled) return false;
        if (buildingType === 'farm') {
            return Boolean(config.fieldIrrigation);
        }
        if (buildingType === 'plantation') {
            return Boolean(config.aquaArborica);
        }
        return false;
    }

    calculateTreeWidth(prodData) {
        if (!prodData || !Array.isArray(prodData.input) || !prodData.input.length) {
            return 1;
        }
        return prodData.input.reduce((sum, input) => {
            if (input.recipe) {
                return sum + this.calculateTreeWidth(input.recipe);
            }
            return sum + 1;
        }, 0);
    }

    calculateMaxDepth(prodData, depth = 0) {
        if (!prodData || !Array.isArray(prodData.input) || !prodData.input.length) {
            return depth;
        }
        return prodData.input.reduce((max, input) => {
            if (input.recipe) {
                return Math.max(max, this.calculateMaxDepth(input.recipe, depth + 1));
            }
            return Math.max(max, depth + 1);
        }, depth);
    }

    findGood(id) {
        const goods = this.goodsRepository?.getGoods?.() || [];
        return goods.find((good) => good.id === id) || { id, displayName: id, icon: id };
    }

    setupInteractions() {
        if (!this.svgElement || this.interactionsBound) return;
        this.interactionsBound = true;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let viewBox = this.parseViewBox();
        const activeTouches = new Map();
        let initialPinchDistance = null;
        let initialViewBox = null;

        this.svgElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.svgElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                this.svgElement.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        this.svgElement.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = (e.clientX - startX) * (viewBox.width / this.svgElement.clientWidth);
            const dy = (e.clientY - startY) * (viewBox.height / this.svgElement.clientHeight);
            viewBox.x -= dx;
            viewBox.y -= dy;
            this.updateViewBox(viewBox);
            startX = e.clientX;
            startY = e.clientY;
        });

        this.svgElement.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                isDragging = false;
                this.svgElement.style.cursor = 'default';
            }
        });

        this.svgElement.addEventListener('mouseleave', () => {
            isDragging = false;
            this.svgElement.style.cursor = 'default';
        });

        this.svgElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.svgElement.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const svgX = viewBox.x + (mouseX / this.svgElement.clientWidth) * viewBox.width;
            const svgY = viewBox.y + (mouseY / this.svgElement.clientHeight) * viewBox.height;
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const newWidth = viewBox.width * zoomFactor;
            const newHeight = viewBox.height * zoomFactor;
            viewBox.x = svgX - (mouseX / this.svgElement.clientWidth) * newWidth;
            viewBox.y = svgY - (mouseY / this.svgElement.clientHeight) * newHeight;
            viewBox.width = newWidth;
            viewBox.height = newHeight;
            this.updateViewBox(viewBox);
        });

        this.svgElement.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) e.preventDefault();
            for (const touch of e.changedTouches) {
                activeTouches.set(touch.identifier, this.clientToSvgPoint(touch));
            }
            if (activeTouches.size === 1) {
                const [point] = activeTouches.values();
                isDragging = true;
                startX = point.x;
                startY = point.y;
                this.svgElement.style.cursor = 'grabbing';
            } else if (activeTouches.size === 2) {
                const [p1, p2] = activeTouches.values();
                initialPinchDistance = this.distance(p1, p2);
                initialViewBox = { ...viewBox };
                isDragging = false;
            }
        }, { passive: false });

        this.svgElement.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) e.preventDefault();
            for (const touch of e.changedTouches) {
                activeTouches.set(touch.identifier, this.clientToSvgPoint(touch));
            }
            if (activeTouches.size === 1 && isDragging) {
                const [point] = activeTouches.values();
                const dx = (point.x - startX) * (viewBox.width / this.svgElement.clientWidth);
                const dy = (point.y - startY) * (viewBox.height / this.svgElement.clientHeight);
                viewBox.x -= dx;
                viewBox.y -= dy;
                this.updateViewBox(viewBox);
                startX = point.x;
                startY = point.y;
            } else if (activeTouches.size === 2 && initialPinchDistance && initialViewBox) {
                const [p1, p2] = activeTouches.values();
                const currentDistance = this.distance(p1, p2);
                if (currentDistance <= 0) return;
                const scale = initialPinchDistance / currentDistance;
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                const focusX = initialViewBox.x + (mid.x / this.svgElement.clientWidth) * initialViewBox.width;
                const focusY = initialViewBox.y + (mid.y / this.svgElement.clientHeight) * initialViewBox.height;
                const newWidth = initialViewBox.width * scale;
                const newHeight = initialViewBox.height * scale;
                viewBox.x = focusX - (mid.x / this.svgElement.clientWidth) * newWidth;
                viewBox.y = focusY - (mid.y / this.svgElement.clientHeight) * newHeight;
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
            this.svgElement.style.cursor = 'default';
        };

        this.svgElement.addEventListener('touchend', (e) => {
            for (const touch of e.changedTouches) {
                activeTouches.delete(touch.identifier);
            }
            if (activeTouches.size < 2) {
                initialPinchDistance = null;
                initialViewBox = null;
            }
            if (activeTouches.size === 0) {
                resetTouches();
            } else if (activeTouches.size === 1) {
                const [point] = activeTouches.values();
                isDragging = true;
                startX = point.x;
                startY = point.y;
            }
        });

        this.svgElement.addEventListener('touchcancel', resetTouches);
    }

    parseViewBox() {
        if (!this.svgElement) {
            return { x: 0, y: 0, width: 400, height: 400 };
        }
        const vb = this.svgElement.getAttribute('viewBox')?.split(' ').map(Number);
        if (!vb || vb.length !== 4 || vb.some((value) => Number.isNaN(value))) {
            return { x: 0, y: 0, width: 400, height: 400 };
        }
        return { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
    }

    updateViewBox(viewBox) {
        this.svgElement?.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    }

    clientToSvgPoint(touch) {
        const rect = this.svgElement.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.hypot(dx, dy);
    }
}
