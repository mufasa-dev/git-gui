import { createResource, Show, For, createSignal, Switch, Match, createMemo } from "solid-js";
import { githubService } from "../../services/github";
import PRFilesTab from "./PRFilesTab";
import PRCommitsView from "./PRCommitsView";
import PRChecksView from "./PRChecksView";
import PRTimelineView from "./PRTimelineView";
import { getRelativeTime } from "../../utils/date";
import CommitMessage from "../ui/CommitMessage";
import Dialog from "../ui/Dialog";
import { CommitDetails } from "../commits/CommitDetails";
import { getCommitDetails } from "../../services/gitService";
import { Repo } from "../../models/Repo.model";
import { formatContributorName } from "../../utils/user";
import { UserProfileDialog } from "../Config/UserProfile";
import PRStatusBadge from "./PRStatusBadge";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";
import { azureService } from "../../services/azure";
import { GitProvider, parseRemoteRepository } from "../../utils/gitProvider";
import { open } from "@tauri-apps/plugin-shell";
import PRConflictResolver from "./PRConflictResolver";

interface PRDetailViewProps {
  pr: any;
  owner: string;
  project: string;
  repo: Repo;
  branch?: string;
  provider: GitProvider;
  remoteUrl: string;
  onMergeSuccess: (prNumber: number) => void;
}

