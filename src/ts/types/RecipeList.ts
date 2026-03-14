export interface RecipeListItem {
  displayName: string;
  id: string;
  icon: string;
  regions: string[];
  files: Record<string, string>; // filename -> regions
}

export interface ProductionNode {
  id?: string;
  name?: string;
  type?: string;
  icon?: string;
  input?: ProductionNode[];
  fuel?: ProductionNode[];
  start_of_chain?: boolean;
  region?: string[];
}