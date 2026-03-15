#!/usr/bin/env bun

import { readdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";

interface GoodListEntry {
	displayName: string;
	id: string;
	icon: string;
	regions: string[];
	files: Record<string, string>;
}

interface GoodListFile {
	goods: GoodListEntry[];
}

interface ProductionNode {
	id?: string;
	name?: string;
	input?: ProductionNode[];
}

interface ItemProducedGood {
	name?: string;
}

interface ItemTarget {
	producedGoods?: ItemProducedGood[];
}

interface ItemFile {
	guid?: string;
	displayName?: string;
	iconFilename?: string;
	targets?: ItemTarget[];
}

interface ParsedItem {
	guid: string;
	displayName: string;
	iconFilename: string;
	normalizedProducedGoods: Set<string>;
}

interface MinimalItem {
	guid: string;
	displayName: string;
	iconFilename: string;
}

interface ChainCompatibility {
	id: string;
	displayName: string;
	icon: string;
	regions: string[];
	files: Record<string, string>;
	items: MinimalItem[];
}

function formatConsoleLog(text: string, error = false): void {
	console.log((error ? Bun.color("#dc7979", "ansi-16m") + "[Item Compatibility / ERROR] " : Bun.color("#fee5ca", "ansi-16m") + "[Item Compatibility] ") + Bun.color("#c7ad90", "ansi") + text);
}

function normalizeName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ");
}

function idToDisplayName(id: string): string {
	return id
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function collectChainNodeNames(node: ProductionNode, names: Set<string>): void {
	const nodeName = node.name || (node.id ? idToDisplayName(node.id) : "");
	if (nodeName) {
		names.add(normalizeName(nodeName));
	}

	for (const inputNode of node.input || []) {
		collectChainNodeNames(inputNode, names);
	}
}

function getItemProducedGoods(item: ItemFile): Set<string> {
	const producedGoods = new Set<string>();

	for (const target of item.targets || []) {
		for (const good of target.producedGoods || []) {
			if (!good.name) continue;
			producedGoods.add(normalizeName(good.name));
		}
	}

	return producedGoods;
}

function parseItem(item: ItemFile): ParsedItem | null {
	if (!item.guid || !item.displayName) {
		return null;
	}

	return {
		guid: item.guid,
		displayName: item.displayName,
		iconFilename: item.iconFilename || "",
		normalizedProducedGoods: getItemProducedGoods(item),
	};
}

function isCompatible(item: ParsedItem, chainNames: Set<string>): boolean {
	for (const producedGood of item.normalizedProducedGoods) {
		if (chainNames.has(producedGood)) {
			return true;
		}
	}

	return false;
}

async function loadItems(itemsDir: string): Promise<ParsedItem[]> {
	const files = await readdir(itemsDir);
	const itemFiles = files.filter((file) => file.endsWith(".json"));
	const items: ParsedItem[] = [];

	for (const file of itemFiles) {
		const filePath = join(itemsDir, file);
		try {
			const content = await readFile(filePath, "utf-8");
			const json = JSON.parse(content) as ItemFile;
			const parsed = parseItem(json);
			if (parsed) {
				items.push(parsed);
			}
		} catch {
			formatConsoleLog(`Could not process item file ${file}`, true);
		}
	}

	return items;
}

async function collectChainNames(productionsDir: string, filesByRegion: Record<string, string>, fallbackDisplayName: string): Promise<Set<string>> {
	const names = new Set<string>();
	const uniqueFiles = new Set(Object.values(filesByRegion));

	for (const fileKey of uniqueFiles) {
		const filePath = join(productionsDir, `${fileKey}.json`);

		try {
			const content = await readFile(filePath, "utf-8");
			const production = JSON.parse(content) as ProductionNode;
			collectChainNodeNames(production, names);
		} catch {
			formatConsoleLog(`Could not process production file ${fileKey}.json`, true);
		}
	}

	names.add(normalizeName(fallbackDisplayName));
	return names;
}

export default async function generateItemsList({ showList = true, devmode = true }) {
	try {
		const productionsDir = resolve(__dirname, "../src/assets/productions");
		const itemsDir = resolve(__dirname, "../src/assets/data/items");
		const productionListPath = join(productionsDir, "list.json");
		const outputPath = join(productionsDir, "item-compatibility.json");

		formatConsoleLog(`Loading production list: ${productionListPath}`);

		const listContent = await readFile(productionListPath, "utf-8");
		const goodList = JSON.parse(listContent) as GoodListFile;
		const chains = goodList.goods || [];

		formatConsoleLog(`Found ${chains.length} production chains`);

		const items = await loadItems(itemsDir);
		formatConsoleLog(`Loaded ${items.length} items`);

		const compatibility: ChainCompatibility[] = [];

		for (const chain of chains) {
			const chainNames = await collectChainNames(productionsDir, chain.files || {}, chain.displayName);
			const matchedItemsMap = new Map<string, MinimalItem>();

			for (const item of items) {
				if (!isCompatible(item, chainNames)) continue;

				matchedItemsMap.set(item.guid, {
					guid: item.guid,
					displayName: item.displayName,
					iconFilename: item.iconFilename,
				});
			}

			const matchedItems = Array.from(matchedItemsMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));

			compatibility.push({
				id: chain.id,
				displayName: chain.displayName,
				icon: chain.icon,
				regions: chain.regions || [],
				files: chain.files || {},
				items: matchedItems,
			});
		}

		compatibility.sort((a, b) => a.displayName.localeCompare(b.displayName));

		const output = {
			README: "This file maps each production chain to compatible items from Anno 117: Pax Romana.",
			generated: new Date().toISOString(),
			count: compatibility.length,
			chains: compatibility,
		};

		if (devmode) {
			await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
		} else {
			await writeFile(outputPath, JSON.stringify(output), "utf-8");
		}

		formatConsoleLog(`Successfully generated item-compatibility.json for ${compatibility.length} chains`);
		formatConsoleLog(`Output: ${outputPath}`);

		if (!showList) return;

		for (const chain of compatibility) {
			console.log(`   - ${chain.displayName}: ${chain.items.length} items`);
		}
	} catch {
		formatConsoleLog("Error generating item compatibility list", true);
		process.exit(1);
	}
}
