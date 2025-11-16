let GOODS_LIST = [];
let PRODUCTION_DATA = {};
let currentGood = null;

let config = {
    aqueductsEnabled: false,
    aquaArborica: false,
    fieldIrrigation: false
}

/**
 * Initialize the calculator
 */
async function init() {
    console.log('[Calculator] Initializing calculator...');
    
    // Initialize settings
    initSettings();
    
    try {
        // Fetch the goods list
        console.log('[Calculator] Fetching goods list from productions/list.json');
        const response = await fetch('productions/list.json');
        console.log('[Calculator] Goods list fetch response:', response.status, response.statusText);
        const data = await response.json();
        console.log('[Calculator] Parsed goods list data:', data);
        GOODS_LIST = data.goods || [];
        
        console.log(`[Calculator] ✓ Loaded ${GOODS_LIST.length} goods`);
        
        // Display the goods table
        console.log('[Calculator] Displaying goods table');
        displayGoodsTable();

        // Check for URL parameter to auto-load a chain
        const urlParams = new URLSearchParams(window.location.search);
        const chainParam = urlParams.get('chain');
        if (chainParam) {
            console.log(`[Calculator] Auto-loading chain from URL parameter: ${chainParam}`);
            const good = GOODS_LIST.find(g => g.id === chainParam);
            if (good) {
                loadGoodIntoCalculator(good);
            } else {
                console.warn(`[Calculator] Chain '${chainParam}' not found in goods list`);
            }
        }
    } catch (error) {
        console.error('Error loading goods list:', error);
        document.getElementById('selection-container').innerHTML = 
            '<p class="error">Error loading goods list. Please check the console for details.</p>';
    }
}

/**
 * Display the goods table with search functionality
 */
function displayGoodsTable() {
    const container = document.getElementById('selection-container');
    container.classList.remove('hidden');

    // Store the h3 element
    const heading = container.querySelector('h3');

    // Create search input
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="goods-search" placeholder="Search goods..." />
    `;

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'goods-grid-container';

    const grid = document.createElement('div');
    grid.className = 'goods-grid';
    grid.id = 'goods-grid';

    gridContainer.appendChild(grid);

    // Clear container but keep heading
    container.innerHTML = '';
    if (heading) container.appendChild(heading);
    container.appendChild(searchContainer);
    container.appendChild(gridContainer);

    // Render all goods initially
    renderGoodsRows(GOODS_LIST);

    // Add search event listener
    document.getElementById('goods-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = GOODS_LIST.filter(good =>
            good.displayName.toLowerCase().includes(searchTerm) ||
            good.id.toLowerCase().includes(searchTerm)
        );
        renderGoodsRows(filtered);
    });
}

/**
 * Render goods cards in the grid
 * 
 * @param {Array} goods - List of goods to render
 */
function renderGoodsRows(goods) {
    const grid = document.getElementById('goods-grid');
    grid.innerHTML = '';
    
    goods.forEach(good => {
        if (good.startOfChain) return;
        const card = document.createElement('div');
        card.className = 'goods-card';
        card.dataset.goodId = good.id;
        
        card.innerHTML = `
            <div class="goods-card-icon">
                <img src="icons/${good.icon}.png" alt="${good.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <div class="icon-placeholder" style="display:none;">
                    ${good.icon.substring(0, 2).toUpperCase()}
                </div>
            </div>
            <div class="goods-card-name">${good.displayName}</div>
        `;
        
        // Make card clickable
        card.addEventListener('click', () => {
            loadGoodIntoCalculator(good);
        });
        
        grid.appendChild(card);
    });
}

/**
 * Load a good into the calculator
 */
async function loadGoodIntoCalculator(good) {
    currentGood = good;
    const calculatorContainer = document.getElementById('calculator-container');
    const selectionContainer = document.getElementById('selection-container');

    // Update URL parameter
    const url = new URL(window.location);
    url.searchParams.set('chain', good.id);
    window.history.pushState({}, '', url);

    // Switch view: hide list, show calculator
    selectionContainer.classList.add('hidden');
    calculatorContainer.classList.remove('hidden');
    
    // Highlight selected card
    document.querySelectorAll('.goods-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-good-id="${good.id}"]`)?.classList.add('selected');
    
    calculatorContainer.innerHTML = `
        <div class="calculator-header">
            <button class="back-button" type="button" aria-label="Back to list" onclick="showSelectionView()">
                &larr;
            </button>
            <h3>Production Chain: ${good.id}</h3>
        </div>
        <div class="calculator-content">
            <p>Loading production data for <strong>${good.id}</strong>...</p>
        </div>
    `;
    
    console.log(`[Calculator] Loading good into calculator: ${good.id}`);
    try {
        // Try to load the production file for this good
        console.log(`[Calculator] Fetching production data: productions/${good.id}.json`);
        const response = await fetch(`productions/${good.id}.json`);
        console.log(`[Calculator] Production data fetch response:`, response.status, response.statusText);
        
        if (response.ok) {
            const productionData = await response.json();
            console.log(`[Calculator] ✓ Parsed production data for ${good.id}:`, productionData);
            displayProductionChain(good, productionData);
        } else {
            // If no specific production file, show basic info
            console.warn(`[Calculator] No production file found for ${good.id}, showing basic info`);
            displayBasicGoodInfo(good);
        }
    } catch (error) {
        console.error(`[Calculator] ✗ Error loading production data for ${good.id}:`, error);
        displayBasicGoodInfo(good);
    }
}