export default function PRDetailView(props: PRDetailViewProps) {
  const [activeTab, setActiveTab] = createSignal("overview");
  const [showModalCommitDetails, setModalCommitDetails] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [modalUserProfileOpen, setModalUserProfileOpen] = createSignal(false);
  const [selectedUser, setSelectedUser] = createSignal({} as { name: string; email: string });
  const [isApproving, setIsApproving] = createSignal(false);
  const [isMerging, setIsMerging] = createSignal(false);
  const [showConflictResolver, setShowConflictResolver] = createSignal(false);
  const [showMergeConfirmation, setShowMergeConfirmation] = createSignal(false);
  const [isPrUrlCopied, setIsPrUrlCopied] = createSignal(false);
  const { t, locale } = useApp();
  
  const [details, { refetch }] = createResource(
    () => ({ owner: props.owner, project: props.project, name: props.repo.name, number: props.pr.number, provider: props.provider }),
    async (p) => {
      if (p.provider === 'azure') {
        return await azureService.getPullRequestDescription(p.owner, p.name, p.number, props.project);
      }
      return await githubService.getPullRequestDescription(p.owner, p.name, p.number);
    }
  );

  const reviewersList = createMemo(() => {
    const data = details();
    if (!data) return [];

    if (props.provider === 'azure' && (data as any).reviewers) {
      return (data as any).reviewers;
    }

    const list: any[] = [];

    // 1. Adiciona quem já revisou
    data.reviews?.nodes?.forEach((review: any) => {
      // Evita duplicados, pegando sempre o estado mais recente
      const existing = list.find(r => r.login === review.author.login);
      if (existing) {
        existing.state = review.state;
      } else {
        list.push({
          login: review.author.login,
          avatarUrl: review.author.avatarUrl,
          name: review.author.name,
          state: review.state, // APPROVED, CHANGES_REQUESTED, COMMENTED
        });
      }
    });

    // 2. Adiciona quem foi solicitado e ainda não fez nada
    data.reviewRequests?.nodes?.forEach((req: any) => {
      const user = req.requestedReviewer;
      if (!list.find(r => r.login === user.login)) {
        list.push({
          login: user.login,
          avatarUrl: user.avatarUrl,
          name: user.name,
          state: "PENDING",
        });
      }
    });

    return list;
  });

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
    setModalCommitDetails(true);
  }

  function openUserProfile(name: string, email: string, login: string) {
    if (email) {
        setSelectedUser({ name: name, email: email });
        setModalUserProfileOpen(true);
    } else {
      githubService.openInBrowser(login);
    }
  }

  const handleApprove = async () => {
    // O ideal é que o props.pr já venha com o 'node_id' ou 'id' do GraphQL
    const prId = props.pr.node_id || props.pr.id; 
    
    if (!prId) {
      notify.error("Erro", "ID do Pull Request não encontrado.");
      return;
    }

    setIsApproving(true);
    try {
      if (props.provider === 'github') {
        await githubService.approvePullRequest(prId);
      } else if (props.provider === 'azure') {
        await azureService.approvePullRequest(props.owner, props.repo.name, props.pr.number, props.project);
      }
      notify.success("Sucesso", "Pull Request aprovado com sucesso!");
      
      refetch(); 
    } catch (err) {
      notify.error("Falha na Aprovação", String(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleMerge = async () => {
    const prId = props.pr.node_id || props.pr.id; 
    
    if (!prId) {
      notify.error("Erro", "ID do Pull Request não encontrado.");
      return;
    }

    setIsMerging(true);
    try {
      if (props.provider === 'github') {
        await githubService.mergePullRequest(prId);
      } else if (props.provider === 'azure') {
        // Se for Azure, chama o merge correspondente
        await azureService.mergePullRequest(props.owner, props.repo.name, props.pr.number, props.project);
      }

      notify.success("Sucesso", "Pull Request mesclado com sucesso!");
      setShowMergeConfirmation(false);
      props.onMergeSuccess(props.pr.number);

    } catch (err) {
      notify.error("Falha no Merge", String(err));
    } finally {
      setIsMerging(false);
    }
  };

  const getProviderPageUrl = async () => {
    const context = parseRemoteRepository(props.remoteUrl);
    return props.provider === 'github'
      ? await githubService.getPullRequestWebUrl(props.owner, props.repo.name, props.pr.number)
      : context?.organization && context.project
        ? await azureService.getPullRequestWebUrl(context.organization, context.project, props.repo.name, props.pr.number)
        : details()?.url || props.pr.url || props.remoteUrl;
  };

  const openProviderPage = async () => {
    try {
      const url = await getProviderPageUrl();
      if (url) await open(url);
    } catch (error) {
      notify.error("Falha ao abrir o PR", String(error));
    }
  };

  const copyPullRequestUrl = async () => {
    try {
      const url = await getProviderPageUrl();
      if (!url) throw new Error("URL do Pull Request não encontrada.");

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Não foi possível acessar a área de transferência.");
      }

      setIsPrUrlCopied(true);
      window.setTimeout(() => setIsPrUrlCopied(false), 2200);
      notify.success(t('pr').copy_link, t('pr').pr_url_copied);
    } catch (error) {
      notify.error(t('error').error, String(error));
    }
  };

  const tabs = createMemo(() => [
    { id: 'overview', label: t('pr').conversation, icon: 'fa-regular fa-comments' },
    { id: 'files', label: t('file').files, icon: 'fa-regular fa-file-code' },
    { id: 'commits', label: t('commits').commits, icon: 'fa-solid fa-code-commit' },
    { id: 'checks', label: t('pr').checked, icon: 'fa-solid fa-list-check' }
  ]);

  return (
    <div class="flex flex-col h-full select-text transition-colors">
      {/* HEADER ESTILO TRIDENT */}
      <header class="container-branch-list p-4 mb-2">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center">
            <CommitMessage message={props.pr.title} class="text-xl" />
            <span class="text-gray-500/50 dark:text-gray-400 ml-2">#{props.pr.number}</span>
          </h1>
          <div class="flex items-center gap-2">
            <button
              onClick={copyPullRequestUrl}
              title={isPrUrlCopied() ? t('pr').pr_url_copied : t('pr').copy_link}
              aria-label={t('pr').copy_link}
              class="group inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-300 active:scale-95"
              classList={{
                "border-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300": isPrUrlCopied(),
              }}
            >
              <Show when={isPrUrlCopied()} fallback={<i class="fa-regular fa-copy text-[11px]" />}>
                <i class="fa-solid fa-check text-[11px]" />
              </Show>
              <span class="hidden xl:inline">{isPrUrlCopied() ? t('pr').pr_url_copied : t('pr').copy_link}</span>
            </button>
            <Switch>
              <Match when={details()?.mergeable === 'CONFLICTING'}>
                <div class="flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-md">
                  <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                  <span class="text-[10px] font-bold text-red-500 uppercase tracking-tight">
                    Existem conflitos que devem ser resolvidos
                  </span>
                  <button
                    onClick={() => setShowConflictResolver(true)}
                    class="bg-red-500 text-white px-3 py-1 rounded text-[9px] font-black uppercase hover:bg-red-600 transition-all"
                  >
                    {t('merge').resolve_conflicts}
                  </button>
                  <button
                    onClick={openProviderPage}
                    class="border border-red-500/40 text-red-500 px-3 py-1 rounded text-[9px] font-black uppercase hover:bg-red-500/10 transition-all"
                  >
                    {t('merge').open_provider_conflicts}
                  </button>
                </div>
              </Match>
              
              <Match when={details()?.mergeable === 'MERGEABLE' && props.pr.state === 'OPEN'}>
                <div class="flex items-center gap-2">
                  {/* Botão de Aprovar existente */}
                  <button 
                    onClick={handleApprove}
                    disabled={isApproving() || isMerging()}
                    class={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all border dark:border-gray-700
                      ${isApproving() 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95'
                      }`}
                  >
                    <Show when={isApproving()} fallback={<><i class="fa-solid fa-check"></i> {t('pr').approve}</>}>
                      <i class="fa-solid fa-circle-notch animate-spin"></i> {t('pr').approving}
                    </Show>
                  </button>

                  {/* NOVO: Botão de Merge */}
                  <button 
                    onClick={() => setShowMergeConfirmation(true)}
                    disabled={isMerging() || isApproving()}
                    class={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all shadow-lg
                      ${isMerging() 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20 active:scale-95'
                      }`}
                  >
                    <Show when={isMerging()} fallback={<><i class="fa-solid fa-code-merge"></i> {t('pr').merge_pull_request}</>}>
                      <i class="fa-solid fa-circle-notch animate-spin"></i> {t('loading').merging}
                    </Show>
                  </button>
                </div>
              </Match>
            </Switch>
          </div>
        </div>
        
        <div class="flex items-center gap-3 mt-4">
          <PRStatusBadge state={props.pr.state} variant="badge" />
          <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-gray-300 dark:border-gray-600">
            <img src={props.pr.author?.avatarUrl} alt={props.pr.author?.login} />
          </div>
          <div class="text-sm">
            <span class="font-bold text-blue-500 dark:text-blue-400">{props.pr.headRefName}</span>
            <span class="text-gray-500 mx-2">→</span>
            <span class="font-mono text-blue-500 dark:text-blue-400">{props.pr.baseRefName}</span><br />
            <span class="font-bold text-gray-900 dark:text-white">{props.pr.author?.login}</span>
            <span class="text-gray-400 uppercase ml-3 text-[9px] font-black italic">{getRelativeTime(props.pr.createdAt, t, locale())}</span>
          </div>
        </div>
      </header>

      <div class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div class="h-full flex flex-col">
            
            {/* NAVEGAÇÃO DE ABAS */}
            <nav class="flex gap-6 border border-gray-100 dark:border-gray-700 rounded-t-xl px-4 bg-gray-300 dark:bg-gray-900">
              {/* Adicione os parênteses em tabs() aqui */}
              <For each={tabs()}>
                {(tab) => (
                  <button 
                    onClick={() => setActiveTab(tab.id)}
                    class={`pb-3 pt-3 px-4 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                      activeTab() === tab.id
                      ? 'bg-gray-200 dark:bg-gray-700 dark:text-white' 
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                  >
                    <i class={`${tab.icon} text-xs ${activeTab() === tab.id ? 'text-white' : 'opacity-50'}`}></i>
                    {tab.label}
                  </button>
                )}
              </For>
            </nav>

            {/* RENDERIZAÇÃO CONDICIONAL DO CONTEÚDO */}
            <Switch>
              {/* ABA: VISÃO GERAL */}
              <Match when={activeTab() === 'overview'}>
                  <PRTimelineView 
                    owner={props.owner}
                    project={props.project}
                    repo={props.repo.name}
                    pr={props.pr}
                    provider={props.provider}
                    details={details()}
                    currentUserAvatar={props.pr.author?.avatarUrl}
                    selectCommit={selectCommit}
                    openUserProfile={openUserProfile}
                />
              </Match>

              {/* OUTRAS ABAS */}
              <Match when={activeTab() === 'files'}>
                <PRFilesTab 
                    owner={props.owner}
                    project={props.project}
                    repoName={props.repo.name}
                    prNumber={props.pr.number}
                    provider={props.provider}
                />
              </Match>
              <Match when={activeTab() === 'commits'}>
                <PRCommitsView 
                    owner={props.owner}
                    project={props.project}
                    repoName={props.repo.name}
                    prNumber={props.pr.number}
                    provider={props.provider}
                    selectCommit={selectCommit}
                />
              </Match>
              <Match when={activeTab() === 'checks'}>
                <PRChecksView
                    owner={props.owner}
                    project={props.project}
                    repoName={props.repo.name}
                    prNumber={props.pr.number}
                    provider={props.provider}
                />
              </Match>
            </Switch>
          </div>
        </div>

        {/* SIDEBAR DE METADADOS */}
        <aside class="container-branch-list w-72 ml-2 p-4 space-y-10">
          <div>
            <div class="flex justify-between items-center mb-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <span>{t('pr').reviewers}</span>
              <i class="fa-solid fa-gear hover:text-blue-500 cursor-pointer transition-colors"></i>
            </div>
            
            <div class="space-y-5">
              <For each={reviewersList()}>
                {(reviewer) => (
                  <div class="flex items-center justify-between group">
                    <div class="flex items-center gap-3">
                      <div class="relative">
                        <img 
                          src={reviewer.avatarUrl} 
                          class="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700" 
                        />
                        {/* Indicador de status visual sobre o avatar ou ao lado */}
                      </div>
                      <div class="flex flex-col">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200">
                          {reviewer.name || reviewer.login}
                        </span>
                        <span class="text-[9px] text-gray-500 uppercase font-black tracking-tighter">
                          {reviewer.state.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Ícones de Status Dinâmicos */}
                    <Switch>
                      <Match when={reviewer.state === 'APPROVED'}>
                        <i class="fa-solid fa-circle-check text-green-500 text-sm shadow-[0_0_8px_rgba(34,197,94,0.4)]"></i>
                      </Match>
                      <Match when={reviewer.state === 'CHANGES_REQUESTED'}>
                        <i class="fa-solid fa-circle-exclamation text-red-500 text-sm"></i>
                      </Match>
                      <Match when={reviewer.state === 'PENDING'}>
                        <div class="flex gap-1 items-center">
                          <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                        </div>
                      </Match>
                      <Match when={reviewer.state === 'COMMENTED'}>
                        <i class="fa-solid fa-comment-dots text-gray-400 text-sm"></i>
                      </Match>
                    </Switch>
                  </div>
                )}
              </For>
              
              <Show when={reviewersList().length === 0}>
                <div class="text-[10px] text-gray-500 italic">{t('pr').no_reviewers}</div>
              </Show>
            </div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <span>{t('pr').participants}</span>
            </div>
            <div class="flex flex-col flex-wrap gap-2">
              <For each={details()?.participants?.nodes}>
                {(p: any) => (
                  <div class="flex items-center gap-3 hover:text-blue-500 transition-colors cursor-pointer hover:underline" 
                       onClick={() => openUserProfile(p.name, p.email, p.login)}>
                    <img class="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-gray-600 
                          hover:scale-110 transition-transform" 
                          src={p.avatarUrl} title={p.login} 
                    />
                    <span>{p.name}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </aside>
      </div>
      <Dialog
        open={showMergeConfirmation()}
        title={t('pr').merge_pull_request}
        icon="fa-solid fa-code-merge"
        iconColor="text-purple-600 dark:text-purple-300"
        onClose={() => setShowMergeConfirmation(false)}
        width="min(460px, 92vw)"
      >
        <div class="space-y-4 text-sm">
          <p>Confirma o merge deste Pull Request em <strong>{props.pr.baseRefName}</strong>?</p>
          <div class="flex justify-end gap-2">
            <button class="px-3 py-2 rounded-md text-xs bg-gray-200 dark:bg-gray-700" onClick={() => setShowMergeConfirmation(false)}>{t('common').cancel}</button>
            <button class="px-3 py-2 rounded-md text-xs bg-purple-600 text-white" onClick={handleMerge}>{t('pr').merge_pull_request}</button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={showConflictResolver()}
        title={t('merge').resolve_conflicts}
        icon="fa-solid fa-code-branch"
        iconColor="text-amber-600 dark:text-amber-300"
        onClose={() => setShowConflictResolver(false)}
        bodyClass="p-0"
        width="min(1400px, 96vw)"
        height="min(900px, 94vh)"
      >
        <PRConflictResolver
          repoPath={props.repo.path}
          sourceBranch={details()?.headRefName || props.pr.headRefName}
          targetBranch={details()?.baseRefName || props.pr.baseRefName}
          expectedHeadSha={details()?.headRefOid || props.pr.headRefOid}
          provider={props.provider}
          webUrl={details()?.url || props.pr.url || props.remoteUrl}
          onClose={() => setShowConflictResolver(false)}
          onComplete={() => {
            setShowConflictResolver(false);
            refetch();
            props.onMergeSuccess(props.pr.number);
          }}
        />
      </Dialog>
      <Dialog open={showModalCommitDetails()}
              title={t('commits').details}
              icon="fa-solid fa-code-commit"
              iconColor="text-purple-600 dark:text-purple-300"
              onClose={() => setModalCommitDetails(false)}
              bodyClass="p-0 h-full"
              width={'calc(100vw - 40px)'}
              height={'calc(100vh - 100px)'}>
        <CommitDetails commit={selectedCommit()} repo={props.repo} branch={""} openParent={false} openProfile={true} selectCommit={selectCommit} />
      </Dialog>
      <Show when={modalUserProfileOpen()}>
        <Dialog
            open={modalUserProfileOpen()}
            onClose={() => {
              setModalUserProfileOpen(false);
              setSelectedUser({ name: "", email: "" });
            }}
            title={t('auth').user_profile}
            icon="fa-solid fa-user"
            iconColor="text-indigo-600 dark:text-indigo-300"
            width={"90vw"}
        >
          <UserProfileDialog 
            repo={props.repo} 
            branch={props.branch || ""}
            email={selectedUser()?.email || ""}
            fallbackName={formatContributorName(selectedUser()?.name) || "Usuário Desconhecido"} 
            open={modalUserProfileOpen()}
            onClose={() => {
              setModalUserProfileOpen(false);
              setSelectedUser({ name: "", email: "" });
            }}
          />
        </Dialog>
      </Show>
    </div>
  );
}