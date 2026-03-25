import { createEffect, createSignal, createMemo, For, Show, on, onCleanup } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getCommitDetails, getCommits } from "../../services/gitService";
import { formatRelativeDate } from "../../utils/date";
import { CommitDetails } from "./CommitDetails";
import { datepicker } from "../../directives/datepicker";
import { notify } from "../../utils/notifications";

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      datepicker: any;
    }
  }
}
let isFetchingCommits = false;

export default function CommitsList(props: { repo: Repo; branch?: string, class?: string }) {
  const [commits, setCommits] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [commitDetailsHeight, setCommitDetailsHeight] = createSignal(300);
  const [resizing, setResizing] = createSignal(false);
  const [startDate, setStartDate] = createSignal("");
  const [endDate, setEndDate] = createSignal("");
  
  // Estados para Paginação e Filtro
  const [searchTerm, setSearchTerm] = createSignal("");
  const [currentPage, setCurrentPage] = createSignal(1);
  const itemsPerPage = 40;

  const filteredCommits = createMemo(() => {
    const term = searchTerm().toLowerCase();
    const start = startDate() ? new Date(startDate()) : null;
    const end = endDate() ? new Date(endDate()) : null;

    return commits().filter(c => {
      // 1. Filtro de Texto
      const matchesText = !term || 
        c.message.toLowerCase().includes(term) || 
        c.hash.toLowerCase().includes(term) ||
        c.author.toLowerCase().includes(term);

      // 2. Filtro de Data
      const commitDate = new Date(c.date);
      let matchesDate = true;
      
      if (start) {
        matchesDate = matchesDate && commitDate >= start;
      }
      if (end) {
        // Adicionamos 23:59:59 para garantir que pegue o dia final inteiro
        const endWithTime = new Date(end);
        endWithTime.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && commitDate <= endWithTime;
      }

      return matchesText && matchesDate;
    });
  });

  const loadCommits = async (isNewBranch: boolean) => {
    if (!props.repo.path || !props.branch || isFetchingCommits) return;
    
    isFetchingCommits = true;
    if (isNewBranch) setLoading(true);

    try {
      const branchName = props.branch.replace("* ", "");
      const res = await getCommits(props.repo.path, branchName);
      
      if (JSON.stringify(res) !== JSON.stringify(commits())) {
        setCommits(res);
      }

      if (selectedCommit()) {
        const exists = res.find(c => c.hash === selectedCommit().hash);
        if (!exists && isNewBranch) {
          setSelectedCommit(null);
        }
      }
    } catch(e) {
      const errorMessage = typeof e === 'string' ? e : String(e);
      notify.error('Erro ao carregar commits', errorMessage);
    } finally {
      setLoading(false);
      isFetchingCommits = false;
    }
  };

  const paginatedCommits = createMemo(() => {
    const start = (currentPage() - 1) * itemsPerPage;
    return filteredCommits().slice(start, start + itemsPerPage);
  });

  const totalPages = createMemo(() => Math.ceil(filteredCommits().length / itemsPerPage));

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
  }

  createEffect(on(() => [props.repo.path, props.branch], ([path, branch], prev) => {
    const isNewRepoOrBranch = !prev || path !== prev[0] || branch !== prev[1];
    
    if (isNewRepoOrBranch) {
       setCurrentPage(1);
       setSelectedCommit(null);
       loadCommits(true);
    } else {
       loadCommits(false);
    }
  }));

  const handleFocus = () => {
    if (document.visibilityState === "visible") {
      loadCommits(false);
    }
  };

  window.addEventListener("focus", handleFocus);
  onCleanup(() => window.removeEventListener("focus", handleFocus));

  function onMouseMove(e: MouseEvent) {
    if (resizing()) {
      const newHeight = window.innerHeight - e.clientY - 20;
      setCommitDetailsHeight(Math.max(150, newHeight));
    }
  }

  return (
    <div class="flex-1 flex flex-col overflow-hidden pt-2 pb-4 pr-2 pl-1"  style={{"height": "calc(100vh - 101px)"}} 
         onMouseMove={onMouseMove} onMouseUp={() => setResizing(false)} onMouseLeave={() => setResizing(false)}>
      <div class="container-branch-list flex-1 overflow-auto mb-1" style={{"height": "100px"}}>
        {/* Header com Busca e Paginação */}
        <div class="p-1 flex flex-col gap-2">
          <div class="flex gap-2 items-center">
            <input 
              type="text"
              placeholder="Filtrar commits (mensagem, hash, autor)..."
              class="w-full p-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-1 ring-blue-500"
              value={searchTerm()}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
            />

            {/* Filtro de Data */}
            <div class="flex items-center gap-1">
              <input 
                use:datepicker={{ value: startDate, onChange: setStartDate }}
                placeholder="Início"
                class="p-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 outline-none w-28"
              />
              <span class="text-gray-400">até</span>
              <input 
                use:datepicker={{ value: endDate, onChange: setEndDate }}
                placeholder="Fim"
                class="p-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 outline-none w-28"
              />
              
              {/* Botão de Limpar (Opcional mas útil) */}
              <Show when={startDate() || endDate()}>
                <button 
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  class="p-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded"
                  title="Limpar datas"
                > ✕ </button>
              </Show>
            </div>
          </div>
          
          <div class="flex items-center text-xs">
            <b class="text-green-600">
              <i class="fas fa-code-branch" />{props.branch}:
            </b>
            <span class="text-gray-500 ml-2">Mostrando {paginatedCommits().length} de {filteredCommits().length}</span>
            <div class="flex gap-2 items-center ml-auto">
              <button 
                disabled={currentPage() === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                class="px-4 py-1 bg-gray-300 dark:bg-gray-900 rounded-full disabled:opacity-30"
              > Anterior </button>
              <span>{currentPage()} / {totalPages() || 1}</span>
              <button 
                disabled={currentPage() >= totalPages()}
                onClick={() => setCurrentPage(p => p + 1)}
                class="px-4 py-1 bg-gray-300 dark:bg-gray-900 rounded-full disabled:opacity-30"
              > Próximo </button>
            </div>
          </div>
        </div>

        {/* Lista de Commits */}
        <div class="flex-1 overflow-auto">
          <div>
            <Show when={!loading()} fallback={<div class="p-4 text-center">Carregando...</div>}>
              <For each={paginatedCommits()}>
                {(c) => (
                  <div
                    class={`cm-commit-item ${
                      selectedCommit()?.hash === c.hash ? "selected" : ""
                    }`}
                    onClick={() => selectCommit(c.hash)}
                  >
                    <div class="text-sm font-mono opacity-80">{c.hash.slice(0, 7)}</div>
                    <div class="font-semibold px-2 flex-1 truncate">{c.message}</div>
                    <div class="text-xs opacity-50 ml-auto whitespace-nowrap">{c.author}</div>
                    <div class="px-2 text-xs">{formatRelativeDate(c.date)}</div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>

      {/* Barra de resize */}
      <div class="h-1 cursor-row-resize bg-gray-200 hover:bg-gray-400 dark:bg-gray-900" onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}></div>
      
      {/* Detalhes */}
      <div style={{ height: `${commitDetailsHeight()}px`, "min-height": "100px" }} class="overflow-auto container-branch-list p-0 mt-1">
        <CommitDetails commit={selectedCommit()} repoPath={props.repo.path} selectCommit={selectCommit} />
      </div>
    </div>
  );
}