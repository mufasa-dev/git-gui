import { createEffect, createMemo, createResource, createSignal, lazy, Match, onCleanup, onMount, Show, Switch, untrack } from "solid-js";
import { getRepositorySnapshot, getRepositoriesChangeCounts, getRepositoryStatus, getLocalChanges, getRemoteUrl, listStashes, listTags } from "../services/gitService";
import TabBar from "../components/ui/TabBar";
import RepoView from "../components/repo/RepoView";
import { Repo } from "../models/Repo.model";
import RepoContext, { CommitDraft } from "../context/RepoContext";

import { loadActiveRepo, loadRepos, saveActiveRepo, saveRepos } from "../services/storeService";
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
// 🔧 Tela de IA desabilitada temporariamente. Para reativar, descomente esta
// linha e o <Match> correspondente logo abaixo (busque por activePage() === 'ai').
// const AIPage = lazy(() => import("../components/ai/AIPage"));

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);
  const [activePage, setActivePage] = createSignal<string>('commits');
  const [viewBranches, setViewBranches] = createSignal<Record<string, string>>({});
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
  let backgroundPollTimer: ReturnType<typeof setInterval> | undefined;
  let backgroundPollInFlight = false;
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

  const selectedBranchForRepo = (repo: Repo | null) =>
    repo ? viewBranches()[repo.path] || repo.activeBranch || "" : "";

  const setViewBranch = (repoPath: string, branch: string) => {
    setViewBranches(prev => ({ ...prev, [repoPath]: branch }));
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
      changeActiveRepo(nextActive);
    }

    setRepos(nextRepos);
    setViewBranches(previous => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
    clearCommitDraft(id);
    saveRepos(nextRepos);
  };

  createEffect(() => {
    const currentRepos = repos();
    setViewBranches(previous => {
      const next = { ...previous };
      let changed = false;

      currentRepos.forEach(repo => {
        const selected = next[repo.path];
        const hasSelectedBranch = repo.branches.length === 0 || repo.branches.some(branch => branch.name === selected);
        if (selected === undefined || !hasSelectedBranch) {
          next[repo.path] = repo.activeBranch || "";
          changed = true;
        }
      });

      Object.keys(next).forEach(repoPath => {
        if (!currentRepos.some(repo => repo.path === repoPath)) {
          delete next[repoPath];
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  });

  // Carrega os dados completos de um repositório (snapshot, stashes e tags).
  // Chamadas simultâneas para o mesmo repositório compartilham a mesma Promise.
  const repoLoads = new Map<string, Promise<boolean>>();

  const repoNameFromPath = (repoPath: string) =>
    repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;

  const placeholderRepo = (repoPath: string): Repo => ({
    path: repoPath,
    name: repoNameFromPath(repoPath),
    branches: [],
    pending: true,
  });

  const loadRepoData = (repoPath: string): Promise<boolean> => {
    const existing = repoLoads.get(repoPath);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const [snapshot, stashes, tags] = await Promise.all([
          getRepositorySnapshot(repoPath),
          listStashes(repoPath),
          listTags(repoPath),
        ]);

        setRepos(prev => prev.map(repo => repo.path !== repoPath ? repo : {
          ...repo,
          branches: snapshot.branches,
          remoteBranches: snapshot.remoteBranches,
          activeBranch: snapshot.activeBranch ?? undefined,
          localChanges: snapshot.localChanges,
          localChangesCount: snapshot.localChangesCount,
          gitRevision: snapshot.gitRevision ?? undefined,
          statusSignature: snapshot.statusSignature,
          stashes,
          tags,
          refsRevision: (repo.refsRevision ?? 0) + 1,
          pending: false,
        }));
        return true;
      } catch (err) {
        console.warn(`Não foi possível reabrir repo ${repoPath}`, err);
        // Remove a aba (sem apagar da lista salva, igual ao comportamento anterior).
        const remaining = untrack(repos).filter(repo => repo.path !== repoPath);
        setRepos(remaining);
        if (untrack(active) === repoPath) {
          setActive(remaining[0]?.path ?? null);
        }
        return false;
      } finally {
        repoLoads.delete(repoPath);
      }
    })();

    repoLoads.set(repoPath, promise);
    return promise;
  };

  onMount(async () => {
    try {
      const savedPaths = [...new Set(await loadRepos())];
      const savedActive = await loadActiveRepo().catch(() => null);

      // Cria todas as abas na hora, mas só carrega os dados do repositório ativo.
      // Os demais são carregados quando a aba for aberta.
      setRepos(savedPaths.map(placeholderRepo));

      const initialActive = savedActive && savedPaths.includes(savedActive)
        ? savedActive
        : savedPaths[0] ?? null;

      if (initialActive) {
        setInitializationTotal(1);
        setInitializationCurrent(initialActive);
        setActive(initialActive);
        const ok = await loadRepoData(initialActive);
        if (!ok) setInitializationFailures(value => value + 1);
        setInitializationCompleted(value => value + 1);
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
    const nextActiveBranch = snapshot.activeBranch ?? undefined;
    const currentRepo = repos().find(repo => repo.path === repoPath);

    if (currentRepo && currentRepo.activeBranch !== nextActiveBranch) {
      setViewBranch(repoPath, nextActiveBranch || "");
    }

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
    // Só o repositório ativo é consultado. Os outros são atualizados
    // quando a aba deles for aberta (ver efeito de troca de aba abaixo).
    const currentActive = active();
    const currentRepos = repos().filter(repo => repo.path === currentActive && !repo.pending);
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

  // Atualiza só o indicador de alterações (bolinha da aba) dos repositórios
  // que NÃO estão ativos, com uma consulta leve feita em paralelo no backend.
  // O repositório ativo continua no polling completo de 5 s acima.
  const pollBackgroundRepos = async () => {
    if (isInitializing() || backgroundPollInFlight || document.visibilityState !== "visible") return;
    const currentActive = active();
    const paths = repos()
      .map(repo => repo.path)
      .filter(path => path !== currentActive && !busyRepos.has(path));
    if (!paths.length) return;

    backgroundPollInFlight = true;
    try {
      const counts = await getRepositoriesChangeCounts(paths);
      const activeNow = active();
      setRepos(prev => {
        let changed = false;
        const next = prev.map(repo => {
          // Se o usuário abriu a aba enquanto a consulta rodava, o polling
          // completo do repositório ativo é quem manda.
          if (repo.path === activeNow) return repo;
          const count = counts[repo.path];
          if (count === undefined || count === null || repo.localChangesCount === count) return repo;
          changed = true;
          return { ...repo, localChangesCount: count };
        });
        return changed ? next : prev;
      });
    } catch (error) {
      console.warn("Não foi possível consultar o status dos repositórios em segundo plano:", error);
    } finally {
      backgroundPollInFlight = false;
    }
  };

  const executeRefresh = async (repoPath: string, scope: RefreshScope) => {
    const repo = repos().find(item => item.path === repoPath);
    if (!repo) return;
    if (repo.pending) {
      await loadRepoData(repoPath);
      return;
    }
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
    if (currentActive && currentActive !== previousActive) {
      const repo = untrack(repos).find(item => item.path === currentActive);
      if (repo?.pending) {
        // Primeira vez que a aba é aberta: carrega os dados completos.
        void loadRepoData(currentActive);
      } else if (repo && previousActive !== null) {
        // Repositórios inativos não entram no polling, então ao voltar para
        // a aba atualizamos tudo (refs + alterações locais).
        scheduleRefresh(currentActive, "all", 0);
      }
      if (!untrack(isInitializing)) void saveActiveRepo(currentActive).catch(() => undefined);
    }
    previousActive = currentActive;
  });

  onMount(async () => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && active()) {
        void requestRefresh(active()!, "all", 0).catch(() => undefined);
      }
    };
    const handleFocus = () => {
      handleVisibilityChange();
      void pollBackgroundRepos();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    void pollRepositoryStatuses();
    statusPollTimer = setInterval(() => void pollRepositoryStatuses(), 5000);
    backgroundPollTimer = setInterval(() => void pollBackgroundRepos(), 10000);

    onCleanup(() => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      if (statusPollTimer) clearInterval(statusPollTimer);
      if (backgroundPollTimer) clearInterval(backgroundPollTimer);
      refreshStates.forEach(state => {
        if (state.timer) clearTimeout(state.timer);
        state.waiters.forEach(waiter => waiter.resolve());
      });
    });
  });

  // Assim que a inicialização termina, já preenche as bolinhas das outras abas.
  createEffect(() => {
    if (!isInitializing()) void untrack(() => pollBackgroundRepos());
  });

  // Repositório ativo que ainda está carregando (aba aberta pela primeira vez).
  const pendingActiveRepo = createMemo(() => {
    const currentActive = active();
    if (!currentActive) return null;
    const repo = repos().find(r => r.path === currentActive);
    return repo?.pending ? repo : null;
  });

  const activeRepo = createMemo(() => {
    const currentActive = active();
    if (!currentActive) return null;
    const repo = repos().find(r => r.path === currentActive);
    // Enquanto os dados não chegam, as telas mostram o fallback de carregamento.
    return repo && !repo.pending ? repo : null;
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

          <Header
            repos={repos()}
            active={active()}
            activePage={activePage()}
            refreshBranches={refreshBranches}
            remoteUrl={remoteUrl()}
            setRepoBusy={setRepoBusy}
            selectedBranch={selectedBranchForRepo(activeRepo())}
            onBranchChange={(branch) => active() && setViewBranch(active()!, branch)}
            setActive={setActive}
            setRepos={setRepos}
          />

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
                  setActive={changeActiveRepo} 
                  setRepos={setRepos}
                />
              }
            >
              {/* 🔧 Tela de IA desabilitada temporariamente (ver comentário do import acima).
              <Match when={active() && activePage() === 'ai'}>
                <Show when={activeRepo()} fallback={<div>{t('loading').loading_repositories}</div>}>
                  {(currentRepo) => <AIPage repo={currentRepo()} />}
                </Show>
              </Match>
              */}

              {/* Repositório ainda carregando: painel central em qualquer página */}
              <Match when={pendingActiveRepo()}>
                {(pendingRepo) => (
                  <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6" role="status" aria-live="polite" aria-busy="true">
                    <div class="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-300 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-gray-800/90 dark:shadow-blue-950/30">
                      <div class="flex items-center gap-4">
                        <div class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-500 dark:text-blue-400">
                          <div class="absolute inset-0 rounded-2xl border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                          <i class="fa-solid fa-code-branch text-lg" aria-hidden="true" />
                        </div>
                        <div class="min-w-0">
                          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500/80 dark:text-blue-300/80">{t('loading').loading_repository}</p>
                          <h2 class="mt-1 truncate text-lg font-semibold text-gray-800 dark:text-white" title={pendingRepo().path}>{pendingRepo().name}</h2>
                        </div>
                      </div>
                      <p class="mt-4 truncate text-xs text-gray-500 dark:text-gray-400" title={pendingRepo().path}>{pendingRepo().path}</p>
                      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700/80">
                        <div class="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-400" />
                      </div>
                    </div>
                  </div>
                )}
              </Match>

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
                  <FilesList
                    repo={activeRepo()!}
                    branch={selectedBranchForRepo(activeRepo())}
                    onBranchChange={(branch) => active() && setViewBranch(active()!, branch)}
                  />
                </Show>
              </Match>

              {/* Caso: Dashboard */}
              <Match when={active() && activePage() === 'dashboard'}>
                <Show when={activeRepo()}>
                  <Dashboard
                    repo={activeRepo()!}
                    branch={selectedBranchForRepo(activeRepo())}
                  />
                </Show>
              </Match>

              <Match when={active() && activePage() === 'pull-requests'}>
                <Show when={activeRepo()} fallback={<div>{t('loading').loading_pull_requests}</div>}>
                  {(currentRepo) => (
                    <PullRequestsPage 
                      repo={currentRepo()}
                      branch={selectedBranchForRepo(currentRepo())}
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
