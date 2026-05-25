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