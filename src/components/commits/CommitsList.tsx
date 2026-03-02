import { createEffect, createSignal, createMemo, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getCommitDetails, getCommits } from "../../services/gitService";
import { formatDate } from "../../utils/date";
import { CommitDetails } from "./CommitDetails";

export default function CommitsList(props: { repo: Repo; branch?: string, class?: string }) {
  const [commits, setCommits] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [commitDetailsHeight, setCommitDetailsHeight] = createSignal(250);
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

  const paginatedCommits = createMemo(() => {
    const start = (currentPage() - 1) * itemsPerPage;
    return filteredCommits().slice(start, start + itemsPerPage);
  });

  const totalPages = createMemo(() => Math.ceil(filteredCommits().length / itemsPerPage));

  // Reset de página ao pesquisar
  createEffect(() => {
    searchTerm(); 
    setCurrentPage(1);
  });

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
  }

  createEffect(() => {
    if (!props.repo.path || !props.branch) return;
    const branchName = props.branch.replace("* ", "");
    
    setLoading(true);
    getCommits(props.repo.path, branchName)
      .then(res => {
        setCommits(res);
        setSelectedCommit(null);
        setCurrentPage(1);
      })
      .finally(() => setLoading(false));
  });

  // Handlers de redimensionamento (mantidos)
  function onMouseMove(e: MouseEvent) {
    if (resizing()) {
      const newHeight = window.innerHeight - e.clientY - 20;
      setCommitDetailsHeight(Math.max(150, newHeight));
    }
  }

  return (
    <div class="flex-1 flex flex-col h-full overflow-hidden" 
         onMouseMove={onMouseMove} onMouseUp={() => setResizing(false)} onMouseLeave={() => setResizing(false)}>
      
      {/* Header com Busca e Paginação */}
      <div class="p-2 border-b border-gray-200 dark:border-gray-800 flex flex-col gap-2 bg-gray-50 dark:bg-gray-950">
        <div class="flex gap-2 items-center">
          <input 
            type="text"
            placeholder="Filtrar commits (mensagem, hash, autor)..."
            class="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-1 ring-blue-500"
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
          />

          {/* Filtro de Data */}
          <div class="flex items-center gap-1">
            <input 
              type="date"
              class="p-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 outline-none"
              value={startDate()}
              onChange={(e) => {
                setStartDate(e.currentTarget.value);
                e.currentTarget.blur();
              }}
            />
            <span class="text-gray-400">até</span>
            <input 
              type="date"
              class="p-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 outline-none"
              value={endDate()}
              onChange={(e) => {
                setEndDate(e.currentTarget.value);
                e.currentTarget.blur();
              }}
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
        
        <div class="flex justify-between items-center text-xs">
          <span class="text-gray-500">Mostrando {paginatedCommits().length} de {filteredCommits().length}</span>
          <div class="flex gap-2 items-center">
            <button 
              disabled={currentPage() === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              class="px-2 py-1 bg-gray-200 dark:bg-gray-800 rounded disabled:opacity-30"
            > Anterior </button>
            <span>{currentPage()} / {totalPages() || 1}</span>
            <button 
              disabled={currentPage() >= totalPages()}
              onClick={() => setCurrentPage(p => p + 1)}
              class="px-2 py-1 bg-gray-200 dark:bg-gray-800 rounded disabled:opacity-30"
            > Próximo </button>
          </div>
        </div>
      </div>

      {/* Lista de Commits */}
      <div class="flex-1 overflow-auto">
        <div style={{"height": "100px"}}>
          <Show when={!loading()} fallback={<div class="p-4 text-center">Carregando...</div>}>
            <For each={paginatedCommits()}>
              {(c) => (
                <div
                  class={`flex items-center border-b border-gray-200 p-2 cursor-pointer dark:border-gray-900  ${
                    selectedCommit()?.hash === c.hash ? "bg-blue-400 dark:text-black" : ""
                  }`}
                  onClick={() => selectCommit(c.hash)}
                >
                  <div class="text-sm font-mono text-gray-500">{c.hash.slice(0, 7)}</div>
                  <div class="font-semibold px-2 flex-1 truncate">{c.message}</div>
                  <div class="text-xs text-gray-500 ml-auto whitespace-nowrap">{c.author}</div>
                  <div class="px-2 text-xs">{formatDate(c.date)}</div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Barra de resize */}
      <div class="h-1 cursor-row-resize bg-gray-200 hover:bg-gray-400 dark:bg-gray-900" onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}></div>
      
      {/* Detalhes */}
      <div style={{ height: `${commitDetailsHeight()}px`, "min-height": "100px" }} class="overflow-auto">
        <CommitDetails commit={selectedCommit()} />
      </div>
    </div>
  );
}