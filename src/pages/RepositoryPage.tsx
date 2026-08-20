import { createEffect, createMemo, createResource, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { validateRepo, getRemoteBranches, getBranchStatus, getCurrentBranch, getLocalChanges, getRepositoryStatus, getRemoteUrl, listStashes, listTags } from "../services/gitService";
import TabBar from "../components/ui/TabBar";
import RepoView from "../components/repo/RepoView";
import { Repo } from "../models/Repo.model";
import RepoContext, { CommitDraft } from "../context/RepoContext";

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
  const [commitDrafts, setCommitDrafts] = createSignal<Record<string, CommitDraft>>({});

  type RefreshScope = "worktree" | "refs" | "all";
  type RefreshState = {
    scope: RefreshScope | null;
    timer?: ReturnType<typeof setTimeout>;
    inFlight: boolean;
    waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  };

  const refreshStates = new Map<string, RefreshState>();
  let statusPollTimer: ReturnType<typeof setInterval> | undefined;
  let statusPollInFlight = false;

  const normalizeRepoPath = (repoPath: string) => repoPath.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const refreshScope = (current: RefreshScope | null, next: RefreshScope): RefreshScope => {
    if (!current || next === "all" || current === "all") return next === "all" ? "all" : current || next;
    if (current === "refs" || next === "refs") return "refs";
    return "worktree";
  };

  const updateCommitDraft = (repoPath: string, draft: CommitDraft) => {
    setCommitDrafts(prev => ({ ...prev, [repoPath]: draft }));
  };

  const clearCommitDraft = (repoPath: string) => {
    setCommitDrafts(prev => {
      if (!prev[repoPath]) return prev;
      const next = { ...prev };
      delete next[repoPath];
      return next;
    });
  };

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
    clearCommitDraft(id);
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
        const [localChanges, stashes, tags] = await Promise.all([
          getLocalChanges(repoPath),
          listStashes(repoPath),
          listTags(repoPath),
        ]);

        const repo: Repo = { path: repoPath, name, branches, remoteBranches, activeBranch, localChanges, localChangesCount: localChanges.length, stashes, tags, refsRevision: 0 };
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

  const localChangesSignature = (changes: Repo["localChanges"]) =>
    (changes ?? []).map(change => [
      change.path,
      change.status,
      change.staged,
      change.size,
      change.isBinary,
      change.isPreviewable,
    ].join("|")).join("\u0000");

  const updateLocalChanges = async (repoPath: string) => {
    const localChanges = await getLocalChanges(repoPath);
    setRepos(prev => prev.map(repo => repo.path === repoPath
      ? { ...repo, localChanges, localChangesCount: localChanges.length }
      : repo
    ));
  };

  const updateRefs = async (repoPath: string, forceRevision = false) => {
    const [branches, activeBranch, localChanges, stashes, tags, remoteBranches] = await Promise.all([
      getBranchStatus(repoPath),
      getCurrentBranch(repoPath),
      getLocalChanges(repoPath),
      listStashes(repoPath),
      listTags(repoPath),
      getRemoteBranches(repoPath),
    ]);

    setRepos(prev => prev.map(repo => {
      if (repo.path !== repoPath) return repo;

      const refsChanged = JSON.stringify(repo.branches) !== JSON.stringify(branches)
        || repo.activeBranch !== activeBranch
        || JSON.stringify(repo.stashes) !== JSON.stringify(stashes)
        || JSON.stringify(repo.tags) !== JSON.stringify(tags)
        || JSON.stringify(repo.remoteBranches) !== JSON.stringify(remoteBranches);
      const changesChanged = localChangesSignature(repo.localChanges) !== localChangesSignature(localChanges);

      if (!forceRevision && !refsChanged && !changesChanged) return repo;

      return {
        ...repo,
        branches,
        activeBranch,
        localChanges,
        localChangesCount: localChanges.length,
        stashes,
        tags,
        remoteBranches,
        refsRevision: forceRevision || refsChanged ? (repo.refsRevision ?? 0) + 1 : repo.refsRevision,
      };
    }));
  };

  const pollRepositoryStatuses = async () => {
    if (statusPollInFlight || document.visibilityState !== "visible") return;
    const currentRepos = repos();
    if (!currentRepos.length) return;

    statusPollInFlight = true;
    try {
      await Promise.all(currentRepos.map(async repo => {
        try {
          const status = await getRepositoryStatus(repo.path);
          const currentCount = repo.localChangesCount ?? repo.localChanges?.length ?? 0;
          const countChanged = currentCount !== status.changeCount;
          const revisionChanged = !!repo.gitRevision && repo.gitRevision !== status.head;
          const branchChanged = !!status.branch && status.branch !== repo.activeBranch;

          if (countChanged || repo.gitRevision !== status.head) {
            setRepos(prev => prev.map(item => item.path === repo.path
              ? { ...item, localChangesCount: status.changeCount, gitRevision: status.head }
              : item
            ));
          }
          if (revisionChanged || branchChanged) {
            scheduleRefresh(repo.path, "all", 0);
          } else if (active() === repo.path) {
            scheduleRefresh(repo.path, "worktree", 0);
          }
        } catch (error) {
          console.warn(`Não foi possível consultar o status de ${repo.path}:`, error);
        }
      }));
    } finally {
      statusPollInFlight = false;
    }
  };

  const executeRefresh = async (repoPath: string, scope: RefreshScope) => {
    if (!repos().some(repo => repo.path === repoPath)) return;
    if (scope === "worktree") {
      await updateLocalChanges(repoPath);
    } else {
      await updateRefs(repoPath, true);
    }
  };

  const getRefreshState = (repoPath: string) => {
    const key = normalizeRepoPath(repoPath);
    let state = refreshStates.get(key);
    if (!state) {
      state = { scope: null, inFlight: false, waiters: [] };
      refreshStates.set(key, state);
    }
    return { key, state };
  };

  const flushRefresh = async (repoPath: string) => {
    const { key, state } = getRefreshState(repoPath);
    state.timer = undefined;
    if (state.inFlight || !state.scope) return;

    const scope = state.scope;
    state.scope = null;
    state.inFlight = true;
    const waiters = state.waiters.splice(0);

    try {
      await executeRefresh(repoPath, scope);
      waiters.forEach(waiter => waiter.resolve());
    } catch (error) {
      waiters.forEach(waiter => waiter.reject(error));
      console.error(`Erro ao atualizar o repositório ${repoPath}:`, error);
    } finally {
      state.inFlight = false;
      if (state.scope && !state.timer) {
        state.timer = setTimeout(() => void flushRefresh(repoPath), 0);
      }
      if (!state.inFlight && !state.scope && !state.waiters.length && !state.timer) {
        refreshStates.delete(key);
      }
    }
  };

  const scheduleRefresh = (repoPath: string, scope: RefreshScope, delay = 250) => {
    const { state } = getRefreshState(repoPath);
    state.scope = refreshScope(state.scope, scope);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => void flushRefresh(repoPath), delay);
  };

  const requestRefresh = (repoPath: string, scope: RefreshScope, delay = 250) => {
    const { state } = getRefreshState(repoPath);
    const promise = new Promise<void>((resolve, reject) => {
      state.waiters.push({ resolve, reject });
    });
    scheduleRefresh(repoPath, scope, delay);
    return promise;
  };

  const refreshLocalChanges = async (repoPath: string) => {
    await requestRefresh(repoPath, "worktree", 0);
  };

  async function refreshBranches(repoPath: string) {
    await requestRefresh(repoPath, "all", 0);
  }

  createEffect(() => {
    const currentActive = active();
    if (currentActive) {
      scheduleRefresh(currentActive, "worktree", 0);
    }
  });

  onMount(async () => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        repos().forEach(repo => void requestRefresh(repo.path, "all", 0).catch(() => undefined));
      }
    };
    const handleFocus = () => handleVisibilityChange();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    void pollRepositoryStatuses();
    statusPollTimer = setInterval(() => void pollRepositoryStatuses(), 1500);

    onCleanup(() => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      if (statusPollTimer) clearInterval(statusPollTimer);
      refreshStates.forEach(state => {
        if (state.timer) clearTimeout(state.timer);
        state.waiters.forEach(waiter => waiter.resolve());
      });
    });
  });

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
      refreshLocalChanges,
      commitDrafts,
      updateCommitDraft,
      clearCommitDraft,
      user,
      mutateUser: mutate,
      refetchUser: refetch
    }}>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden dark:bg-gray-800 dark:text-white">

        {/* Abas + conteúdo */}
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabBar repos={repos()} active={active()} onChangeActive={setActive} onClose={closeRepo} />

          <Header repos={repos()} active={active()} activePage={activePage()} refreshBranches={refreshBranches} setActive={setActive} setRepos={setRepos} />

          <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-gray-200 dark:bg-gray-900">
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
                      onMergeSuccess={() => refreshBranches(currentRepo().path)}
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
