import { createContext, useContext } from "solid-js";
import type { Repo } from "../models/Repo.model";

type RepoContextType = {
  repos: () => Repo[];
  active: () => string | null;
  refreshBranches: (repoPath: string) => Promise<void>;
};

const RepoContext = createContext<RepoContextType>();

export function useRepoContext() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext deve ser usado dentro de RepoProvider");
  return ctx;
}

export default RepoContext;
