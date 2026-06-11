import { createMemo, createResource, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { validateRepo, getRemoteBranches, getBranchStatus, getCurrentBranch, getLocalChanges, getRemoteUrl } from "../services/gitService";
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
import { githubService } from "../services/github";
import PullRequestsPage from "../components/PullRequest/PullRequestsPage";
import { TestRunner } from "../components/Test/TestRunner";
import { useApp } from "../context/AppContext";
import { load } from "@tauri-apps/plugin-store";
import defaultAvatarImg from "../assets/default_avatar.png";
import { azureService } from "../services/azure";
import { getProviderFromUrl } from "../utils/gitProvider";
import PipelinesPage from "../components/pipeleine/PipelinesPage";

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

  const [user, { mutate, refetch }] = createResource(
    () => true, // Fonte estática: roda uma vez no mount e deu.
    async () => {
      try {
        // Busca o usuário de forma isolada do fluxo principal
        const githubUser = await githubService.getCurrentUser().catch(err => {
          console.warn("GitHub deu timeout ou erro controlado:", err);
          return null;
        });
        
        let azureUser = null;
        try {
          const store = await load("auth.bin");
          const azureToken = await store.get<string>("azure_token");
          const azureOrg = await store.get<string>("azure_org");

          if (azureToken && azureOrg) {
            // Se o avatar travar, não derruba o fluxo inteiro
            const remoteAvatar = await azureService.getUserAvatar(azureToken, azureOrg).catch(() => null);

            azureUser = {
              login: azureOrg,
              name: "Azure Developer",
              avatar_url: remoteAvatar || defaultAvatarImg
            };
          }
        } catch (e) {
          console.warn("Não foi possível ler a store do Azure:", e);
        }

        if (!githubUser && !azureUser) return null;

        return {
          ...githubUser,
          github: githubUser ? { login: githubUser.login, avatar_url: githubUser.avatar_url } : undefined,
          azure: azureUser || undefined,
          login: githubUser?.login || azureUser?.login,
          avatar_url: githubUser?.avatar_url || azureUser?.avatar_url || defaultAvatarImg,
          provider: githubUser ? 'github' : (azureUser ? 'azure' : undefined)
        };
      } catch (err) {
        console.error("Erro crítico ao unificar provedores:", err);
        return null;
      }
    }
  );
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
          <TabBar repos={repos()} active={active()} onChangeActive={setActive} onClose={closeRepo} />

          <Header repos={repos()} active={active()} activePage={activePage()} refreshBranches={refreshBranches} setActive={setActive} setRepos={setRepos} />

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
                  setActive={setActive} 
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
                      onMergeSuccess={(prNumber) => refreshBranches(currentRepo().path)}
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

              <Match when={active() && activePage() === 'pipeline'}>
                <Show when={activeRepo()}>
                  {(currentRepo) => (
                    <PipelinesPage repo={currentRepo()} provider={provider()} remoteUrl={remoteUrl()!} />
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
