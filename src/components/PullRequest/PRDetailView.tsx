import { createResource, Show, For, createSignal, Switch, Match, createMemo, createEffect, onCleanup } from "solid-js";
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
import { GitProvider } from "../../utils/gitProvider";
import AzureMergeDialog from "./AzureMergeDialog";
import AuthenticatedAvatar from "./AuthenticatedAvatar";
import ConfirmModal from "../ui/ConfirmModal";

interface PRDetailViewProps {
  pr: any;
  owner: string;
  repo: Repo;
  branch?: string;
  provider: GitProvider;
  onMergeSuccess: (prNumber: number) => void;
  onAbandonSuccess: (prNumber: number) => void;
  onReactivateSuccess: (prNumber: number) => void;
}

export default function PRDetailView(props: PRDetailViewProps) {
  const [activeTab, setActiveTab] = createSignal("Visão Geral");
  const [showModalCommitDetails, setModalCommitDetails] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [modalUserProfileOpen, setModalUserProfileOpen] = createSignal(false);
  const [selectedUser, setSelectedUser] = createSignal({} as { name: string; email: string });
  const [isApproving, setIsApproving] = createSignal(false);
  const [isMerging, setIsMerging] = createSignal(false);
  const [showAzureMergeModal, setShowAzureMergeModal] = createSignal(false);
  const [showApproveMenu, setShowApproveMenu] = createSignal(false);
  const [showActionMenu, setShowActionMenu] = createSignal(false);
  const [currentFeedback, setCurrentFeedback] = createSignal('Approve');

  const [openModalConfirm, setModalConfirmOpen] = createSignal<{ id: string } | null>(null);
  const [modalConfirmTitle, setModalConfirmTitle] = createSignal<string>("");
  const [modalConfirmMessage, setModalConfirmMessage] = createSignal<string>("");
  const [modalConfirmOnExecute, setModalConfirmOnExecute] = createSignal<() => void>(() => {});
  const [modalConfirmOnCancel, setModalConfirmOnCancel] = createSignal<() => void>(() => {});
  
  const { t, locale } = useApp();
  
  const [details, { refetch }] = createResource(
    () => ({ owner: props.owner, name: props.repo.name, number: props.pr.number, provider: props.provider }),
    async (p) => {
      if (p.provider === 'azure') {
        return await azureService.getPullRequestDescription(p.owner, p.name, p.number);
      }
      return await githubService.getPullRequestDescription(p.owner, p.name, p.number);
    }
  );

  const hasPendingRequiredReviewers = () => {
    if (props.provider !== 'azure') return false;
    const reviewers = (details() as any)?.reviewers || [];
    return reviewers.some((r: any) => r.isRequired && (!r.vote || r.vote <= 0));
  };

  const closeMenus = () => {
    setShowApproveMenu(false);
    setShowActionMenu(false);
  };
  window.addEventListener('click', closeMenus);
  onCleanup(() => window.removeEventListener('click', closeMenus));

  const handleFeedbackSelect = async (type: string, e: Event) => {
    e.stopPropagation();
    setCurrentFeedback(type);
    setShowApproveMenu(false);

    // Mapeamento de pesos de voto da Azure
    let voteValue = 0; 
    if (type === 'Approve') voteValue = 10;
    if (type === 'Approve with suggestions') voteValue = 5;
    if (type === 'Wait for author') voteValue = -5;
    if (type === 'Reject') voteValue = -10;
    if (type === 'Reset feedback') voteValue = 0;

    if (props.provider === 'azure') {
      setIsApproving(true);
      try {
        await azureService.votePullRequest(props.owner, props.repo.name, props.pr.number, voteValue);
        notify.success("Sucesso", `Feedback '${type}' enviado com sucesso.`);
        refetch(); // Atualiza os revisores na barra lateral
      } catch (err) {
        // Se a API falhar, cai aqui e avisa o usuário de verdade!
        console.error(err);
        notify.error("Erro na Azure", "Não foi possível registrar seu voto.");
      } finally {
        setIsApproving(false);
      }
    }
  };

  const handleActionExecute = async (action: string, e: Event) => {
    e.stopPropagation();
    setShowActionMenu(false);

    if (action === 'Complete' || action === 'Merge') {
      handleMergeClick();
    } 
    else if (action === 'Abandon' && props.provider === 'azure') {
      setIsMerging(true);
      try {
        await azureService.abandonPullRequest(props.owner, props.repo.name, props.pr.number);
        notify.success("PR Abandonado", "O Pull Request foi fechado/abandonado.");
        
        // Dispara o callback correto que acabamos de adicionar!
        if (props.onAbandonSuccess) {
          props.onAbandonSuccess(props.pr.number);
        }
      } catch (err) {
        notify.error("Erro", "Falha ao abandonar o Pull Request.");
      } finally {
        setIsMerging(false);
      }
    } 
    else if (action === 'Draft' && props.provider === 'azure') {
      try {
        await azureService.updatePullRequestStatus(props.owner, props.repo.name, props.pr.number, true);
        notify.success("Sucesso", "O Pull Request foi movido para Draft.");
        refetch();
      } catch (err) {
        notify.error("Erro", "Não foi possível mudar para Draft.");
      }
    }
  };

  const additionsWidth = () => {
    const total = (details()?.additions || 0) + (details()?.deletions || 0);
    return total === 0 ? 50 : (details()?.additions / total) * 100;
  };

  const reviewersList = createMemo(() => {
    const data = details();
    if (!data) return [];

    if (props.provider === 'azure' && (data as any).reviewers) {
      return (data as any).reviewers;
    }

    const list: any[] = [];

    data.reviews?.nodes?.forEach((review: any) => {
      const existing = list.find(r => r.login === review.author.login);
      if (existing) {
        existing.state = review.state;
      } else {
        list.push({
          login: review.author.login,
          avatarUrl: review.author.avatarUrl,
          name: review.author.name,
          state: review.state,
        });
      }
    });

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

  const handleApprove = async (e?: Event) => {
    if (e) e.stopPropagation();
    
    setIsApproving(true);
    try {
      if (props.provider === 'azure') {
        await azureService.votePullRequest(props.owner, props.repo.name, props.pr.number, 10);
        setCurrentFeedback('Approve');
        notify.success("Sucesso", "Pull Request aprovado com sucesso na Azure!");
      } else {
        // Fluxo legado do GitHub
        const prId = props.pr.node_id || props.pr.id; 
        if (!prId) throw new Error("ID do Pull Request não encontrado.");
        await githubService.approvePullRequest(prId);
        notify.success("Sucesso", "Pull Request aprovado com sucesso no GitHub!");
      }
      refetch(); 
    } catch (err) {
      notify.error("Falha na Aprovação", String(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReactivatePR = async () => {
    setIsMerging(true);
    try {
      const success = await azureService.reactivatePullRequest(
        props.owner,
        props.repo.name,
        props.pr.number
      );

      if (success) {
        notify.success("PR Reativado", "O Pull Request voltou para o estado Ativo.");
        
        if (props.onReactivateSuccess) {
          props.onReactivateSuccess(props.pr.number);
        }
      }
    } catch (err: any) {
      notify.error("Erro", err.message || "Falha ao reativar o PR.");
    } finally {
      setIsMerging(false);
    }
  };

  const handleDeleteSourceBranch = async () => {
    const branchClean = props.pr.headRefName || props.pr.sourceRefName?.replace("refs/heads/", "");
    
    if (!confirm(`Tem certeza que deseja deletar permanentemente a branch remota ${branchClean}?`)) {
      return;
    }

    try {
      const success = await azureService.deleteRef(
        props.owner,
        props.repo.name,
        branchClean
      );

      if (success) {
        notify.success("Branch Removida", `A branch ${branchClean} foi removida da Azure DevOps.`);
      } else {
        notify.error("Erro", "Não foi possível remover a branch remota.");
      }
    } catch (err: any) {
      notify.error("Erro", err.message || "Falha ao remover a branch.");
    }
  };

  const handleMergeClick = () => {
    if (props.provider === 'azure') {
      // Em vez de mesclar direto, abre o modal estilizado
      setShowAzureMergeModal(true);
    } else {
      // Fluxo direto padrão do GitHub
      executeGitHubMerge(); 
    }
  };

  // Função chamada ao clicar em "Complete merge" dentro do Modal
  const handleConfirmAzureMerge = async (options: any) => {
    setIsMerging(true);
    try {
      const success = await azureService.mergePullRequest(
        props.owner,
        props.repo.name,
        props.pr.number,
        options
      );

      if (success) {
        notify.success(t('common').success, t('success').pr_merged);
        setShowAzureMergeModal(false);
        props.onMergeSuccess(props.pr.number);
      } else {
        notify.error("Erro", "Não foi possível completar o merge do Pull Request.");
      }
    } catch (err: any) {
      notify.error("Erro no Merge", err.message || String(err));
    } finally {
      setIsMerging(false);
    }
  };

  const executeGitHubMerge = async () => {
    const prId = props.pr.node_id || props.pr.id; 
    
    if (!prId) {
      notify.error("Erro", "ID do Pull Request não encontrado.");
      return;
    }

    setIsMerging(true);
    try {
      if (props.provider === 'github') {
        await githubService.mergePullRequest(prId);
      }

      notify.success(t('common').success, t('success').pr_merged);
      props.onMergeSuccess(props.pr.number);
    } catch (err) {
      notify.error("Falha no Merge", String(err));
    } finally {
      setIsMerging(false);
    }
  };

  const tabs = createMemo(() => {
    const allTabs = [
      { id: 'Visão Geral', label: t('pr').conversation, icon: 'fa-regular fa-comments' },
      { id: 'Files', label: t('file').files, icon: 'fa-regular fa-file-code' },
      { id: 'Commits', label: t('commits').commits, icon: 'fa-solid fa-code-commit' },
      { id: 'Checks', label: t('pr').checked, icon: 'fa-solid fa-list-check' }
    ];

    if (props.provider !== 'github') {
      return allTabs.filter(tab => tab.id !== 'Checks');
    }

    return allTabs;
  });

  createEffect(() => {
    if (props.provider !== 'github' && activeTab() === 'Checks') {
      setActiveTab("Visão Geral");
    }
  });

  return (
    <div class="flex flex-col h-full select-text transition-colors">
      
      <header class="container-branch-list p-4 mb-2 bg-white dark:bg-gray-800 rounded-t-xl border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center">
            <CommitMessage message={props.pr.title} class="text-xl" />
            <span class="text-gray-500/50 dark:text-gray-400 ml-2">#{props.pr.number}</span>
          </h1>
          
          <div class="flex items-center gap-2">
            <Switch>
              {/* 🚀 1. STATUS PRIORITÁRIO: SE FOR ABANDONADO NA AZURE, TRAVA AQUI */}
              <Match when={props.pr.state === "ABANDONED" && props.provider === "azure"}>
                <div class="flex items-center gap-1.5 relative w-full">
                  
                  {/* Botão Principal: Reactivate */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReactivatePR(); }}
                    disabled={isMerging()}
                    class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Show when={isMerging()} fallback={<i class="fa-solid fa-arrow-rotate-left"></i>}>
                      <i class="fa-solid fa-circle-notch animate-spin"></i>
                    </Show>
                    {t('pr').reactive}
                  </button>

                  {/* Botão Dropdown Secundário (Reticências) */}
                  <div class="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowActionMenu(!showActionMenu()); }}
                      class="px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors rounded-md text-xs flex items-center"
                    >
                      <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    {/* Dropdown com "Delete source branch" */}
                    <Show when={showActionMenu()}>
                      <div class="absolute right-0 top-9 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl z-50 py-1 text-xs text-gray-700 dark:text-gray-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowActionMenu(false); handleDeleteSourceBranch(); }}
                          class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-red-500 font-medium"
                        >
                          <i class="fa-regular fa-trash-can"></i>
                          Delete source branch
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              </Match>

              {/* 2. Tratamento de Conflitos (PR Ativo) */}
              <Match when={details()?.mergeable === 'CONFLICTING'}>
                <div class="flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-md">
                  <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                  <span class="text-[10px] font-bold text-red-500 uppercase tracking-tight">
                    {t('pr').has_conflicts}
                  </span>
                  <button 
                    onClick={() => setActiveTab('Files')} 
                    class="bg-red-500 text-white px-3 py-1 rounded text-[9px] font-black uppercase hover:bg-red-600 transition-all"
                  >
                    {t('merge').resolve_conflicts}
                  </button>
                </div>
              </Match>
              
              {/* 3. Fluxo de Botões Regulares (Apenas se não cair nas regras acima) */}
              <Match when={details()?.mergeable === 'MERGEABLE' || props.provider === 'azure'}>
                <div class="flex items-center gap-1.5 relative">
                  
                  {/* Seletor de Feedback/Aprovação */}
                  <div class="flex items-center rounded-md overflow-visible bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600">
                    <button 
                      onClick={(e) => handleApprove(e)}
                      disabled={isApproving() || isMerging()}
                      class="px-4 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 rounded-l-md"
                    >
                      <Show when={isApproving()} fallback={
                        <Switch fallback={<><i class="fa-regular fa-circle-check text-green-500"></i> {currentFeedback()}</>}>
                          <Match when={currentFeedback() === 'Reject'}>
                            <i class="fa-solid fa-circle-xmark text-red-500"></i> {t('pr').reject}
                          </Match>
                          <Match when={currentFeedback() === 'Wait for author'}>
                            <i class="fa-solid fa-clock text-amber-500"></i> {t('pr').wait_author}
                          </Match>
                        </Switch>
                      }>
                        <i class="fa-solid fa-circle-notch animate-spin text-gray-400"></i> {t('pr').approving}
                      </Show>
                    </button>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowApproveMenu(!showApproveMenu()); setShowActionMenu(false); }}
                      class="px-2 py-0 border-l border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors rounded-r-md"
                    >
                      <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>

                    <Show when={showApproveMenu()}>
                      <div class="absolute left-0 top-9 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl z-50 py-1 text-xs text-gray-700 dark:text-gray-200">
                        <button onClick={(e) => handleFeedbackSelect('Approve', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-circle-check text-green-500"></i> {t('pr').approve}
                        </button>
                        <button onClick={(e) => handleFeedbackSelect('Approve with suggestions', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-circle-check text-green-600/70"></i> {t('pr').approve_with_suggestions}
                        </button>
                        <button onClick={(e) => handleFeedbackSelect('Wait for author', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-clock text-amber-500"></i> {t('pr').wait_author}
                        </button>
                        <button onClick={(e) => handleFeedbackSelect('Reject', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-circle-xmark text-red-500"></i> {t('pr').reject}
                        </button>
                        <div class="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                        <button onClick={(e) => handleFeedbackSelect('Reset feedback', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-500">
                          <i class="fa-regular fa-circle text-gray-400"></i> {t('pr').reset_feedback}
                        </button>
                      </div>
                    </Show>
                  </div>

                  {/* Botão Principal de Merge / Autocomplete */}
                  <div class="flex items-center rounded-md overflow-visible bg-blue-600 text-white border border-blue-700 shadow-md">
                    <button 
                      onClick={(e) => handleActionExecute(hasPendingRequiredReviewers() ? 'Autocomplete' : 'Complete', e)}
                      disabled={isMerging() || isApproving()}
                      class="px-4 py-1.5 text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 rounded-l-md"
                    >
                      <Show when={isMerging()} fallback={
                        <Show when={hasPendingRequiredReviewers()} fallback={<><i class="fa-solid fa-code-merge"></i> {t('pr').complete}</>}>
                          <i class="fa-solid fa-bolt-lightning text-amber-300"></i> {t('pr').set_auto_complete}
                        </Show>
                      }>
                        <i class="fa-solid fa-circle-notch animate-spin"></i> {t('loading').merging}
                      </Show>
                    </button>

                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowActionMenu(!showActionMenu()); setShowApproveMenu(false); }}
                      class="px-2 py-0 border-l border-blue-700 hover:bg-blue-700 transition-colors rounded-r-md"
                    >
                      <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>

                    <Show when={showActionMenu()}>
                      <div class="absolute right-0 top-9 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl z-50 py-1 text-xs text-gray-700 dark:text-gray-200">
                        <button onClick={(e) => handleActionExecute('Complete', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-code-branch"></i> {t('pr').complete}
                        </button>
                        <button onClick={(e) => handleActionExecute('Autocomplete', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-bolt-lightning text-blue-500"></i> {t('pr').set_auto_complete}
                        </button>
                        <button onClick={(e) => handleActionExecute('Draft', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <i class="fa-solid fa-pen-to-square"></i> {t('pr').mark_draft}
                        </button>
                        <button onClick={(e) => handleActionExecute('Abandon', e)} class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-red-500">
                          <i class="fa-solid fa-trash-can"></i> {t('pr').abandon}
                        </button>
                      </div>
                    </Show>
                  </div>

                </div>
              </Match>
            </Switch>
          </div>
        </div>
        
        {/* Metadados adicionais do autor e referências */}
        <div class="flex items-center gap-3 mt-4">
          <PRStatusBadge state={props.pr.state} variant="badge" />
          <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-gray-300 dark:border-gray-600">
            <AuthenticatedAvatar 
                src={props.pr.author?.avatarUrl} 
                alt={props.pr.author?.login}
                email={props.pr.author?.login || ""}
                fallbackName={props.pr.author?.name || props.pr.author?.login}
                class="" 
              />
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
              <Match when={activeTab() === 'Visão Geral'}>
                  <PRTimelineView 
                    owner={props.owner} 
                    repo={props.repo.name} 
                    pr={props.pr}
                    provider={props.provider}
                    details={details()}
                    currentUserAvatar={props.pr.author?.avatarUrl}
                    selectCommit={selectCommit}
                    openUserProfile={openUserProfile}
                />
              </Match>

              <Match when={activeTab() === 'Files'}>
                <PRFilesTab 
                    owner={props.owner} 
                    repoName={props.repo.name} 
                    prNumber={props.pr.number}
                    provider={props.provider}
                />
              </Match>
              <Match when={activeTab() === 'Commits'}>
                <PRCommitsView 
                    owner={props.owner} 
                    repoName={props.repo.name} 
                    prNumber={props.pr.number} 
                    selectCommit={selectCommit}
                    provider={props.provider}
                />
              </Match>
              <Match when={activeTab() === 'Checks'}>
                <PRChecksView
                    owner={props.owner} 
                    repoName={props.repo.name} 
                    prNumber={props.pr.number} 
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
                        <AuthenticatedAvatar 
                          src={reviewer.avatarUrl} 
                          alt={reviewer.login}
                          email={reviewer.login || ""}
                          fallbackName={reviewer.name || reviewer.login}
                          class="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-gray-600 
                              hover:scale-110 transition-transform" 
                        />
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

          {/* Work Items */}
          <div>
              <div class="flex justify-between items-center mb-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                  <span>Work Items</span>
                  <span class="text-[9px] font-normal text-gray-500">
                      {details()?.workItems?.length || 0}
                  </span>
              </div>
              <div class="space-y-3">
                  <Show when={details()?.workItems && details()!.workItems!.length > 0}>
                      <For each={details()!.workItems}>
                          {(wi) => {
                              const [isRemoving, setIsRemoving] = createSignal(false);
                              const handleRemove = async () => {
                                  setModalConfirmOpen({ id: wi.id });
                                  setModalConfirmTitle("Remover Work Item");
                                  setModalConfirmMessage(`Deseja realmente remover o work item #${wi.id} deste Pull Request?`);
                                  setModalConfirmOnExecute(() => async () => {
                                    setIsRemoving(true);
                                    try {
                                      if (props.provider == 'azure') {
                                         const projectId = details()?.projectId;
                                        const repositoryId = details()?.repositoryId;
                                        if (!projectId || !repositoryId) {
                                          alert('IDs do projeto/repositório não disponíveis.');
                                          return;
                                        }
                                        const success = await azureService.removeWorkItemFromPR(
                                          props.owner,
                                          projectId,
                                          repositoryId,
                                          props.pr.number,
                                          wi.id
                                        );
                                        if (success) {
                                            // Atualiza a lista local (refetch)
                                            refetch();
                                        } else {
                                            notify.error('Erro', 'Erro ao remover work item.');
                                        }
                                      }
                                        
                                    } catch (e) {
                                        console.error(e);
                                        notify.error('Erro', 'Erro ao remover work item.');
                                    } finally {
                                        setIsRemoving(false);
                                    }
                                  });
                              };

                              return (
                                  <div class="flex items-center justify-between group p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                      <div class="flex-1 min-w-0">
                                          <a 
                                              href={wi.url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              class="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                                          >
                                              <i class={`fa-regular ${wi.workItemType === 'Issue' ? 'fa-circle' : wi.workItemType === 'Task' ? 'fa-check-square' : 'fa-rectangle-list'} text-gray-400 text-xs`}></i>
                                              <span class="truncate">#{wi.id} - {wi.title}</span>
                                          </a>
                                          <div class="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                                              <span class="flex items-center gap-1">
                                                  <span class={`inline-block w-1.5 h-1.5 rounded-full ${
                                                      wi.state === 'Doing' ? 'bg-blue-500' :
                                                      wi.state === 'Done' ? 'bg-green-500' :
                                                      wi.state === 'To Do' ? 'bg-gray-400' :
                                                      'bg-yellow-500'
                                                  }`}></span>
                                                  {wi.state}
                                              </span>
                                              <span class="flex items-center gap-1">
                                                  <i class="fa-regular fa-clock text-[8px]"></i>
                                                  {wi.updatedDate ? new Date(wi.updatedDate).toLocaleDateString('pt-BR', { 
                                                      day: '2-digit', 
                                                      month: 'short', 
                                                      hour: '2-digit', 
                                                      minute: '2-digit' 
                                                  }) : ''}
                                              </span>
                                              {wi.assignedTo && (
                                                  <span class="flex items-center gap-1">
                                                      <i class="fa-regular fa-user text-[8px]"></i>
                                                      {wi.assignedTo}
                                                  </span>
                                              )}
                                          </div>
                                      </div>
                                      <button
                                          onClick={handleRemove}
                                          disabled={isRemoving()}
                                          class="ml-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Remover work item do PR"
                                      >
                                          <Show when={!isRemoving()} fallback={<i class="fa-solid fa-spinner fa-spin"></i>}>
                                              <i class="fa-regular fa-circle-xmark text-base"></i>
                                          </Show>
                                      </button>
                                  </div>
                              );
                          }}
                      </For>
                  </Show>
                  <Show when={!details()?.workItems || details()!.workItems!.length === 0}>
                      <div class="text-[10px] text-gray-500 italic">Nenhum work item vinculado</div>
                  </Show>
              </div>
          </div>

          <Show when={props.provider === 'github'}>
            <div>
              <div class="flex justify-between items-center mb-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                <span>{t('pr').participants}</span>
              </div>
              <div class="flex flex-col flex-wrap gap-2">
                <For each={details()?.participants?.nodes}>
                  {(p: any) => (
                    <div class="flex items-center gap-3 hover:text-blue-500 transition-colors cursor-pointer hover:underline" 
                        onClick={() => openUserProfile(p.name, p.email, p.login)}>
                      <AuthenticatedAvatar 
                        src={p.avatarUrl} 
                        alt={p.login}
                        email={p.email || ""}
                        fallbackName={p.name || p.login}
                        class="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-gray-600 
                            hover:scale-110 transition-transform" 
                      />
                      <span>{p.name}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </aside>
      </div>

      {/* DIALOGS */}
      <Dialog open={showModalCommitDetails()}
              title={t('commits').details}
              onClose={() => setModalCommitDetails(false)}
              bodyClass="p-0 h-full"
              width={'calc(100vw - 40px)'}
              height={'calc(100vh - 100px)'}>
        <CommitDetails 
          commit={selectedCommit()}
          repoName={props.repo.name}
          repoPath={props.repo.path} 
          branch={""} openParent={false} 
          selectCommit={selectCommit}
          provider={props.provider}
          org={props.owner}
          isLogged={true}
        />
      </Dialog>
      
      <Show when={modalUserProfileOpen()}>
        <Dialog open={modalUserProfileOpen()} 
            onClose={() => {
              setModalUserProfileOpen(false);
              setSelectedUser({ name: "", email: "" });
            }} title={t('auth').user_profile} width={"90vw"}>
          <UserProfileDialog 
            repoPath={props.repo.path || ""} 
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
      <AzureMergeDialog
        open={showAzureMergeModal()}
        sourceBranch={props.pr.sourceRefName?.replace("refs/heads/", "") || "branch"}
        isMerging={isMerging()}
        onClose={() => setShowAzureMergeModal(false)}
        onConfirm={handleConfirmAzureMerge}
      />
      <Show when={openModalConfirm()}>
          <ConfirmModal
              isOpen={openModalConfirm() !== null}
              title={modalConfirmTitle()}
              message={modalConfirmMessage()}
              confirmText={t('common').delete}
              isDanger={true}
              onConfirm={() => modalConfirmOnExecute()()}
              onCancel={() => setModalConfirmOpen(null)}
          />
      </Show>
    </div>
  );
}