import { GitProvider } from "../utils/gitProvider";

export interface WorkItem {
  id: string;
  number: string | number;
  title: string;
  description: string;
  state: "open" | "closed" | "todo" | "doing" | "done" | string;
  stateColor?: string;     // Para badge de status customizado
  provider: GitProvider;
  author: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  subIssues: {
    total: number;
    completed: number;
    percent: number;
  };
  tags: string[];
  comments: CardComment[];
  priority?: number;
  effort?: number;
  areaPath?: string;
  iterationPath?: string;
  tasksReferences?: string[]; // Para sub-tarefas ou itens relacionados
  relatedReferences?: { id: string; type: "Parent" | "Child" | string }[];
  commitsReferences?: string[]; // Hashes ou mensagens de commit relacionados
  createdAt: string;
  updatedAt?: string;
  htmlUrl?: string;        // Link direto para a web se precisar
  // Campos extras comuns que você pode expandir depois
  assignee?: {
    name: string;
    avatarUrl?: string;
  };
  commentsCount: number;
}

export interface CardComment {
  id: string | number;
  author: {
    name: string;
    avatarUrl?: string;
  };
  text: string; // Conteúdo em Markdown ou HTML
  createdAt: string;
}