import { createContext, useContext, Resource } from "solid-js";
import type { Repo } from "../models/Repo.model";

// 1. Criamos um tipo para mapear quais provedores estão conectados
export type ConnectedProviders = {
  github?: {
    login: string;
    avatar_url: string;
  };
  azure?: {
    login: string;
    name: string;
    avatar_url: string;
  };
  gitlab?: {
    login: string;
    avatar_url: string;
  };
  // Mantém a propriedade principal para indicar qual card/perfil está ativo ou em foco no topo do app
  provider?: 'github' | 'azure' | 'gitlab'; 
  avatar_url?: string;
  login?: string;
};

type RepoContextType = {
  repos: () => Repo[];
  active: () => string | null;
  refreshBranches: (repoPath: string) => Promise<void>;
  // 2. O seu recurso agora envelopa a estrutura de múltiplos provedores
  user: Resource<ConnectedProviders | null>; 
  mutateUser: (data: any | ((prev: ConnectedProviders | null) => ConnectedProviders | null)) => void;
  refetchUser: () => void;
};

const RepoContext = createContext<RepoContextType>();

export function useRepoContext() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext deve ser usado dentro de RepoProvider");
  return ctx;
}

export default RepoContext;