import { readdir } from "fs/promises";
import { join, resolve } from "path";

const productionsDir = resolve(__dirname, "./src/assets/productions");
const outputPath = join(productionsDir, "list.json");

let list: Record<string, number> = {};
let array: Array<Record<string, number>> = [];

console.log(`Scanning directory: ${productionsDir}`);

// Read all JSON files from productions directory
const files = await readdir(productionsDir);
const jsonFiles = files.filter(
    (file) => file.endsWith(".json") && file !== "list.json"
);

for (const file of jsonFiles) {
    const filePath = join(productionsDir, file);
    const content = await Bun.file(filePath).text();
    const node = JSON.parse(content);

    array.push(node.maintanance_cost as Record<string, number>);
}

// filter out duplicates and merge into a single list with the individual keys
array.forEach((item) => {
    for (const key in item) {
        if (!(key in list)) {
            list[key] = item[key];
        }
    }
});

console.log(list);