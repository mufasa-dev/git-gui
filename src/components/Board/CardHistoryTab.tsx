import { createResource, createSignal, Show, For, Switch, Match } from "solid-js";
import { azureService } from "../../services/azure";
import MarkdownViewer from "../ui/MarkdownViewer";
import TaskRow from "./TaskRow";

type CardHistoryTabProps = {
  cardId: string | number;
  organization: string;
  repoPath: string;
  onNavigateTask: (id: string | number) => void;
};

export default function CardHistoryTab(props: CardHistoryTabProps) {
  const [historyData] = createResource(
    () => props.cardId,
    async (id) => await azureService.getWorkItemHistory(props.organization, props.repoPath, Number(id))
  );

  return (
    <div class="h-full overflow-hidden pt-2 flex flex-col">
      <Show when={!historyData.loading} fallback={
        <div class="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2">
          <i class="fa-solid fa-circle-notch animate-spin text-blue-500 text-lg"></i>
          <span>Carregando histórico do Azure...</span>
        </div>
      }>
        {(() => {
          const [selectedAudit, setSelectedAudit] = createSignal<any>(historyData()?.[0] || null);

          return (
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full overflow-hidden">
              {/* COLUNA ESQUERDA (3 partes de 5): LISTAGEM CRONOLÓGICA */}
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

              {/* COLUNA DIREITA (2 partes de 5): PREVIEW DETALHADO */}
              <div class="lg:col-span-2 flex flex-col border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/40 rounded-xl p-4 overflow-y-auto">
                <Show when={selectedAudit()} fallback={
                  <div class="flex items-center justify-center h-full text-xs italic text-gray-400">
                    Selecione uma revisão à esquerda para inspecionar os detalhes.
                  </div>
                }>
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
                              <Match when={change.type === 'comment'}>
                                <div class="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                  <MarkdownViewer content={change.value} />
                                </div>
                              </Match>
                              
                              <Match when={change.type === 'tags'}>
                                <div class="flex flex-wrap gap-1 mt-0.5">
                                  <span class="px-2 py-0.5 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/40 text-[11px] font-medium rounded">
                                    {change.value || "Nenhuma tag"}
                                  </span>
                                </div>
                              </Match>

                              <Match when={change.type === 'state' || change.type === 'board' || change.type === 'assignee'}>
                                <div class="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                                  <i class="fa-solid fa-circle-arrow-right text-blue-500 text-[10px]"></i>
                                  <span>Alterado para:</span>
                                  <span class="font-semibold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-[11px]">
                                    {change.value}
                                  </span>
                                </div>
                              </Match>

                              <Match when={change.type === 'task_link'}>
                                <div class="flex flex-col gap-2 mt-1">
                                  <TaskRow id={change.value.id} organization={props.organization} repoPath={props.repoPath} onNavigate={props.onNavigateTask} />
                                </div>
                              </Match>

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
  );
}