import { createResource, createSignal, Show, For, Switch, Match } from "solid-js";
import { azureService } from "../../services/azure";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";
import { GitProvider } from "../../utils/gitProvider";
import TaskRow from "./TaskRow";

type CardDetailViewProps = {
  cardId: string | number;
  provider: GitProvider;
  organization: string;
  repoPath: string;
  onClose: () => void;
};

export default function CardDetailView(props: CardDetailViewProps) {
  
  const [cardData] = createResource(
    () => ({ id: props.cardId, provider: props.provider }),
    async ({ id, provider }) => {
      if (provider === "github") {
        return await githubService.getUnifiedIssue(props.organization, props.repoPath, Number(id));
      } else {
        return await azureService.getUnifiedWorkItem(props.organization, props.repoPath, Number(id));
      }
    }
  );

  const [activeTab, setActiveTab] = createSignal<"details" | "history">("details");

  const [showTasks, setShowTasks] = createSignal(false);
  const [showCommits, setShowCommits] = createSignal(false);

  const [tasksDetails] = createResource(
    () => {
      const tasksReferences = cardData()?.tasksReferences;
      return showTasks() && tasksReferences && tasksReferences.length > 0 ? tasksReferences : null;
    },
    async (ids) => {
      if (!ids) return [];
      return await azureService.getTasksDetails(props.organization, props.repoPath, ids);
    }
  );

  const [commitsDetails] = createResource(
    () => {
      const commitsReferences = cardData()?.commitsReferences;
      return showCommits() && commitsReferences && commitsReferences.length > 0 ? commitsReferences : null;
    },
    async (hashes) => {
      if (!hashes) return [];
      const promises = hashes.map((hash: string) => 
        azureService.getCommitDetails(props.organization, props.repoPath, props.repoPath, hash)
      );
      return await Promise.all(promises);
    }
  );

  // Recurso acionado apenas ao entrar na aba de Histórico
  const [historyData] = createResource(
    () => activeTab() === "history" ? cardData()?.number : null,
    async (id) => await azureService.getWorkItemHistory(props.organization, props.repoPath, Number(id))
  );

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={props.onClose}>
      
      <Show when={cardData()} keyed>
        {(card: any) => (
          /* 🎯 LINHA INDICATIVA LATERAL: Injetando a borda esquerda colorida baseada no estado real (ex: border-l-4 verde/azul) */
          <div 
            class={`relative w-full h-[92vh] flex flex-col p-6 bg-gray-100 dark:bg-gray-800 rounded-xl border border-y-gray-200 border-r-gray-200 dark:border-y-gray-700/70 dark:border-r-gray-700/70 shadow-2xl overflow-hidden border-l-[6px] ${
              card.state === 'Done' || card.state === 'Completed' 
                ? 'border-l-green-500' 
                : card.state === 'Active' || card.state === 'Doing' || card.state === 'In Progress'
                ? 'border-l-blue-500' 
                : 'border-l-gray-400 dark:border-l-gray-500'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* BOTÃO FECHAR */}
            <button type="button" onClick={props.onClose} class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10 cursor-pointer">
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>

            <div class="flex flex-col h-full overflow-hidden">
              
              {/* CABEÇALHO SUPERIOR */}
              <div class="flex flex-col gap-3 border-b border-gray-200 dark:border-gray-700 pb-3 shrink-0">
                <div class="flex items-center gap-2 text-xs font-bold uppercase text-gray-400">
                  <span class="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                    {card.provider}
                  </span>
                  <span class="font-mono">#{card.number}</span>
                </div>
                
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{card.title}</h1>
                  
                  {/* 🎯 SELETOR DE ABAS (TABS STYLE AZURE) */}
                  <div class="flex bg-gray-200/60 dark:bg-gray-900/50 p-1 rounded-xl self-start lg:self-auto border border-gray-300/30">
                    <button
                      type="button"
                      onClick={() => setActiveTab("details")}
                      class={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeTab() === "details"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      <i class="fa-solid fa-circle-info"></i>
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("history")}
                      class={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeTab() === "history"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      <i class="fa-solid fa-clock-rotate-left"></i>
                      History
                    </button>
                  </div>
                </div>
                
                {/* Metadados Básicos */}
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span class={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase ${card.stateColor}`}>
                    {card.state}
                  </span>
                  <div class="flex items-center gap-1.5">
                    <Show when={card.assignee?.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-base text-gray-400"></i>}>
                      <img src={card.assignee?.avatarUrl} class="w-5 h-5 rounded-full" />
                    </Show>
                    <span class="font-semibold text-gray-700 dark:text-gray-200">{card.assignee?.name || "Sem responsável"}</span>
                  </div>
                  <span class="border-l border-gray-300 dark:border-gray-700 pl-3">Criado em {new Date(card.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* CONTEÚDO DAS ABAS (DINÂMICO) */}
              <div class="flex-1 overflow-hidden">
                
                {/* 📂 CONTAINER DA TAB 1: DETAILS PANEL */}
                <Show when={activeTab() === "details"}>
                  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full overflow-y-auto pt-4 pr-1">
                    
                    {/* COLUNA ESQUERDA: Descrição e Comentários */}
                    <div class="lg:col-span-3 flex flex-col gap-6">
                      <div class="flex flex-col gap-2">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Descrição</h3>
                        <div class="p-4 bg-white dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 rounded-xl min-h-[140px] text-gray-800 dark:text-gray-200">
                          <Show when={card.description && card.description.trim()} fallback={<p class="text-sm italic text-gray-400">Nenhuma descrição fornecida.</p>}>
                            <MarkdownViewer content={card.description} />
                          </Show>
                        </div>
                      </div>

                      <div class="flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700/70 pt-4 pb-6">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Discussão ({card.comments?.length || 0})</h3>
                        <div class="flex flex-col gap-3">
                          <For each={card.comments}>
                            {(comment: any) => (
                              <div class="flex gap-3 p-3 bg-white/60 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700/50 rounded-xl">
                                <Show when={comment.author.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-xl text-gray-400"></i>}>
                                  <img src={comment.author.avatarUrl} class="w-7 h-7 rounded-full" />
                                </Show>
                                <div class="flex flex-col gap-1 w-full">
                                  <div class="flex items-center justify-between text-xs">
                                    <span class="font-bold text-gray-700 dark:text-gray-300">{comment.author.name}</span>
                                    <span class="text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                                  </div>
                                  <div class="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                                    <MarkdownViewer content={comment.text} />
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>

                    {/* COLUNA DIREITA: Planejamento e Accordions */}
                    <div class="lg:col-span-1 flex flex-col gap-5 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white/50 dark:bg-gray-900/30 shadow-sm self-start w-full">
                      <div>
                        <h4 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Criador Original</h4>
                        <div class="flex items-center gap-2">
                          <Show when={card.author?.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-xl text-gray-400"></i>}>
                            <img src={card.author?.avatarUrl} class="w-6 h-6 rounded-full" />
                          </Show>
                          <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{card.author?.name}</span>
                        </div>
                      </div>

                      <div class="border-t border-gray-200/80 dark:border-gray-700/60 pt-3 flex flex-col gap-2.5">
                        <h5 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Planejamento</h5>
                        <div class="flex items-center justify-between text-xs">
                          <span class="text-gray-400">Priority:</span>
                          <span class="font-mono font-bold bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{card.priority ?? "—"}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                          <span class="text-gray-400">Effort / Points:</span>
                          <span class="font-semibold text-gray-800 dark:text-gray-200">{card.effort || "—"}</span>
                        </div>
                        <div class="flex flex-col gap-0.5 text-xs">
                          <span class="text-gray-400">Area Path:</span>
                          <span class="font-medium text-gray-700 dark:text-gray-300 truncate bg-gray-100/50 dark:bg-gray-800/40 p-1 rounded text-[11px]">{card.areaPath}</span>
                        </div>
                        <div class="flex flex-col gap-0.5 text-xs">
                          <span class="text-gray-400">Iteration / Sprint:</span>
                          <span class="font-medium text-gray-700 dark:text-gray-300 truncate bg-gray-100/50 dark:bg-gray-800/40 p-1 rounded text-[11px]">{card.iterationPath}</span>
                        </div>
                      </div>

                      {/* Accordions */}
                      <div class="border-t border-gray-200/80 dark:border-gray-700/60 pt-4 flex flex-col gap-2">
                        {/* Tasks */}
                        <div class="flex flex-col border border-gray-200 dark:border-gray-700/60 rounded-xl bg-white dark:bg-gray-900/40 overflow-hidden">
                          <button type="button" onClick={() => setShowTasks(!showTasks())} class="flex items-center justify-between w-full p-3 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                            <div class="flex items-center gap-1.5">
                              <i class={`fa-solid fa-chevron-right text-[10px] transition-transform ${showTasks() ? 'rotate-90' : ''}`}></i>
                              <span>Tasks ({card.tasksReferences?.length || 0})</span>
                            </div>
                            <i class="fa-solid fa-list-check opacity-60"></i>
                          </button>
                          <Show when={showTasks()}>
                            <div class="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 max-h-42 overflow-y-auto flex flex-col gap-1">
                              <Show when={!tasksDetails.loading} fallback={<div class="p-2 text-[11px] text-gray-400"><i class="fa-solid fa-circle-notch animate-spin text-blue-500"></i></div>}>
                                <For each={tasksDetails()}>
                                  {(task) => (
                                    <div class="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200/60 text-[11px]">
                                      <span class="font-mono font-bold text-gray-400">#{task.id}</span>
                                      <p class="text-gray-700 dark:text-gray-300 font-medium line-clamp-2 mt-0.5">{task.title}</p>
                                    </div>
                                  )}
                                </For>
                              </Show>
                            </div>
                          </Show>
                        </div>

                        {/* Commits */}
                        <div class="flex flex-col border border-gray-200 dark:border-gray-700/60 rounded-xl bg-white dark:bg-gray-900/40 overflow-hidden">
                          <button type="button" onClick={() => setShowCommits(!showCommits())} class="flex items-center justify-between w-full p-3 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                            <div class="flex items-center gap-1.5">
                              <i class={`fa-solid fa-chevron-right text-[10px] transition-transform ${showCommits() ? 'rotate-90' : ''}`}></i>
                              <span>Commits ({card.commitsReferences?.length || 0})</span>
                            </div>
                            <i class="fa-solid fa-code-commit rotate-90 opacity-60"></i>
                          </button>
                          <Show when={showCommits()}>
                            <div class="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 max-h-42 overflow-y-auto flex flex-col gap-1">
                              <Show when={!commitsDetails.loading} fallback={<div class="p-2 text-[11px] text-gray-400"><i class="fa-solid fa-circle-notch animate-spin text-blue-500"></i></div>}>
                                <For each={commitsDetails()}>
                                  {(commit) => (
                                    <div class="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200/60 text-[11px]">
                                      <span class="font-mono font-bold text-blue-500">{commit.id.substring(0, 7)}</span>
                                      <p class="text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{commit.message}</p>
                                    </div>
                                  )}
                                </For>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>

                  </div>
                </Show>

                {/* 📂 CONTAINER DA TAB 2: HISTORY TIMELINE PANEL */}
                <Show when={activeTab() === "history"}>
                  <div class="h-full overflow-hidden pt-2 flex flex-col">
                    
                    <Show when={!historyData.loading} fallback={
                      <div class="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2">
                        <i class="fa-solid fa-circle-notch animate-spin text-blue-500 text-lg"></i>
                        <span>Carregando histórico do Azure...</span>
                      </div>
                    }>
                      
                      {/* 🟢 CRIANDO SINAL PARA CONTROLAR A REVISÃO ATIVA NO PREVIEW DA DIREITA */}
                      {(() => {
                        const [selectedAudit, setSelectedAudit] = createSignal<any>(historyData()?.[0] || null);

                        return (
                          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full overflow-hidden">
                            
                            {/* COLUNA ESQUERDA (3 partes de 5): LISTAGEM CRONOLÓGICA LIMPA */}
                            <div class="lg:col-span-3 flex flex-col border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/20 rounded-xl overflow-y-auto p-1">
                              <div class="flex flex-col">
                                <For each={historyData()}>
                                  {(audit: any) => (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedAudit(audit)}
                                      class={`w-full flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800 text-left transition-all cursor-pointer ${
                                        selectedAudit()?.id === audit.id
                                          ? "bg-blue-50/70 dark:bg-blue-950/30 border-l-[3px] border-l-blue-500 pl-2.5"
                                          : "hover:bg-gray-50 dark:hover:bg-gray-800/40 border-l-[3px] border-l-transparent"
                                      }`}
                                    >
                                      <div class="flex items-center gap-3">
                                        <Show when={audit.avatar} fallback={<div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">{audit.user[0]}</div>}>
                                          <img src={audit.avatar} class="w-6 h-6 rounded-full" />
                                        </Show>
                                        <div class="flex flex-col gap-0.5">
                                          <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                            {audit.user} <span class="text-gray-400 font-normal">{audit.summary}</span>
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Formatação correta da Hora / Minuto sem dar quebra ou string inválida */}
                                      <div class="flex items-center gap-2 text-gray-400 text-[11px] font-mono">
                                        <Show when={audit.changes.some((c: any) => c.type === 'comment')}>
                                          <i class="fa-regular fa-comment-dots text-gray-400"></i>
                                        </Show>
                                        <Show when={audit.changes.some((c: any) => c.type.includes('link'))}>
                                          <i class="fa-solid fa-link text-gray-400"></i>
                                        </Show>
                                        <span>
                                          {new Date(audit.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                    </button>
                                  )}
                                </For>
                              </div>
                            </div>

                            {/* COLUNA DIREITA (2 partes de 5): PREVIEW DETALHADO DO LOG SELECIONADO */}
                            <div class="lg:col-span-2 flex flex-col border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 rounded-xl p-4 overflow-y-auto">
                              <Show when={selectedAudit()} fallback={
                                <div class="flex items-center justify-center h-full text-xs italic text-gray-400">
                                  Selecione uma revisão à esquerda para inspecionar os detalhes.
                                </div>
                              }>
                                {/* Cabeçalho do Bloco de Inspeção */}
                                <div class="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-3 mb-4">
                                  <Show when={selectedAudit().avatar} fallback={<i class="fa-solid fa-user-gear text-lg text-gray-400"></i>}>
                                    <img src={selectedAudit().avatar} class="w-7 h-7 rounded-full" />
                                  </Show>
                                  <div class="flex flex-col">
                                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">{selectedAudit().user}</span>
                                    <span class="text-[10px] text-gray-400 font-mono">
                                      Revisão #{selectedAudit().rev} • {new Date(selectedAudit().date).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {/* Exibição Inteligente do Conteúdo Modificado */}
                                <div class="flex flex-col gap-4">
                                  <Show when={selectedAudit().changes.length > 0} fallback={
                                    <p class="text-xs italic text-gray-400">Metadados internos de sincronização da API.</p>
                                  }>
                                    <For each={selectedAudit().changes}>
                                      {(change: any) => (
                                        <div class="flex flex-col gap-1.5">
                                          <h4 class="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                            {change.field}
                                          </h4>
                                          
                                          <Switch>
                                            {/* 1. COMENTÁRIOS */}
                                            <Match when={change.type === 'comment'}>
                                              <div class="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                                <MarkdownViewer content={change.value} />
                                              </div>
                                            </Match>
                                            
                                            {/* 2. TAGS */}
                                            <Match when={change.type === 'tags'}>
                                              <div class="flex flex-wrap gap-1 mt-0.5">
                                                <span class="px-2 py-0.5 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/40 text-[11px] font-medium rounded">
                                                  {change.value || "Nenhuma tag"}
                                                </span>
                                              </div>
                                            </Match>

                                            {/* 3. ESTADOS E ATRIBUIÇÕES */}
                                            <Match when={change.type === 'state' || change.type === 'board' || change.type === 'assignee'}>
                                              <div class="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                                                <i class="fa-solid fa-circle-arrow-right text-blue-500 text-[10px]"></i>
                                                <span>Alterado para:</span>
                                                <span class="font-semibold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-[11px]">
                                                  {change.value}
                                                </span>
                                              </div>
                                            </Match>

                                            {/* 4. TASKS FILHAS (Chama o componente reativo de Lazy Load) */}
                                            <Match when={change.type === 'task_link'}>
                                              <div class="flex flex-col gap-2 mt-1">
                                                <TaskRow id={change.value.id} organization={props.organization} repoPath={props.repoPath} />
                                              </div>
                                            </Match>

                                            {/* 5. COMMITS DO GIT */}
                                            <Match when={change.type === 'commit_link'}>
                                              <div class="flex flex-col gap-2 mt-1">
                                                <div class="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-800 rounded-lg text-xs">
                                                  <i class="fa-solid fa-code-commit text-blue-500 text-sm"></i>
                                                  <span class="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-mono font-bold rounded border border-blue-100 dark:border-blue-900/30 shrink-0">
                                                    {change.value.id}
                                                  </span>
                                                  <span class="flex-1 truncate font-medium text-gray-600 dark:text-gray-300">
                                                    {change.value.title}
                                                  </span>
                                                </div>
                                              </div>
                                            </Match>
                                          </Switch>
                                        </div>
                                      )}
                                    </For>
                                  </Show>
                                </div>
                              </Show>
                            </div>

                          </div>
                        );
                      })()}
                      
                    </Show>
                  </div>
                </Show>

              </div>
              
            </div>
          </div>
        )}
      </Show>

    </div>
  );
}