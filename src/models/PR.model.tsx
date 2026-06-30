export interface UnifiedPR {
  id: string;          // node_id ou id interno da API
  number: number;      // Número do PR
  title: string;       // Título
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;   // Data ISO
  author: {
    login: string;
    avatarUrl: string;
    name?: string;
  };
  headRefName: string; // Branch de origem
  baseRefName: string; // Branch de destino
  comments?: { totalCount: number };
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
}

export interface PRValidationResult {
  hasChanges: boolean;
  alreadyExists: boolean;
  existingPrId?: string | number;
  commits: Array<{ id: string; message: string; author: string }>;
  files: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>;
}

export interface ReviewerItem {
  id: string;
  login: string;
  avatarUrl?: string;
  isRequired: boolean;
}