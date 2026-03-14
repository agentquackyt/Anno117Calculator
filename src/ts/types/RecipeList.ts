interface RecipeListItem {
  displayName: string;
  id: string;
  icon: string;
  regions: string[];
  files: Record<string, string>; // region key -> filename
  startOfChain?: boolean;
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

export type { RecipeListItem, ProductionNode };