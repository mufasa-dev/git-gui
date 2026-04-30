import { createResource, createSignal, For, Show, createMemo } from "solid-js";
import { githubService } from "../../services/github";
import PRDetailView from "./PRDetailView";
import { getRelativeTime } from "../../utils/date";
import { Repo } from "../../models/Repo.model";
import CommitMessage from "../ui/CommitMessage";
import PRStatusBadge from "./PRStatusBadge";
import { useApp } from "../../context/AppContext";

export default function PullRequestsPage(props: { repo: Repo, username: string, branch?: string }) {
  const [filter, setFilter] = createSignal("OPEN");
  const [searchTerm, setSearchTerm] = createSignal("");
  const [selectedPR, setSelectedPR] = createSignal<any>(null);
  const { t, locale } = useApp();

  // Resize logic
  const [sidebarWidth, setSidebarWidth] = createSignal(350);
  const [isResizing, setIsResizing] = createSignal(false);

  const [prs] = createResource(
    () => ({ owner: props.username, name: props.repo.name, state: filter() }),
    async (params) => {
      if (!params.name) return [];
      return await githubService.getRepoPullRequests(params.owner, params.name, params.state);
    }
  );

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

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 overflow-hidden"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.max(280, Math.min(600, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* SIDEBAR */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-900 height-container"  style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list p-0 flex flex-col h-full">
          <header class="p-4 border-b dark:border-gray-700/50 space-y-4">
            <div class="flex bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg border dark:border-gray-700">
              <button onClick={() => setFilter("OPEN")} class={`flex-1 py-1 text-[9px] font-black uppercase rounded-md ${filter() === 'OPEN' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{t('pr').open}</button>
              <button onClick={() => setFilter("MERGED")} class={`flex-1 py-1 text-[9px] font-black uppercase rounded-md ${filter() === 'MERGED' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{t('pr').merged}</button>
            </div>

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
                <div class="w-100 text-center">
                  <i class="fa-solid fa-spinner fa-spin text-blue-500"></i>
                </div>
              }
            >
              <For each={filteredPRList()}>
                {(pr) => (
                  <div class={`flex items-center border rounded-xl p-2 mb-2 transition-colors cursor-pointer
                              ${selectedPR()?.number === pr.number ? 'bg-blue-500/10 border-blue-500/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      onClick={() => setSelectedPR(pr)}>
                    <img src={pr.author.avatarUrl} alt={pr.author.login} class="w-16 h-16 rounded-full border-2 border-gray-300 dark:border-gray-700 mx-3" />
                    <div 
                      onClick={() => setSelectedPR(pr)}
                      class={`p-1 rounded-xl cursor-pointer transition-all`}
                    >
                      <h4 class={`text-xs font-bold leading-tight mb-1 ${selectedPR()?.number === pr.number ? 'text-blue-500' : 'dark:text-gray-200'}`}>
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

      {/* PAINEL DE DETALHES (Ocupa o resto) */}
      <div class="flex-1 flex flex-col overflow-hidden pt-2 pr-2 height-container">
        <div class="flex-1 flex flex-col overflow-hidden">
          <div class="flex-1 p-0 flex flex-col mb-2 overflow-hidden">
            <Show 
              when={selectedPR()} 
            >
              {/* Aqui entra o componente de detalhes */}
              <PRDetailView 
                pr={selectedPR()} 
                owner={props.username} 
                repo={props.repo} 
                branch={props.branch}
              />
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}