/**
 * Recursively load production data for a good and all its non-start-of-chain inputs
 */
async function loadProductionDataRecursive(goodId, visited = new Set()) {
    // Prevent infinite loops
    if (visited.has(goodId)) {
        return null;
    }
    visited.add(goodId);

    try {
        const response = await fetch(`productions/${goodId}.json`);
        if (!response.ok) {
            console.warn(`[Calculator] No production file for ${goodId}`);
            return null;
        }

        const data = await response.json();
        
        // Load recipes for non-start-of-chain inputs
        if (data.input && data.input.length > 0) {
            for (let input of data.input) {
                if (!input.start_of_chain && input.id) {
                    // Load the recipe for this input
                    const inputRecipe = await loadProductionDataRecursive(input.id, visited);
                    if (inputRecipe) {
                        // Attach the recipe to the input object
                        input.recipe = inputRecipe;
                    }
                }
            }
        }

        return data;
    } catch (error) {
        console.error(`[Calculator] Error loading recipe for ${goodId}:`, error);
        return null;
    }
}

/**
 * Display production chain details
 */
async function displayProductionChain(good, productionData) {
    const calculatorContainer = document.getElementById('calculator-container');
    console.log(`[Calculator] Displaying production chain for ${good.id}`);
    
    // Load all recursive production data
    const fullProductionData = await loadProductionDataRecursive(good.id);
    if (fullProductionData) {
        productionData = fullProductionData;
    }
    
    console.log(`[Calculator] Full production data with recipes:`, productionData);

    let html = `
        <div class="calculator-header">
            <button class="back-button" type="button" aria-label="Back to list" onclick="showSelectionView()">
                &larr;
            </button>
            <h3>Production Chain: ${good.id}</h3>
        </div>
        <div class="production-controls">
                    <label for="target-rate">Target output per minute:</label>
                    <input id="target-rate" type="number" min="0" step="0.5" value="1" />
                    <button id="recommend-ratio-btn" type="button" class="recommend-button">Recommended Ratio</button>
                </div>
        <div class="calculator-content two-column">
            <div class="production-column">
                
                <div class="production-info">
                    <h4>Output</h4>
                    <div class="production-grid">
                        <div class="production-card">
                            <div class="production-card-icon">
                                <img src="icons/${productionData.head?.icon || good.icon}.png" alt="${good.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                <div class="icon-placeholder" style="display:none;">
                                    ${(productionData.head?.icon || good.icon).substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div class="production-card-name">${good.displayName}</div>
                            ${productionData.time ? (() => {
                                const hasActiveBoosts = config.aqueductsEnabled && ((productionData.type === 'plantation' && config.aquaArborica) || (productionData.type === 'farm' && config.fieldIrrigation));
                                const adjustedTime = hasActiveBoosts ? getAdjustedTime(productionData) : productionData.time;
                                const isBoosted = hasActiveBoosts && Math.abs(adjustedTime - productionData.time) > 0.01;
                                const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
                                return `<div class="production-card-time">${formatTime(adjustedTime)}${isBoosted ? ` (${formatTime(productionData.time)})` : ''} min${isBoosted ? '<div class="boosted-indicator">Boosted</div>' : ''}</div>`;
                            })() : ''}
                        </div>
                    </div>
                </div>
    `;

    // Collect all base inputs (start_of_chain items) recursively
    function collectBaseInputs(prodData, baseInputs = new Map()) {
        if (!prodData || !prodData.input) return baseInputs;
        
        prodData.input.forEach(input => {
            if (!input.id) return;
            
            if (input.start_of_chain) {
                // This is a base input - add it
                if (!baseInputs.has(input.id)) {
                    baseInputs.set(input.id, input);
                }
            } else if (input.recipe) {
                // This is an intermediate product - recurse into it
                collectBaseInputs(input.recipe, baseInputs);
            }
        });
        
        return baseInputs;
    }
    
    const baseInputs = collectBaseInputs(productionData);
    
    if (baseInputs.size > 0) {
        html += `
                <div class="production-info">
                    <h4>Base Inputs</h4>
                    <div class="production-grid">
        `;

        baseInputs.forEach((input, inputId) => {
            const inputGood = GOODS_LIST.find(g => g.id === inputId) || { displayName: inputId, icon: inputId };
            html += `
                        <div class="production-card" data-input-id="${inputId}">
                            <div class="production-card-icon">
                                <img src="icons/${inputGood.icon}.png" alt="${inputGood.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                <div class="icon-placeholder" style="display:none;">
                                    ${inputGood.icon.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div class="production-card-name">${inputGood.displayName}</div>
                            ${input.time ? (() => {
                                const hasActiveBoosts = config.aqueductsEnabled && ((input.type === 'plantation' && config.aquaArborica) || (input.type === 'farm' && config.fieldIrrigation));
                                const adjustedTime = hasActiveBoosts ? getAdjustedTime(input) : input.time;
                                const isBoosted = hasActiveBoosts && Math.abs(adjustedTime - input.time) > 0.01;
                                const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
                                return `<div class="production-card-time">${formatTime(adjustedTime)}${isBoosted ? ` (${formatTime(input.time)})` : ''} min${isBoosted ? '<div class="boosted-indicator">Boosted</div>' : ''}</div>`;
                            })() : ''}
                            <div class="production-card-count" data-building-count="${inputId}">0.00x</div>
                        </div>
            `;
        });

        html += `    </div>
                </div>`;
    }

    if (productionData.fuel && productionData.fuel.length > 0) {
        html += `
                <div class="production-info">
                    <h4>Fuel</h4>
                    <div class="production-grid">
        `;

        productionData.fuel.forEach(fuel => {
            const fuelGood = GOODS_LIST.find(g => g.id === fuel.id) || { displayName: fuel.id, icon: fuel.id };
            html += `
                        <div class="production-card">
                            <div class="production-card-icon">
                                <img src="icons/${fuelGood.icon}.png" alt="${fuelGood.displayName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                <div class="icon-placeholder" style="display:none;">
                                    ${fuelGood.icon.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div class="production-card-name">${fuelGood.displayName}</div>
                            ${fuel.burning_time ? `<div class="production-card-time">${Math.floor(fuel.burning_time / 60)}:${String(fuel.burning_time % 60).padStart(2, '0')}</div>` : ''}
                            <div class="production-card-count" data-fuel-building-count="${fuel.id}">0.00x</div>
                        </div>
            `;
        });

        html += `    </div>
                </div>`;
    }

    html += `
            </div> <!-- /production-column -->
            <div class="graph-column">
                <div class="production-graph">
                    <h4>Dependency Graph</h4>
                    <svg id="dependency-graph" class="dependency-graph" viewBox="0 0 400 400"></svg>
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
        </div>`;

    calculatorContainer.innerHTML = html;

    // After rendering, hook up rate input and initial graph
    const targetInput = document.getElementById('target-rate');
    const ratePerMinute = parseFloat(targetInput.value) || 1;
    updateDependencyGraph(productionData, ratePerMinute);
    updateFuelBuildingCounts(productionData, ratePerMinute);

    targetInput.addEventListener('input', () => {
        const value = parseFloat(targetInput.value);
        const rate = isNaN(value) || value < 0 ? 0 : value;
        updateDependencyGraph(productionData, rate);

        // Also update fuel building counts (e.g., charcoal) based on new rate
        updateFuelBuildingCounts(productionData, rate);
    });

    // Hook up recommended ratio button
    const recommendBtn = document.getElementById('recommend-ratio-btn');
    recommendBtn.addEventListener('click', () => {
        const recommendedRate = findRecommendedRatio(productionData);
        targetInput.value = recommendedRate.toFixed(2);
        updateDependencyGraph(productionData, recommendedRate);
        updateFuelBuildingCounts(productionData, recommendedRate);
    });
}

