# Anno 117 Calculator Tools

This folder contains utility scripts for the Anno 117 Calculator.

## Scripts

### generate-goods-list.ts

Generates `list.json` with all goods from the production chain files.

**Usage:**

```bash
# Run directly with Bun
bun run generate-goods-list.ts

# Or use the npm script
bun run generate-goods
```

**What it does:**
- Scans all JSON files in the `productions/` directory
- Extracts goods from production chains (head products, inputs, and fuels)
- Creates a comprehensive list with:
  - Display name (human-readable name)
  - ID (unique identifier)
  - Icon (icon reference)
- Outputs to `productions/list.json`

## Requirements

- [Bun](https://bun.sh/) runtime installed

## Installation

```bash
bun install
```
