import { createEffect, createMemo, createResource, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { validateRepo, getRemoteBranches, getBranchStatus, getCurrentBranch, getLocalChanges, getRemoteUrl } from "../services/gitService";
import TabBar from "../components/ui/TabBar";
import RepoView from "../components/repo/RepoView";
import { Repo } from "../models/Repo.model";
import RepoContext from "../context/RepoContext";

import { path } from "@tauri-apps/api";
import { loadActiveRepo, loadRepos, saveActiveRepo, saveRepos } from "../services/storeService";
import Header from "../components/layout/Header";
import LateralBar from "../components/ui/LateralBar";
import FilesList from "./FilesList";
import Dashboard from "./Dashboard";
import ProviderAuthPage from "./ProviderAuthPage";
import WelcomeScreen from "./WelcomeScreen";
import { githubService } from "../services/github";
import PullRequestsPage from "../components/PullRequest/PullRequestsPage";
import { TestRunner } from "../components/Test/TestRunner";
import { useApp } from "../context/AppContext";
import { load } from "@tauri-apps/plugin-store";
import defaultAvatarImg from "../assets/default_avatar.png";
import { azureService } from "../services/azure";
import { getProviderFromUrl } from "../utils/gitProvider";

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);
  const [activePage, setActivePage] = createSignal<string>('commits');

  const [remoteUrl] = createResource(
    () => active(), 
    async (currentPath) => {
      if (!currentPath) return "";
      return await getRemoteUrl(currentPath);
    }
  );
  const provider = () => remoteUrl() ? getProviderFromUrl(remoteUrl()!) : 'unknown';
    
  const [user, { mutate, refetch }] = createResource(async () => {
    try {
      // 1. Busca o usuário do GitHub normalmente
      const githubUser = await githubService.getCurrentUser();
      
      // 2. Carrega as credenciais dinâmicas do Azure gravadas na Store
      let azureUser = null;
      try {
        const store = await load("auth.bin");
        const azureToken = await store.get<string>("azure_token");
        const azureOrg = await store.get<string>("azure_org");

        if (azureToken && azureOrg) {
          const remoteAvatar = await azureService.getUserAvatar(azureToken, azureOrg);

          azureUser = {
            login: azureOrg,
            name: "Azure Developer",
            avatar_url: remoteAvatar || defaultAvatarImg // Usa o remoto ou o fallback local do projeto
          };
        }
      } catch (e) {
        console.warn("Não foi possível ler a store do Azure no carregamento global:", e);
      }

      // 3. Retorna o objeto unificado respeitando quem de fato está conectado
      return {
        ...githubUser,
        github: githubUser ? { 
          login: githubUser.login, 
          avatar_url: githubUser.avatar_url 
        } : undefined,
        azure: azureUser || undefined,
        
        // Propriedades raiz híbridas para retrocompatibilidade da UI
        login: githubUser?.login || azureUser?.login,
        avatar_url: githubUser?.avatar_url || azureUser?.avatar_url || defaultAvatarImg,
        provider: githubUser ? 'github' : (azureUser ? 'azure' : undefined)
      };
    } catch (err) {
      console.error("Erro ao unificar provedores de autenticação:", err);
      return null;
    }
  });
  const { t } = useApp();

  const isLoggedOnProvider = () => {
    if (provider() === 'github') {
      return !!user()?.github;
    } else if (provider() === 'azure') {
      return !!user()?.azure;
    }
    return false;
  }

  const closeRepo = (id: string) => {
    const currentRepos = repos();
    const isClosingActive = active() === id;

    const nextRepos = currentRepos.filter(r => r.path !== id);

    if (isClosingActive) {
      const nextActive = nextRepos.length > 0 ? nextRepos[0].path : null;
      changeActiveRepo(nextActive);
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
      const savedActive = await loadActiveRepo();
      const stillExists = repos().some(r => r.path === savedActive);
      if (savedActive && stillExists) {
        setActive(savedActive);
      } else {
        setActive(repos()[0].path);
        await saveActiveRepo(repos()[0].path);
      }
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
    if (document.visibilityState === "visible" && active() && ['commits', 'dashboard'].includes(activePage())) {
      refreshBranches(active()!);
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  const handleFocus = () => {
    if (active() && ['commits', 'dashboard'].includes(activePage())) refreshBranches(active()!);
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

  const changeActiveRepo = (newActive: string | null) => {
    saveActiveRepo(newActive);
    setActive(newActive);
  }

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

        {/* Abas + conteúdo */}
        <div class="flex flex-col flex-1">
          <TabBar repos={repos()} active={active()} onChangeActive={changeActiveRepo} onClose={closeRepo} />

          <Header repos={repos()} active={active()} activePage={activePage()} refreshBranches={refreshBranches} setActive={changeActiveRepo} setRepos={setRepos} />

          <div class="flex flex-1 overflow-auto bg-gray-200 dark:bg-gray-900">
            <Show when={repos().length > 0 && active()}>
              <LateralBar repos={repos()} 
                active={activePage()} 
                onChangeActive={setActivePage}
                isLogged={isLoggedOnProvider()}
              />
            </Show>
            
            <Switch 
              fallback={
                <WelcomeScreen 
                  repos={repos()} 
                  setActive={changeActiveRepo} 
                  setRepos={setRepos}
                />
              }
            >
              {/* Caso: Página de Commits */}
              <Match when={active() && activePage() === 'commits'}>
                <Show when={activeRepo()} fallback={<div>{t('loading').loading_repositories}</div>}>
                  {(currentRepo) => (
                    <RepoView 
                      repo={currentRepo()}
                      provider={provider()}
                      remoteUrl={remoteUrl()!}
                      goToPage={(page: string) => setActivePage(page)}
                      isLogged={isLoggedOnProvider()}
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

              <Match when={active() && activePage() === 'pull-requests'}>
                <Show when={activeRepo()} fallback={<div>{t('loading').loading_pull_requests}</div>}>
                  {(currentRepo) => (
                    <PullRequestsPage 
                      repo={currentRepo()} 
                      branch={activeRepo()?.activeBranch}
                      provider={provider()}
                      remoteUrl={remoteUrl()!}
                    />
                  )}
                </Show>
              </Match>

              <Match when={active() && activePage() === 'test'}>
                <Show when={activeRepo()} fallback={<div>{t('loading').loading_repositories}</div>}>
                  {(currentRepo) => (
                    <TestRunner 
                      repo={currentRepo()} 
                    />
                  )}
                </Show>
              </Match>

              <Match when={active() && activePage() === 'profile'}>
                <Show when={activeRepo()}>
                  <ProviderAuthPage repoPath={active()!} provider={provider()} />
                </Show>
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </RepoContext.Provider>
  );
}