/**
 * Update fuel building counts (e.g., charcoal) when target rate changes
 */
function updateFuelBuildingCounts(productionData, targetPerMinute) {
    if (!productionData || !productionData.fuel || productionData.fuel.length === 0) return;

    const secondsPerMinute = 60;
    const allBuildings = collectAllBuildings(productionData, targetPerMinute);
    const consumingBuildings = productionData.id ? (allBuildings[productionData.id] || 0) : 0;

    productionData.fuel.forEach(fuel => {
        const burningTime = fuel.burning_time || 120;
        const fuelBuildingDuration = 30; // charcoal building produces on a 30s cycle

        const fuelPerBuildingPerMinute = burningTime > 0 ? secondsPerMinute / burningTime : 0;
        const totalFuelNeededPerMinute = consumingBuildings * fuelPerBuildingPerMinute;

        const fuelPerBuildingProductionPerMinute = fuelBuildingDuration > 0 ? secondsPerMinute / fuelBuildingDuration : 0;
        const fuelBuildingsNeeded = fuelPerBuildingProductionPerMinute > 0
            ? totalFuelNeededPerMinute / fuelPerBuildingProductionPerMinute
            : 0;

        const fuelCountEl = document.querySelector(`[data-fuel-building-count="${fuel.id}"]`);
        if (fuelCountEl) {
            fuelCountEl.textContent = `${fuelBuildingsNeeded.toFixed(2)}x`;
        }
    });
}

/**
 * Display basic good information when no production file exists
 */
