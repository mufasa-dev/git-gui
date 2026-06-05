import { createResource, createSignal, For, Show, createMemo, createEffect } from "solid-js";
import { githubService } from "../../services/github";
import PRDetailView from "./PRDetailView";
import { getRelativeTime } from "../../utils/date";
import { Repo } from "../../models/Repo.model";
import CommitMessage from "../ui/CommitMessage";
import PRStatusBadge from "./PRStatusBadge";
import { useApp } from "../../context/AppContext";
import { GitProvider } from "../../utils/gitProvider";
import { azureService } from "../../services/azure";
import AuthenticatedAvatar from "./AuthenticatedAvatar";
import CreatePRDialog from "./CreatePRDialog";

export default function PullRequestsPage(props: { repo: Repo,  branch?: string, provider: GitProvider, remoteUrl: string }) {
  const [filter, setFilter] = createSignal("OPEN");
  const [searchTerm, setSearchTerm] = createSignal("");
  const [selectedPR, setSelectedPR] = createSignal<any>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = createSignal(false);
  const { t, locale } = useApp();

  // Resize logic
  const [sidebarWidth, setSidebarWidth] = createSignal(350);
  const [isResizing, setIsResizing] = createSignal(false);

  // Memoizador para extrair o Owner/Organização direto da URL remota
  const repoOwner = createMemo(() => {
    const url = props.remoteUrl;
    if (!url) return "";

    try {
      if (url.includes("dev.azure.com/")) {
        return url.split("dev.azure.com/")[1]?.split("/")[0] || "";
      }
      if (url.includes(".visualstudio.com/")) {
        return url.split(".visualstudio.com/")[0].replace("https://", "").split("@").pop() || "";
      }
      if (url.includes("github.com/")) {
        return url.split("github.com/")[1]?.split("/")[0] || "";
      }
    } catch (e) {
      console.error("Erro ao fazer o parse da URL remota:", e);
    }
    return "";
  });

  // O Resource unificado
  const [prs, { refetch }] = createResource(
    () => ({ 
      owner: repoOwner(), 
      name: props.repo?.name, 
      state: filter(), 
      currentProvider: props.provider 
    }),
    async (params) => {
      if (!params.name || !params.owner) return [];

      if (params.currentProvider === 'azure') {
        return await azureService.getRepoPullRequests(params.owner, params.name, params.state);
      }
      
      if (params.currentProvider === 'github') {
        const stateMapping = params.state === 'ABANDONED' ? 'CLOSED' : params.state;
        return await githubService.getRepoPullRequests(params.owner, params.name, stateMapping);
      }
      
      return [];
    }
  );

  createEffect(() => {
    if (props.repo?.path) {
      setSelectedPR(null);
      setSearchTerm("");
    }
  });

  // Filtro de busca local
  const filteredPRList = createMemo(() => {
    const list = prs() || [];
    const term = searchTerm().toLowerCase();
    if (!term) return list;
    return list.filter((pr: any) => 
      pr.title.toLowerCase().includes(term) || 
      pr.number.toString().includes(term)
    );
  });

  const repoBranches = createMemo(() => {
    return props.repo.branches.map(b => b.name);
  });

  const handleCreatePRSubmit = async (data: any) => {
    try {
      // Executa a chamada na service correspondente (Azure ou GitHub)
      console.log("Enviando dados para criação do PR:", data);
      
      // Recarrega a lista após criar
      refetch();
    } catch (error) {
      console.error("Falha ao criar PR:", error);
    }
  };

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 overflow-hidden"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.max(280, Math.min(600, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* SIDEBAR */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-800 height-container"  style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list p-0 flex flex-col h-full">
          <header class="p-4 border-b dark:border-gray-700/50 space-y-3">
            
            {/* Abas de Filtros */}
            <div class="flex bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg border dark:border-gray-700">
              <button 
                onClick={() => setFilter("OPEN")} 
                class={`flex-1 py-1 text-[9px] font-black uppercase rounded-md transition-all ${filter() === 'OPEN' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                {t('pr').open}
              </button>
              
              <button 
                onClick={() => setFilter("MERGED")} 
                class={`flex-1 py-1 text-[9px] font-black uppercase rounded-md transition-all ${filter() === 'MERGED' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                {t('pr').merged}
              </button>

              <button 
                onClick={() => setFilter("ABANDONED")} 
                class={`flex-1 py-1 text-[9px] font-black uppercase rounded-md transition-all ${filter() === 'ABANDONED' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                {props.provider === 'azure' ? 'Abandoned' : 'Closed'}
              </button>
            </div>

            {/* 🎯 BOTÃO CONDICIONAL: Aparece apenas se estiver na aba ativo ("OPEN") */}
            <Show when={filter() === "OPEN"}>
              <button
                onClick={() => setIsCreateDialogOpen(true)}
                class="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <i class="fa-solid fa-plus text-[10px]"></i>
                New Pull Request
              </button>
            </Show>

            {/* Barra de Busca */}
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]"></i>
              <input 
                type="text"
                placeholder={t('pr').search_pull_requests + '...'}
                onInput={(e) => setSearchTerm(e.currentTarget.value)}
                class="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 transition-colors dark:text-gray-200"
              />
            </div>
          </header>

          <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
            <Show 
              when={!prs.loading} 
              fallback={
                <div class="w-full text-center py-8">
                  <i class="fa-solid fa-spinner fa-spin text-blue-500"></i>
                </div>
              }
            >
              <For 
                each={filteredPRList()}
                fallback={
                  <div class="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-xl m-2">
                    <i class="fa-solid fa-code-pull-request text-gray-400 dark:text-gray-600 text-2xl mb-2"></i>
                    <p class="text-xs font-bold text-gray-500 dark:text-gray-400">No Pull Requests found</p>
                    <p class="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">There are no requests matching this status filter or search parameters.</p>
                  </div>
                }
              >
                {(pr) => (
                  <div class={`flex items-center border rounded-xl p-2 mb-2 transition-colors cursor-pointer
                              ${selectedPR()?.number === pr.number ? 'bg-blue-500/10 border-blue-500/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      onClick={() => setSelectedPR(pr)}>
                    <AuthenticatedAvatar 
                      src={pr.author.avatarUrl} 
                      alt={pr.author.login}
                      email={pr.author.login || ""}
                      fallbackName={pr.author.name || pr.author.login}
                      class="w-16 h-16 rounded-full border-2 border-gray-300 dark:border-gray-700 mx-3" 
                    />
                    <div class="p-1 rounded-xl flex-1 min-w-0">
                      <h4 class={`text-xs font-bold leading-tight mb-1 truncate ${selectedPR()?.number === pr.number ? 'text-blue-500' : 'dark:text-gray-200'}`}>
                        <CommitMessage message={pr.title} />
                      </h4>
                      
                      <div class="text-[10px] text-gray-500 font-bold uppercase tracking-tight mb-2">
                        #{pr.number} • {t('pr').by} {pr.author.login}
                      </div>

                      <div class="flex items-center gap-3 text-[9px] font-black uppercase">
                        <PRStatusBadge state={pr.state} variant="dot" />

                        {/* Comentários */}
                        <span class="text-gray-400 flex items-center gap-1">
                          <i class="fa-regular fa-comment text-[10px]"></i> {pr.comments?.totalCount || 0}
                        </span>

                        {/* Tempo */}
                        <span class="text-gray-400 flex items-center gap-1 ml-auto font-mono">
                          <i class="fa-regular fa-clock text-[10px]"></i> {getRelativeTime(pr.createdAt, t, locale())}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)}></div>

      {/* PAINEL DE DETALHES */}
      <div class="flex-1 flex flex-col overflow-hidden pt-2 pr-2 height-container">
        <div class="flex-1 flex flex-col overflow-hidden">
          <div class="flex-1 p-0 flex flex-col mb-2 overflow-hidden">
            <Show 
              when={selectedPR()}
              fallback={
                <div class="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-zinc-600 font-medium text-xs">
                  <i class="fa-solid fa-sidebar text-3xl mb-3 opacity-50"></i>
                  Select a pull request from the list to view details
                </div>
              }
            >
              <PRDetailView 
                pr={selectedPR()} 
                owner={repoOwner()} 
                repo={props.repo} 
                branch={props.branch}
                provider={props.provider}
                onMergeSuccess={(updatedPrNumber) => {
                  refetch();
                  setSelectedPR(prev => prev && prev.number === updatedPrNumber ? { ...prev, state: "MERGED" } : prev);
                }}
                onAbandonSuccess={(updatedPrNumber) => {
                  refetch();
                  setSelectedPR(prev => prev && prev.number === updatedPrNumber ? { ...prev, state: "ABANDONED" } : prev);
                }}
                onReactivateSuccess={(updatedPrNumber) => {
                  refetch();
                  setSelectedPR(prev => prev && prev.number === updatedPrNumber ? { ...prev, state: "OPEN" } : prev);
                }}
              />
            </Show>
          </div>
        </div>
      </div>

      <Show when={isCreateDialogOpen()}>
        <CreatePRDialog 
          isOpen={isCreateDialogOpen()} 
          onClose={() => setIsCreateDialogOpen(false)} 
          branches={repoBranches()}
          provider={props.provider}
          org={repoOwner()}
          repo={props.repo.name}
          currentBranch={props.branch || ""}
          onCreatePR={handleCreatePRSubmit}
        />
      </Show>
    </div>
  );
}