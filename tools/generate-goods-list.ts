#!/usr/bin/env bun

/**
 * Generate list.json with all goods from Anno 117 production chains
 * This script scans production JSON files and extracts unique goods with their display names, IDs, and icons
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";

interface Good {
  displayName: string;
  type: string;
  id: string;
  icon: string;
  startOfChain: boolean;
}

interface ProductionFile {
  type?: string;
  id?: string;
  icon?: string;
  input?: Array<{
    type?: string;
    id?: string;
    start_of_chain?: boolean;
  }>;
  fuel?: Array<{
    type?: string;
    id?: string;
    start_of_chain?: boolean;
  }>;
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
 * Extract goods from a production file
 */
function extractGoods(production: ProductionFile): Good[] {
  const goods: Good[] = [];
  const seen = new Set<string>();

  // Add the main product (head)
  if (production.id) {
    const id = production.id;
    if (!seen.has(id)) {
      goods.push({
        displayName: toDisplayName(id),
        id: id,
        icon: production.icon || id,
        startOfChain: false, // Head products are not start of chain
        type: production.type || "generic",
      });
      seen.add(id);
    }
  }

  // Add input goods
  if (production.input) {
    for (const input of production.input) {
      if (input.id && !seen.has(input.id)) {
        goods.push({
          displayName: toDisplayName(input.id),
          id: input.id,
          icon: input.id, // Assuming icon name matches ID
          startOfChain: input.start_of_chain === true,
          type: input.type || "generic",
        });
        seen.add(input.id);
      }
    }
  }

  // Add fuel goods
  if (production.fuel) {
    for (const fuel of production.fuel) {
      if (fuel.id && !seen.has(fuel.id)) {
        goods.push({
          displayName: toDisplayName(fuel.id),
          id: fuel.id,
          icon: fuel.id, // Assuming icon name matches ID
          startOfChain: fuel.start_of_chain === true,
          type: fuel.type || "generic",
        });
        seen.add(fuel.id);
      }
    }
  }

  return goods;
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
        const production: ProductionFile = JSON.parse(content);
        const goods = extractGoods(production);

        // Add to map or update startOfChain if already exists
        for (const good of goods) {
          const existing = allGoods.get(good.id);
          if (!existing) {
            allGoods.set(good.id, good);
          } else if (good.startOfChain) {
            // If this occurrence is marked as start of chain, update it
            existing.startOfChain = true;
          }
        }
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