function displayBasicGoodInfo(good) {
    const calculatorContainer = document.getElementById('calculator-container');
    
    calculatorContainer.innerHTML = `
        <div class="calculator-header">
            <button class="back-button" type="button" aria-label="Back to list" onclick="showSelectionView()">
                &#8592;
            </button>
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
}

/**
 * Find the smallest target rate (output per minute) where all buildings
 * are close to whole numbers, giving a practical building ratio.
 *
 * Strategy:
 * - Collect all cycle times recursively from the entire production chain
 * - Compute the LCM of all relevant cycle times (output + all inputs).
 * - The smallest rate that yields whole-number buildings is based on this LCM.
 * - We iteratively search small multiples of a base rate until all building
 *   counts are within 0.05 of a whole number.
 *
 * @param {Object} productionData - The production chain data
 * @returns {number} - Recommended target output per minute
 */
function findRecommendedRatio(productionData) {
    const secondsPerMinute = 60;

    // Recursively collect all cycle times from the entire chain
    function collectCycleTimes(prodData, times = []) {
        if (!prodData) return times;
        
        const duration = prodData.time || 60;
        times.push(duration);
        
        if (prodData.input) {
            prodData.input.forEach(input => {
                if (input.recipe) {
                    // Recursive input
                    collectCycleTimes(input.recipe, times);
                } else if (input.time) {
                    // Direct input
                    times.push(input.time);
                }
            });
        }
        
        return times;
    }

    const cycleTimes = collectCycleTimes(productionData);

    // Compute LCM of all cycle times to find a common base
    function gcd(a, b) {
        return b === 0 ? a : gcd(b, a % b);
    }

    function lcm(a, b) {
        return (a * b) / gcd(a, b);
    }

    const lcmTime = cycleTimes.reduce((acc, time) => lcm(acc, time), 1);

    // Base rate: one output cycle's worth spread over a minute
    // We'll search multiples of a small increment until we find whole buildings
    const baseIncrement = secondsPerMinute / lcmTime;

    // Helper: check if all buildings are close to whole numbers for a given rate
    function allBuildingsWhole(rate) {
        const threshold = 0.05; // within 5% of a whole number

        const allBuildings = collectAllBuildings(productionData, rate);
        
        for (const [goodId, buildings] of Object.entries(allBuildings)) {
            if (goodId === '_metadata') continue;
            
            const frac = Math.abs(buildings - Math.round(buildings));
            if (frac > threshold && frac < (1 - threshold)) return false;
        }

        return true;
    }

    // Search for the smallest rate (up to 100 increments) that gives whole buildings
    for (let multiplier = 1; multiplier <= 100; multiplier++) {
        const candidateRate = baseIncrement * multiplier;
        if (allBuildingsWhole(candidateRate)) {
            return candidateRate;
        }
    }

    // Fallback: return a rate of 1 output per minute if no good ratio found
    return 1;
}

/**
 * Calculate adjusted production time based on productivity bonuses
 * Rule: If aqueducts are enabled, for plantation/farm buildings, double productivity (multiply time by 0.5)
 */
function getAdjustedTime(productionData) {
    let time = productionData.time || 60;
    let productivity = 1.0; // 100% = 1.0
    
    const buildingType = productionData.type || '';
    
    // Aqueducts for farms and plantations (double productivity = time * 0.5)
    if (config.aqueductsEnabled) {
        if (buildingType === 'plantation' && config.aquaArborica) {
            productivity *= 2.0;
        } else if (buildingType === 'farm' && config.fieldIrrigation) {
            productivity *= 2.0;
        }
    }
    
    // Adjusted time = base time / productivity
    return time / productivity;
}

/**
 * Recursively collect all buildings needed in the production chain
 */
function collectAllBuildings(productionData, requiredPerMinute, result = {}, depth = 0) {
    if (!productionData || depth > 10) return result; // Prevent infinite recursion

    const secondsPerMinute = 60;
    const adjustedDuration = getAdjustedTime(productionData);
    
    // Calculate buildings needed for this production step
    const buildings = adjustedDuration > 0 ? (requiredPerMinute * adjustedDuration) / secondsPerMinute : 0;
    
    // Store this building count
    const key = productionData.id || 'unknown';
    result[key] = (result[key] || 0) + buildings;
    
    // Store the production data for this good if not already stored
    if (!result._metadata) result._metadata = {};
    if (!result._metadata[key]) {
        result._metadata[key] = productionData;
    }
    
    // Calculate output cycles per minute
    const outputCyclesPerMinute = adjustedDuration > 0 ? (buildings * secondsPerMinute) / adjustedDuration : 0;
    
    // Process inputs
    if (productionData.input && productionData.input.length > 0) {
        productionData.input.forEach(input => {
            if (!input.id) return;

            const requiredInputPerMinute = outputCyclesPerMinute;

            if (input.start_of_chain) {
                // Direct input - calculate buildings with adjusted time.
                // Special rule for charcoal fuel: each consuming building
                // uses 1 charcoal every 120 seconds regardless of its own
                // production time. Treat fuel as consumption-only here.
                let inputBuildings;

                if (input.id === 'charcoal' && productionData.fuel && productionData.fuel.some(f => f.id === 'charcoal')) {
                    const charcoalConsumptionPerBuildingPerMinute = secondsPerMinute / 120;
                    const charcoalRequiredPerMinute = buildings * charcoalConsumptionPerBuildingPerMinute;
                    const charcoalProductionDuration = 30; // 30s per charcoal building
                    const charcoalRatePerBuilding = secondsPerMinute / charcoalProductionDuration;
                    inputBuildings = charcoalRatePerBuilding > 0 ? charcoalRequiredPerMinute / charcoalRatePerBuilding : 0;
                } else {
                    const adjustedInputDuration = getAdjustedTime(input);
                    const inputRatePerBuilding = adjustedInputDuration > 0 ? secondsPerMinute / adjustedInputDuration : 0;
                    inputBuildings = inputRatePerBuilding > 0 ? requiredInputPerMinute / inputRatePerBuilding : 0;
                }

                result[input.id] = (result[input.id] || 0) + inputBuildings;

                // Store metadata
                if (!result._metadata[input.id]) {
                    result._metadata[input.id] = input;
                }
            } else if (input.recipe) {
                // Recursive input - calculate its chain
                collectAllBuildings(input.recipe, requiredInputPerMinute, result, depth + 1);
            }
        });
    }
    
    return result;
}

/**
 * Compute and render a simple dependency graph as SVG.
 *
 * Assumptions (as requested):
 * - Each building produces quantity = 1 per production cycle.
 * - Each input is consumed in quantity = 1 per output cycle.
 * - `productionData.time` is the output building's cycle time in seconds.
 * - `input.time` (if present) is the input building's cycle time in seconds;
 *   if missing, we assume it matches the output building.
 *
 * This lets us compute *ratios* between buildings purely from the cycle times.
 */
function updateDependencyGraph(productionData, targetPerMinute) {
    const svg = document.getElementById('dependency-graph');
    if (!svg || !productionData) return;

    // Clear existing graph
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }

    const secondsPerMinute = 60;

    // Collect all buildings in the full chain
    const allBuildings = collectAllBuildings(productionData, targetPerMinute);
    console.log('[Calculator] All buildings in chain:', allBuildings);

    // --- Main output building ---
    const outDuration = productionData.time || 60; // seconds per cycle

    // quantity per cycle is always 1, so:
    // mainBuildings = targetPerMinute / (1 * 60 / outDuration)
    //                = targetPerMinute * outDuration / 60
    const mainBuildings = outDuration > 0
        ? (targetPerMinute * outDuration) / secondsPerMinute
        : 0;

    const centerX = 200;
    const centerY = 40;

    // Helper to create node with icon and side text (rounded square background)
    function addNode(x, y, good, buildings, textAlign = 'left', hasFuel = false, buildingType = '', depth = 0, maxDepth = 0, isLeaf = false, startOfChain = false) {
        const label = good.displayName || good.id || 'good';
        const iconName = good.icon || good.id || '';

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

        // Icon image inside the rounded square (128x128 source scaled to contain)
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `icons/${iconName}.png`);
        // Contain: scale the 128x128 image down to fit into the 64x64 square
        img.setAttribute('x', String(x - size / 2));
        img.setAttribute('y', String(y - size / 2));
        img.setAttribute('width', String(size));
        img.setAttribute('height', String(size));
        group.appendChild(img);

        // Add charcoal fuel indicator if building uses fuel
        if (hasFuel) {
            const fuelSize = 32;
            // Fixed offset: +37 from center in x, +37 from center in y
            const fuelImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            fuelImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'icons/charcoal.png');
            fuelImg.setAttribute('x', String(x + 37 - size / 2));
            fuelImg.setAttribute('y', String(y + 37 - size / 2));
            fuelImg.setAttribute('width', String(fuelSize));
            fuelImg.setAttribute('height', String(fuelSize));
            group.appendChild(fuelImg);
        }

        // Add aquaduct indicator if aqueducts are enabled and the specific setting is on
        const shouldShowAqueduct = config.aqueductsEnabled && (
            (buildingType === 'farm' && config.fieldIrrigation) ||
            (buildingType === 'plantation' && config.aquaArborica)
        );
        
        if (shouldShowAqueduct) {
            const aquaductSize = 32;
            // Same fixed offset: +37 from center in x, +37 from center in y
            
            // Add colored box background
            const aquaductBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            aquaductBox.setAttribute('x', String(x + 37 - size / 2));
            aquaductBox.setAttribute('y', String(y + 37 - size / 2));
            aquaductBox.setAttribute('width', String(aquaductSize));
            aquaductBox.setAttribute('height', String(aquaductSize));
            aquaductBox.setAttribute('rx', '4');
            aquaductBox.setAttribute('ry', '4');
            aquaductBox.setAttribute('class', 'aquaduct-box');
            group.appendChild(aquaductBox);
            
            // Add aquaduct icon on top of the box
            const aquaductImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            aquaductImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'icons/aquaduct.png');
            aquaductImg.setAttribute('x', String(x + 37 - size / 2));
            aquaductImg.setAttribute('y', String(y + 37 - size / 2));
            aquaductImg.setAttribute('width', String(aquaductSize));
            aquaductImg.setAttribute('height', String(aquaductSize));
            group.appendChild(aquaductImg);
        }

        // Position text based on alignment
        // For deep trees (depth >= 3), place text below leaf nodes (only startOfChain raw materials) to avoid overlap
        // 'left' = text to the left of icon (anchor: end)
        // 'right' = text to the right of icon (anchor: start)
        // 'below' = text below icon (anchor: middle)
        
        let textX, anchor, labelY, buildingY;
        
        // If this is a leaf node in a deep tree and IS startOfChain (raw material), place text below
        if (maxDepth >= 3 && isLeaf && startOfChain) {
            textX = x;
            anchor = 'middle';
            labelY = y + 50;
            buildingY = y + 67;
        } else if (textAlign === 'right') {
            // Estimate text width (approximate: 7 pixels per character)
            const estimatedTextWidth = Math.max(label.length * 7, buildings.toFixed(2).length * 7);
            const textOffset = 40 + Math.max(0, estimatedTextWidth - 70); // Add extra offset for long text
            textX = x + textOffset;
            anchor = 'start';
            labelY = y - 5;
            buildingY = y + 12;
        } else {
            // For left-aligned text, use fixed offset (root node and left-side nodes)
            const textOffset = depth === 0 ? 40 : (40 + Math.max(0, Math.max(label.length * 7, buildings.toFixed(2).length * 7) - 70));
            textX = x - textOffset;
            anchor = 'end';
            labelY = y - 5;
            buildingY = y + 12;
        }

        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelText.setAttribute('x', String(textX));
        labelText.setAttribute('y', String(labelY));
        labelText.setAttribute('text-anchor', anchor);
        labelText.setAttribute('class', 'graph-text');
        labelText.setAttribute('data-role', 'label');
        labelText.setAttribute('data-good-id', good.id || '');
        labelText.textContent = label;
        group.appendChild(labelText);

        const buildingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        buildingText.setAttribute('x', String(textX));
        buildingText.setAttribute('y', String(buildingY));
        buildingText.setAttribute('text-anchor', anchor);
        buildingText.setAttribute('class', 'graph-subtext');
        buildingText.setAttribute('data-role', 'buildings');
        buildingText.setAttribute('data-good-id', good.id || '');
        buildingText.textContent = `${buildings.toFixed(2)}x`;
        group.appendChild(buildingText);

        svg.appendChild(group);
    }

    // Resolve goods info from GOODS_LIST by id
    function findGood(id) {
        return GOODS_LIST.find(g => g.id === id) || { id };
    }

    const headGood = productionData.id
        ? findGood(productionData.id)
        : { id: productionData.id || 'output' };

    const isInitialRender = svg.childNodes.length === 0;

    /**
     * Calculate the max depth of a production tree
     */
    function calculateMaxDepth(prodData, currentDepth = 0) {
        if (!prodData) return currentDepth;
        
        const inputs = prodData.input || [];
        if (inputs.length === 0) return currentDepth;
        
        let maxChildDepth = currentDepth;
        inputs.forEach(input => {
            if (input.recipe) {
                maxChildDepth = Math.max(maxChildDepth, calculateMaxDepth(input.recipe, currentDepth + 1));
            } else {
                maxChildDepth = Math.max(maxChildDepth, currentDepth + 1);
            }
        });
        
        return maxChildDepth;
    }

    /**
     * Calculate the width needed for a production tree
     */
    function calculateTreeWidth(prodData) {
        if (!prodData) return 1;
        
        const inputs = prodData.input || [];
        if (inputs.length === 0) return 1; // Leaf node takes 1 unit
        
        // Width is the sum of all children's widths
        let totalWidth = 0;
        inputs.forEach(input => {
            if (input.recipe) {
                totalWidth += calculateTreeWidth(input.recipe);
            } else {
                totalWidth += 1; // Leaf node
            }
        });
        
        return Math.max(1, totalWidth);
    }

    /**
     * Recursively render the production graph
     */
    function renderRecursiveGraph(svg, prodData, x, y, depth, allBuildings, availableWidth, parentX = null, parentY = null, maxDepth = 0) {
        if (!prodData || depth > 5) return; // Limit depth to prevent overflow

        const good = findGood(prodData.id);
        const hasFuel = prodData.fuel && prodData.fuel.length > 0;
        const buildingType = prodData.type || '';
        const buildings = allBuildings[prodData.id] || 0;

        // Determine text alignment based on position
        // For root (depth 0), always left
        // For branches, align based on which side of center (200) they're on
        const centerX = 200;
        let textAlign = 'left'; // default: text to the left of icon
        
        if (depth > 0) {
            // For non-root nodes, align text to outer edges
            textAlign = x < centerX ? 'left' : 'right';
        }

        // Check if this is a leaf node (no inputs or only start_of_chain inputs)
        const inputs = prodData.input || [];
        const isLeaf = inputs.length === 0 || inputs.every(inp => inp.start_of_chain);

        // Add node for this production step
        addNode(x, y, good, buildings, textAlign, hasFuel, buildingType, depth, maxDepth, isLeaf, false);

        // Draw line from parent if exists
        if (parentX !== null && parentY !== null) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(parentX));
            line.setAttribute('y1', String(parentY + 32));
            line.setAttribute('x2', String(x));
            line.setAttribute('y2', String(y - 32));
            line.setAttribute('class', depth === 0 ? 'graph-link' : 'graph-link-secondary');
            svg.insertBefore(line, svg.firstChild);
        }

        // Process inputs
        if (inputs.length === 0) return;

        const nextY = y + 120;
        
        // Calculate widths for each input and determine if any have right-aligned text
        const inputWidths = inputs.map(input => {
            if (input.recipe) {
                return calculateTreeWidth(input.recipe);
            } else {
                return 1; // Leaf node
            }
        });
        
        const totalWidth = inputWidths.reduce((sum, w) => sum + w, 0);
        
        // Calculate tentative positions to check text alignment
        let hasRightAlignedText = false;
        let tempOffset = x - (totalWidth * 90) / 2;
        inputWidths.forEach(width => {
            const tentativeX = tempOffset + (width * 90) / 2;
            if (tentativeX >= centerX) {
                hasRightAlignedText = true;
            }
            tempOffset += width * 90;
        });
        
        // Increase spacing if we have right-aligned text to prevent overlaps
        const nodeSpacing = hasRightAlignedText ? 140 : 90;
        
        // Calculate positions based on proportional widths
        let positions = [];
        let currentOffset = x - (totalWidth * nodeSpacing) / 2;
        
        inputWidths.forEach(width => {
            // Position at the center of this subtree's allocation
            positions.push(currentOffset + (width * nodeSpacing) / 2);
            currentOffset += width * nodeSpacing;
        });

        inputs.forEach((input, index) => {
            if (!input.id) return;

            const inputX = positions[index];
            const inputWidth = inputWidths[index] * nodeSpacing;
            
            if (input.recipe) {
                // Recursive production chain - render it
                renderRecursiveGraph(svg, input.recipe, inputX, nextY, depth + 1, allBuildings, inputWidth, x, y, maxDepth);
            } else if (input.start_of_chain) {
                // Direct input - render as leaf node
                const inputGood = findGood(input.id);
                const inputBuildings = allBuildings[input.id] || 0;
                const inputBuildingType = input.type || '';
                
                // Align text to outer edges for leaf nodes, or below for deep trees
                const inputTextAlign = inputX < centerX ? 'left' : 'right';
                const isLeafNode = true;
                
                addNode(inputX, nextY, inputGood, inputBuildings, inputTextAlign, false, inputBuildingType, depth + 1, maxDepth, isLeafNode, input.start_of_chain);
                
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', String(x));
                line.setAttribute('y1', String(y + 32));
                line.setAttribute('x2', String(inputX));
                line.setAttribute('y2', String(nextY - 32));
                line.setAttribute('class', 'graph-link');
                svg.insertBefore(line, svg.firstChild);
            }
        });
    }

    if (isInitialRender) {
        // Calculate total width needed for the tree
        const treeWidth = calculateTreeWidth(productionData);
        const nodeSpacing = 90;
        const totalWidth = treeWidth * nodeSpacing;
        
        // Calculate max depth for text positioning logic
        const maxDepth = calculateMaxDepth(productionData);
        
        // Render the full recursive graph
        renderRecursiveGraph(svg, productionData, centerX, centerY, 0, allBuildings, totalWidth, null, null, maxDepth);
        
        // Add drag functionality to SVG
        setupSVGDrag(svg);
    }

    // --- Update building counts based on ratios ---

    // Update all nodes with their calculated building counts from allBuildings
    for (const [goodId, buildings] of Object.entries(allBuildings)) {
        if (goodId === '_metadata') continue;
        
        const node = svg.querySelector(
            `text.graph-subtext[data-role="buildings"][data-good-id="${goodId}"]`
        );
        if (node) {
            node.textContent = `${buildings.toFixed(2)}x`;
        }

        // Also update the card count in the production info section
        const cardCount = document.querySelector(
            `[data-building-count="${goodId}"]`
        );
        if (cardCount) {
            cardCount.textContent = `${buildings.toFixed(2)}x`;
        }
    }

    // Calculate total building costs and maintenance
    calculateTotalCosts(allBuildings);
}

/**
 * Setup drag functionality for SVG graph with right-click
 */
function setupSVGDrag(svg) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let viewBox = { x: 0, y: 0, width: 400, height: 400 };
    
    // Parse initial viewBox
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    viewBox = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
    
    svg.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Prevent context menu
    });
    
    svg.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // Right mouse button
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            svg.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    
    svg.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = (e.clientX - startX) * (viewBox.width / svg.clientWidth);
        const dy = (e.clientY - startY) * (viewBox.height / svg.clientHeight);
        
        viewBox.x -= dx;
        viewBox.y -= dy;
        
        svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        
        startX = e.clientX;
        startY = e.clientY;
    });
    
    svg.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            isDragging = false;
            svg.style.cursor = 'default';
        }
    });
    
    svg.addEventListener('mouseleave', () => {
        isDragging = false;
        svg.style.cursor = 'default';
    });
    
    // Add mouse wheel zoom functionality
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Get mouse position relative to SVG
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Convert mouse position to viewBox coordinates
        const svgX = viewBox.x + (mouseX / svg.clientWidth) * viewBox.width;
        const svgY = viewBox.y + (mouseY / svg.clientHeight) * viewBox.height;
        
        // Zoom factor (positive = zoom out, negative = zoom in)
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        
        // Calculate new viewBox dimensions
        const newWidth = viewBox.width * zoomFactor;
        const newHeight = viewBox.height * zoomFactor;
        
        // Adjust position to keep mouse point fixed
        viewBox.x = svgX - (mouseX / svg.clientWidth) * newWidth;
        viewBox.y = svgY - (mouseY / svg.clientHeight) * newHeight;
        viewBox.width = newWidth;
        viewBox.height = newHeight;
        
        // Apply new viewBox
        svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    });
}

/**
 * Calculate and display total building costs and maintenance
 */
function calculateTotalCosts(allBuildings) {
    const buildingCostElement = document.getElementById('total-building-cost');
    const maintenanceElement = document.getElementById('total-maintenance');

    if (!buildingCostElement || !maintenanceElement) return;

    // Initialize totals
    const totalBuildingCost = {};
    const totalMaintenance = {};

    // Sum costs for all buildings in the chain
    for (const [goodId, buildingCount] of Object.entries(allBuildings)) {
        if (goodId === '_metadata') continue;

        const metadata = allBuildings._metadata[goodId];
        if (!metadata) continue;

        const ceiledCount = Math.ceil(buildingCount);

        // Add building costs
        if (metadata.building_cost) {
            for (const [resource, amount] of Object.entries(metadata.building_cost)) {
                totalBuildingCost[resource] = (totalBuildingCost[resource] || 0) + (amount * ceiledCount);
            }
        }

        // Add maintenance costs
        if (metadata.maintanance_cost) {
            for (const [resource, amount] of Object.entries(metadata.maintanance_cost)) {
                totalMaintenance[resource] = (totalMaintenance[resource] || 0) + (amount * ceiledCount);
            }
        }
    }

    // Format and display with icons
    const formatCosts = (costs) => {
        // Filter out zero values
        const nonZeroCosts = Object.entries(costs).filter(([resource, amount]) => amount > 0);
        
        if (nonZeroCosts.length === 0) return '<span class="cost-none">None</span>';
        
        return nonZeroCosts
            .map(([resource, amount]) => `
                <span class="cost-resource">
                    <img src="icons/${resource}.png" alt="${resource}" class="cost-icon" onerror="this.style.display='none';" />
                    <span class="cost-amount">${amount}</span>
                </span>
            `)
            .join('');
    };

    buildingCostElement.innerHTML = formatCosts(totalBuildingCost);
    maintenanceElement.innerHTML = formatCosts(totalMaintenance);
}

/**
 * Show the selection list view and hide the calculator view
 */
function showSelectionView() {
    currentGood = null;
    const calculatorContainer = document.getElementById('calculator-container');
    const selectionContainer = document.getElementById('selection-container');

    // Remove chain parameter from URL
    const url = new URL(window.location);
    url.searchParams.delete('chain');
    window.history.pushState({}, '', url);

    calculatorContainer.classList.add('hidden');
    selectionContainer.classList.remove('hidden');
}

/**
 * Initialize settings panel and load saved settings
 */
function initSettings() {
    // Load settings from localStorage
    loadSettings();
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.id = 'settings-overlay';
    document.body.appendChild(overlay);
    
    // Initialize info modal
    initInfoModal();
    
    // Settings toggle button
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    
    settingsToggle.addEventListener('click', () => {
        settingsPanel.classList.remove('hidden');
        overlay.classList.add('active');
    });
    
    settingsClose.addEventListener('click', closeSettings);
    overlay.addEventListener('click', closeSettings);
    
    // Bind all setting inputs
    document.getElementById('settings-use-aqueducts').addEventListener('change', (e) => {
        config.aqueductsEnabled = e.target.checked;
        saveSettings();
    });
    
    document.getElementById('settings-aqua-arborica').addEventListener('change', (e) => {
        config.aquaArborica = e.target.checked;
        saveSettings();
    });
    
    document.getElementById('settings-field-irrigation').addEventListener('change', (e) => {
        config.fieldIrrigation = e.target.checked;
        saveSettings();
    });
}

/**
 * Close settings panel
 */
function closeSettings() {
    document.getElementById('settings-panel').classList.add('hidden');
    document.getElementById('settings-overlay').classList.remove('active');
}

/**
 * Save settings to localStorage and refresh calculations
 */
function saveSettings() {
    localStorage.setItem('anno117_calculator_settings', JSON.stringify(config));
    console.log('[Settings] Saved settings:', config);
    
    // Reload the current production chain to update boost indicators and times
    if (currentGood) {
        loadGoodIntoCalculator(currentGood);
    }
}

/**
 * Load settings from localStorage
 */
function loadSettings() {
    const saved = localStorage.getItem('anno117_calculator_settings');
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            Object.assign(config, loaded);
            console.log('[Settings] Loaded settings:', config);
        } catch (e) {
            console.error('[Settings] Failed to load settings:', e);
        }
    }
    
    // Update UI to reflect loaded settings
    if (document.getElementById('settings-use-aqueducts')) {
        document.getElementById('settings-use-aqueducts').checked = config.aqueductsEnabled ?? false;
        document.getElementById('settings-aqua-arborica').checked = config.aquaArborica ?? false;
        document.getElementById('settings-field-irrigation').checked = config.fieldIrrigation ?? false;
    }
}

/**
 * Initialize info modal
 */
function initInfoModal() {
    const infoToggle = document.getElementById('info-toggle');
    const infoModal = document.getElementById('info-modal');
    const infoClose = document.getElementById('info-close');
    const overlay = document.getElementById('settings-overlay');
    
    infoToggle.addEventListener('click', () => {
        infoModal.classList.remove('hidden');
        overlay.classList.add('active');
    });
    
    infoClose.addEventListener('click', closeInfoModal);
    
    // Close modal when clicking overlay (only if settings panel is not open)
    overlay.addEventListener('click', () => {
        const settingsPanel = document.getElementById('settings-panel');
        if (!settingsPanel.classList.contains('hidden')) return;
        closeInfoModal();
    });
}

/**
 * Close info modal
 */
function closeInfoModal() {
    const infoModal = document.getElementById('info-modal');
    const overlay = document.getElementById('settings-overlay');
    infoModal.classList.add('hidden');
    overlay.classList.remove('active');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}