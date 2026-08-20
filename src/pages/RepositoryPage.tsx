import { createEffect, createMemo, createResource, createSignal, lazy, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { getRepositorySnapshot, getLocalChanges, getRepositoryStatus, getRemoteUrl, listStashes, listTags } from "../services/gitService";
import TabBar from "../components/ui/TabBar";
import RepoView from "../components/repo/RepoView";
import { Repo } from "../models/Repo.model";
import RepoContext, { CommitDraft } from "../context/RepoContext";

import { loadRepos, saveRepos } from "../services/storeService";
import Header from "../components/layout/Header";
import LateralBar from "../components/ui/LateralBar";
import WelcomeScreen from "./WelcomeScreen";
import { githubService } from "../services/github";
import { useApp } from "../context/AppContext";
import { load } from "@tauri-apps/plugin-store";
import defaultAvatarImg from "../assets/default_avatar.png";
import { azureService } from "../services/azure";
import { getProviderFromUrl } from "../utils/gitProvider";
const FilesList = lazy(() => import("./FilesList"));
const Dashboard = lazy(() => import("./Dashboard"));
const ProviderAuthPage = lazy(() => import("./ProviderAuthPage"));
const PullRequestsPage = lazy(() => import("../components/PullRequest/PullRequestsPage"));
const TestRunner = lazy(() => import("../components/Test/TestRunner").then(module => ({ default: module.TestRunner })));
const PipelinesPage = lazy(() => import("../components/pipeleine/PipelinesPage"));

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);
  const [activePage, setActivePage] = createSignal<string>('commits');
  const [commitDrafts, setCommitDrafts] = createSignal<Record<string, CommitDraft>>({});
  const [isInitializing, setIsInitializing] = createSignal(true);
  const [initializationTotal, setInitializationTotal] = createSignal(0);
  const [initializationCompleted, setInitializationCompleted] = createSignal(0);
  const [initializationCurrent, setInitializationCurrent] = createSignal<string | null>(null);
  const [initializationFailures, setInitializationFailures] = createSignal(0);

  const initializationProgress = createMemo(() => {
    const total = initializationTotal();
    if (!total) return isInitializing() ? 12 : 100;
    return Math.round((initializationCompleted() / total) * 100);
  });

  type RefreshScope = "worktree" | "refs" | "all";
  type RefreshState = {
    scope: RefreshScope | null;
    timer?: ReturnType<typeof setTimeout>;
    inFlight: boolean;
    waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  };

  const refreshStates = new Map<string, RefreshState>();
  const busyRepos = new Set<string>();
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

  const setRepoBusy = (repoPath: string, busy: boolean) => {
    if (busy) busyRepos.add(repoPath);
    else busyRepos.delete(repoPath);
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
    try {
      const savedPaths = await loadRepos();
      setInitializationTotal(savedPaths.length);

      for (const repoPath of savedPaths) {
        setInitializationCurrent(repoPath);

        try {
          const snapshot = await getRepositorySnapshot(repoPath);
          const [stashes, tags] = await Promise.all([
            listStashes(repoPath),
            listTags(repoPath),
          ]);
          const name = repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;

          const repo: Repo = {
            path: repoPath,
            name,
            branches: snapshot.branches,
            remoteBranches: snapshot.remoteBranches,
            activeBranch: snapshot.activeBranch ?? undefined,
            localChanges: snapshot.localChanges,
            localChangesCount: snapshot.localChangesCount,
            gitRevision: snapshot.gitRevision ?? undefined,
            statusSignature: snapshot.statusSignature,
            stashes,
            tags,
            refsRevision: 0,
          };

          setRepos(prev => prev.some(item => item.path === repoPath) ? prev : [...prev, repo]);
          if (!active()) setActive(repoPath);
        } catch (err) {
          setInitializationFailures(value => value + 1);
          console.warn(`Não foi possível reabrir repo ${repoPath}`, err);
        } finally {
          setInitializationCompleted(value => value + 1);
        }
      }
    } catch (err) {
      console.warn("Não foi possível carregar os repositórios salvos", err);
    } finally {
      setInitializationCurrent(null);
      setIsInitializing(false);
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
    setRepos(prev => prev.map(repo => {
      if (repo.path !== repoPath) return repo;

      const changesChanged = localChangesSignature(repo.localChanges) !== localChangesSignature(localChanges);
      if (!changesChanged && repo.localChangesCount === localChanges.length) return repo;

      return {
        ...repo,
        localChanges,
        localChangesCount: localChanges.length,
        statusSignature: String(localChanges.length),
      };
    }));
  };

  const updateRefs = async (repoPath: string) => {
    const [snapshot, stashes, tags] = await Promise.all([
      getRepositorySnapshot(repoPath),
      listStashes(repoPath),
      listTags(repoPath),
    ]);

    setRepos(prev => prev.map(repo => {
      if (repo.path !== repoPath) return repo;

      const refsChanged = JSON.stringify(repo.branches) !== JSON.stringify(snapshot.branches)
        || repo.activeBranch !== (snapshot.activeBranch ?? undefined)
        || JSON.stringify(repo.stashes) !== JSON.stringify(stashes)
        || JSON.stringify(repo.tags) !== JSON.stringify(tags)
        || JSON.stringify(repo.remoteBranches) !== JSON.stringify(snapshot.remoteBranches);
      const changesChanged = localChangesSignature(repo.localChanges) !== localChangesSignature(snapshot.localChanges);

      if (!refsChanged && !changesChanged) {
        if (repo.gitRevision === (snapshot.gitRevision ?? undefined)
          && repo.statusSignature === snapshot.statusSignature) return repo;
      }

      return {
        ...repo,
        branches: snapshot.branches,
        activeBranch: snapshot.activeBranch ?? undefined,
        localChanges: snapshot.localChanges,
        localChangesCount: snapshot.localChangesCount,
        gitRevision: snapshot.gitRevision ?? undefined,
        statusSignature: snapshot.statusSignature,
        stashes,
        tags,
        remoteBranches: snapshot.remoteBranches,
        refsRevision: refsChanged ? (repo.refsRevision ?? 0) + 1 : repo.refsRevision,
      };
    }));
  };

  const pollRepositoryStatuses = async () => {
    if (isInitializing() || statusPollInFlight || document.visibilityState !== "visible") return;
    const currentRepos = repos();
    if (!currentRepos.length) return;

    statusPollInFlight = true;
    try {
      await Promise.all(currentRepos.map(async repo => {
        if (busyRepos.has(repo.path)) return;

        try {
          const status = await getRepositoryStatus(repo.path);
          const statusSignature = String(status.changeCount);
          const worktreeChanged = repo.statusSignature !== undefined
            && repo.statusSignature !== statusSignature;
          const refsChanged = !!repo.gitRevision && repo.gitRevision !== status.head
            || (!!status.branch && status.branch !== repo.activeBranch);

          if (repo.statusSignature !== statusSignature || repo.gitRevision !== status.head) {
            setRepos(prev => prev.map(item => item.path === repo.path
              ? {
                ...item,
                localChangesCount: status.changeCount,
                gitRevision: status.head,
                statusSignature,
              }
              : item
            ));
          }

          if (refsChanged) {
            scheduleRefresh(repo.path, "all", 0);
          } else if (worktreeChanged) {
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
      await updateRefs(repoPath);
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

  let previousActive: string | null = null;
  createEffect(() => {
    const currentActive = active();
    if (currentActive && previousActive !== null && currentActive !== previousActive) {
      scheduleRefresh(currentActive, "worktree", 0);
    }
    previousActive = currentActive;
  });

  onMount(async () => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && active()) {
        void requestRefresh(active()!, "all", 0).catch(() => undefined);
      }
    };
    const handleFocus = () => handleVisibilityChange();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    void pollRepositoryStatuses();
    statusPollTimer = setInterval(() => void pollRepositoryStatuses(), 5000);

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

          <Header repos={repos()} active={active()} activePage={activePage()} refreshBranches={refreshBranches} remoteUrl={remoteUrl()} setRepoBusy={setRepoBusy} setActive={setActive} setRepos={setRepos} />

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

      <Show when={isInitializing()}>
        <div
          class="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 px-6 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div class="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gray-900/95 p-7 text-white shadow-2xl shadow-blue-950/30">
            <div class="mb-6 flex items-start gap-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
                <i class="fa-solid fa-code-branch text-xl" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/80">Dev Brook</p>
                <h2 class="mt-1 text-xl font-semibold">{t('loading').loading_repositories}</h2>
              </div>
            </div>

            <div class="mb-3 flex items-center justify-between gap-4 text-xs text-gray-400">
              <span class="truncate">{initializationCurrent() || t('common').loading}</span>
              <span class="shrink-0 font-mono text-blue-300">
                {initializationCompleted()} {t('common').of} {initializationTotal()}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-gray-700/80">
              <div
                class="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-400 transition-[width] duration-500"
                style={{ width: `${initializationProgress()}%` }}
              />
            </div>
            <Show when={initializationFailures() > 0}>
              <p class="mt-4 text-xs text-amber-300">
                {t('common').warning}: {initializationFailures()}
              </p>
            </Show>
          </div>
        </div>
      </Show>
    </RepoContext.Provider>
  );
}
