import { createSignal, onCleanup, onMount } from "solid-js";
import { validateRepo, getRemoteBranches, getBranchStatus, getCurrentBranch, getLocalChanges } from "../services/gitService";
import TabBar from "../components/ui/TabBar";
import RepoView from "../components/repo/RepoView";
import { Repo } from "../models/Repo.model";
import RepoContext from "../context/RepoContext";

import { path } from "@tauri-apps/api";
import { loadRepos, saveRepos } from "../services/storeService";
import { platform } from "@tauri-apps/plugin-os";
import Header from "../components/layout/Header";

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);

  const closeRepo = (id: string) => {
    setRepos(prev => {
      const nextRepos = prev.filter(r => r.path !== id);
      saveRepos(nextRepos);
      if (active() === id) {
        setActive(nextRepos.length > 0 ? nextRepos[0].path : null);
      }
      return nextRepos;
    });
  };

  onMount(async () => {
    const savedPaths = await loadRepos();

    for (const repoPath of savedPaths) {
      if (repos().some(r => r.path === repoPath)) continue;
      try {
        await validateRepo(repoPath);
        const branches = await getBranchStatus(repoPath);
        const remoteBranches = await getRemoteBranches(repoPath);
        const name = await path.basename(repoPath);
        const activeBranch = await getCurrentBranch(repoPath);
        const localChanges = await getLocalChanges(repoPath);

        const repo: Repo = { path: repoPath, name, branches, remoteBranches, activeBranch, localChanges };
        setRepos(prev => [...prev, repo]);
      } catch (err) {
        console.warn(`Não foi possível reabrir repo ${repoPath}`, err);
      }
    }
    if (repos().length > 0) {
      setActive(repos()[0].path);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (active()) {
          closeRepo(active()!);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && active()) {
      refreshBranches(active()!);
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  const handleFocus = () => {
    if (active()) refreshBranches(active()!);
  };
  window.addEventListener("focus", handleFocus);

  onCleanup(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleFocus);
  });

  async function refreshBranches(repoPath: string) {
    const branches = await getBranchStatus(repoPath);
    const remoteBranches = await getRemoteBranches(repoPath);
    const activeBranch = await getCurrentBranch(repoPath!);
    const localChanges = await getLocalChanges(repoPath);

    setRepos(prev =>
      prev.map(r =>
        r.path === repoPath ? { ...r, branches, remoteBranches, activeBranch, localChanges } : r
      )
    );
  }

  return (
     <RepoContext.Provider value={{ repos, active, refreshBranches }}>
      <div class="flex flex-col h-full dark:bg-gray-800 dark:text-white">
        {/* Topo com botão */}
        <Header repos={repos()} active={active()} refreshBranches={refreshBranches} setActive={setActive} setRepos={setRepos} />

        {/* Abas + conteúdo */}
        <div class="flex flex-col flex-1">
          <TabBar repos={repos()} active={active()} onChangeActive={setActive} onClose={closeRepo} />

          <div class="flex-1 overflow-auto">
            {active() ? (
              <RepoView repo={repos().find(r => r.path === active())!} refreshBranches={refreshBranches} />
            ) : (
              <p class="text-gray-500 p-4">Nenhum repositório aberto</p>
            )}
          </div>
        </div>
      </div>
    </RepoContext.Provider>
  );
}
