export interface ContextBundle {
  query: string;
  tokenBudget: number;
  tokenCount: number;
  selectedConceptIds: string[];
  selectedClaimIds: string[];
  excludedCandidates: Array<{
    id: string;
    reason: string;
  }>;
}

