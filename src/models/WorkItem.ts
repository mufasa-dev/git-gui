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
    avatarUrl?: string;
  };
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