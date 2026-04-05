import { createMemo, createResource, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { validateRepo, getRemoteBranches, getBranchStatus, getCurrentBranch, getLocalChanges } from "../services/gitService";
import TabBar from "../components/ui/TabBar";
import RepoView from "../components/repo/RepoView";
import { Repo } from "../models/Repo.model";
import RepoContext from "../context/RepoContext";

import { path } from "@tauri-apps/api";
import { loadRepos, saveRepos } from "../services/storeService";
import Header from "../components/layout/Header";
import LateralBar from "../components/ui/LateralBar";
import FilesList from "./FilesList";
import Dashboard from "./Dashboard";
import ProviderAuthPage from "./ProviderAuthPage";
import WelcomeScreen from "./WelcomeScreen";
import { githubService } from "../services/githubService";

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);
  const [activePage, setActivePage] = createSignal<string>('commits');
  const [user, { mutate, refetch }] = createResource(() => githubService.getCurrentUser());

  const closeRepo = (id: string) => {
    const currentRepos = repos();
    const isClosingActive = active() === id;

    const nextRepos = currentRepos.filter(r => r.path !== id);

    if (isClosingActive) {
      const nextActive = nextRepos.length > 0 ? nextRepos[0].path : null;
      setActive(nextActive);
    }

    setRepos(nextRepos);
    saveRepos(nextRepos);
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

  let isRefreshing = false;

  async function refreshBranches(repoPath: string) {
    if (isRefreshing) return;
    isRefreshing = true;

    try {
      const [branches, activeBranch, localChanges] = await Promise.all([
        getBranchStatus(repoPath),
        getCurrentBranch(repoPath),
        getLocalChanges(repoPath)
      ]);

      setRepos(prev =>
        prev.map(r =>
          r.path === repoPath ? { ...r, branches, activeBranch, localChanges } : r
        )
      );

      getRemoteBranches(repoPath).then(remoteBranches => {
        setRepos(prev =>
          prev.map(r =>
            r.path === repoPath ? { ...r, remoteBranches } : r
          )
        );
      }).catch(console.error);

    } finally {
      isRefreshing = false;
    }
  }

  const activeRepo = createMemo(() => {
    const currentActive = active();
    if (!currentActive) return null;
    return repos().find(r => r.path === currentActive) || null;
  });

  return (
     <RepoContext.Provider value={{ 
      repos, 
      active, 
      refreshBranches,
      user,
      mutateUser: mutate,
      refetchUser: refetch
    }}>
      <div class="flex flex-col h-full dark:bg-gray-800 dark:text-white">
        {/* Topo com botão */}
        <Header repos={repos()} active={active()} refreshBranches={refreshBranches} setActive={setActive} setRepos={setRepos} />

        {/* Abas + conteúdo */}
        <div class="flex flex-col flex-1">
          <TabBar repos={repos()} active={active()} onChangeActive={setActive} onClose={closeRepo} />

          <div class="flex flex-1 overflow-auto bg-gray-200 dark:bg-gray-900">
            <Show when={repos().length > 0 && active()}>
              <LateralBar repos={repos()} 
                active={activePage()} 
                onChangeActive={setActivePage}
                isLogged={!!user()}
              />
            </Show>
            
            <Switch 
              fallback={
                <WelcomeScreen 
                  repos={repos()} 
                  setActive={setActive} 
                  setRepos={setRepos}
                />
              }
            >
              {/* Caso: Página de Commits */}
              <Match when={active() && activePage() === 'commits'}>
                <Show when={activeRepo()} fallback={<div>Carregando repositório...</div>}>
                  {(currentRepo) => (
                    <RepoView 
                      repo={currentRepo()} 
                      refreshBranches={refreshBranches} 
                    />
                  )}
                </Show>
              </Match>

              {/* Caso: Página de Arquivos */}
              <Match when={active() && activePage() === 'files'}>
                <Show when={activeRepo()}>
                  <FilesList repo={activeRepo()!} />
                </Show>
              </Match>

              {/* Caso: Dashboard */}
              <Match when={active() && activePage() === 'dashboard'}>
                <Show when={activeRepo()}>
                  <Dashboard 
                    repo={activeRepo()!} 
                    branch={activeRepo()?.activeBranch} 
                  />
                </Show>
              </Match>

              {/* Nova Página: Auth/Perfil (Opcional, se já quiser deixar o lugar guardado) */}
              <Match when={active() && activePage() === 'profile'}>
                <Show when={activeRepo()}>
                  <ProviderAuthPage repoPath={active()!} />
                </Show>
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </RepoContext.Provider>
  );
}
