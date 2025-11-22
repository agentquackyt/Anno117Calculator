#!/usr/bin/env bun

/**
 * Generate list.json with all goods from Anno 117 production chains
 * This script scans production JSON files and extracts unique goods with their display names, IDs, and icons
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";

interface Good {
  displayName: string;
  id: string;
  icon: string;
  startOfChain: boolean;
  regions: string[];
  files: Record<string, string[]>; // filename -> regions
}

interface ProductionNode {
  id?: string;
  name?: string;
  type?: string;
  icon?: string;
  input?: ProductionNode[];
  fuel?: ProductionNode[];
  start_of_chain?: boolean;
  region?: string[];
}

/**
 * Convert ID to display name (e.g., "wood_cutter" -> "Wood Cutter")
 */
function toDisplayName(id: string): string {
  return id
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extract goods from a production file recursively
 */
function extractGoods(node: ProductionNode, filename: string, goodsMap: Map<string, Good>) {
  if (!node.id) return;

  const id = node.id;
  const regions = node.region || [];
  const isStartOfChain = node.start_of_chain === true;
  const displayName = node.name || toDisplayName(id);
  
  // Get or create good entry
  let good = goodsMap.get(id);
  if (!good) {
    good = {
      displayName,
      id,
      icon: node.icon || id,
      startOfChain: isStartOfChain,
      regions: [],
      files: {}
    };
    goodsMap.set(id, good);
  }

  // Update startOfChain if this occurrence says so (or if it was already true)
  if (isStartOfChain) {
    good.startOfChain = true;
  }
  
  // If this is the root node of the file (or we treat every node as potentially available in that file/region?)
  // Actually, only the root node of the file represents the "recipe" defined by that file.
  // Nested nodes are just ingredients.
  // So we should only update 'regions' and 'files' for the ROOT node of the file.
  // But wait, extractGoods is recursive. How do we know if we are at root?
  // We can pass a flag.
}

function processFile(node: ProductionNode, filename: string, goodsMap: Map<string, Good>) {
    if (!node.id) return;

    // Process the root item (the product of this file)
    const id = node.id;
    const regions = node.region || [];
    const displayName = node.name || toDisplayName(id);

    let good = goodsMap.get(id);
    if (!good) {
        good = {
            displayName,
            id,
            icon: node.icon || id,
            startOfChain: false, // Will be updated if found as input with start_of_chain=true
            regions: [],
            files: {}
        };
        goodsMap.set(id, good);
    }

    // Update regions and files for this good (since this file defines a recipe for it)
    // Merge regions
    for (const region of regions) {
        if (!good.regions.includes(region)) {
            good.regions.push(region);
        }
    }
    // Add file mapping
    const simpleFilename = filename.replace('.json', '');
    good.files[simpleFilename] = regions;

    // Now recursively extract ingredients to ensure they exist in the goods list
    // But for ingredients, we don't add the current file as a "source" for them, 
    // unless they are also defined as a recipe in another file.
    // We just want to make sure they appear in the list.
    extractIngredients(node, goodsMap);
}

function extractIngredients(node: ProductionNode, goodsMap: Map<string, Good>) {
    if (node.input) {
        for (const input of node.input) {
            if (input.id) {
                let inputGood = goodsMap.get(input.id);
                if (!inputGood) {
                    inputGood = {
                        displayName: input.name || toDisplayName(input.id),
                        id: input.id,
                        icon: input.icon || input.id,
                        startOfChain: input.start_of_chain === true,
                        regions: [], // We don't know regions for ingredients unless we find their own files
                        files: {}
                    };
                    goodsMap.set(input.id, inputGood);
                } else if (input.start_of_chain) {
                    inputGood.startOfChain = true;
                }
                extractIngredients(input, goodsMap);
            }
        }
    }
    if (node.fuel) {
        for (const fuel of node.fuel) {
             if (fuel.id) {
                let fuelGood = goodsMap.get(fuel.id);
                if (!fuelGood) {
                    fuelGood = {
                        displayName: fuel.name || toDisplayName(fuel.id),
                        id: fuel.id,
                        icon: fuel.icon || fuel.id,
                        startOfChain: fuel.start_of_chain === true,
                        regions: [],
                        files: {}
                    };
                    goodsMap.set(fuel.id, fuelGood);
                } else if (fuel.start_of_chain) {
                    fuelGood.startOfChain = true;
                }
                // Fuel usually doesn't have inputs in the fuel definition, but if it did...
                extractIngredients(fuel, goodsMap);
            }
        }
    }
}


/**
 * Main function to generate the goods list
 */
async function generateGoodsList() {
  try {
    const productionsDir = resolve(__dirname, "../productions");
    const outputPath = join(productionsDir, "list.json");

    console.log(`📁 Scanning directory: ${productionsDir}`);

    // Read all JSON files from productions directory
    const files = await readdir(productionsDir);
    const jsonFiles = files.filter(
      (file) => file.endsWith(".json") && file !== "list.json"
    );

    console.log(`📄 Found ${jsonFiles.length} production files`);

    // Collect all goods
    const allGoods = new Map<string, Good>();

    for (const file of jsonFiles) {
      const filePath = join(productionsDir, file);
      console.log(`   Processing: ${file}`);

      try {
        const content = await readFile(filePath, "utf-8");
        const production: ProductionNode = JSON.parse(content);
        processFile(production, file, allGoods);
      } catch (error) {
        console.warn(`   ⚠️  Warning: Could not process ${file}:`, error);
      }
    }

    // Convert to array and sort by display name
    const goodsList = Array.from(allGoods.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    // Write to list.json
    const output = {
      README: "This file contains all goods from Anno 1117 production chains",
      generated: new Date().toISOString(),
      count: goodsList.length,
      goods: goodsList,
    };

    await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");

    console.log(
      `\n✅ Successfully generated list.json with ${goodsList.length} goods`
    );
    console.log(`📝 Output: ${outputPath}`);
    console.log("\nGoods found:");
    goodsList.forEach((good) => {
      console.log(`   - ${good.displayName} (${good.id})`);
    });
  } catch (error) {
    console.error("❌ Error generating goods list:", error);
    process.exit(1);
  }
}

// Run the script
generateGoodsList();
