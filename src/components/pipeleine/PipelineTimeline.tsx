import { createSignal, createResource, Show, For, Switch, Match } from "solid-js";
import { azureService } from "../../services/azure";
import { useApp } from "../../context/AppContext";

interface PipelineTimelineProps {
  runId: any;
  repoName: string;
  repoOwner: string;
  provider: string;
  runTimeline: {
    (): any[];
    loading: boolean;
  };
  timelineErrors: () => any[];
}

export function PipelineTimeline(props: PipelineTimelineProps) {
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);
  const { t } = useApp();

  // O resource roda sob demanda baseado na seleção deste componente filho
  const [taskLog] = createResource(
    () => {
      const activeId = expandedTaskId();
      if (!activeId) return null;

      const records = props.runTimeline() || [];
      const activeRecord = records.find((r: any) => r.id === activeId);
      return activeRecord?.log?.url ? activeRecord.log.url : null;
    },
    async (logUrl) => {
      if (!logUrl) return "Nenhum log disponível para esta etapa.";
      return await azureService.getTaskLogText(logUrl);
    }
  );

  const toggleExpandTask = (record: any) => {
    if (record.type !== 'Task' || !record.log) return;
    if (expandedTaskId() === record.id) {
      setExpandedTaskId(null);
    } else {
      setExpandedTaskId(record.id);
    }
  };

  return (
    <>
      {/* CAIXA DE ERROS DO AZURE DINÂMICA */}
      <Show when={!props.runTimeline.loading && props.timelineErrors().length > 0}>
        <For each={props.timelineErrors()}>
          {(task) => (
            <div class="container-branch-list rounded-xl mb-2 p-4">
              <div class="flex items-center gap-2 text-rose-500 dark:text-rose-400 font-black text-[10px] uppercase tracking-wider mb-2">
                <i class="fa-solid fa-circle-exclamation text-xs text-rose-500"></i> 
                Erros encontrados no Job: {task.name}
              </div>
              <div class="bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/20 font-mono text-xs p-3 rounded-lg border shadow-inner leading-relaxed overflow-x-auto text-rose-700 dark:text-rose-300">
                <For each={task.issues}>
                  {(issue) => <div class="mb-1 last:mb-0">{issue.message}</div>}
                </For>
                <span class="text-gray-500 text-[10px] block mt-2 font-sans">
                  ► Task afetada: {task.name} (Ref: {task.type})
                </span>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* ÁRVORE DE STAGES & JOBS + TERMINAL DE LOGS LADO A LADO */}
      <div class="flex-1 flex flex-col container-branch-list p-4">
        <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-3">
          {t('pipeline').stages_jobs}
        </span>
        
        <div class="flex flex-1 gap-4 min-h-[500px]">
          
          {/* COLUNA ESQUERDA: Menu de Etapas e Tarefas */}
          <div class="w-80 flex flex-col border dark:border-gray-700/60 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/10 text-xs font-bold h-fit divide-y dark:divide-gray-700/40">
            <Show when={props.runTimeline.loading}>
              <div class="p-6 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                <i class="fa-solid fa-circle-notch fa-spin text-amber-500 text-sm"></i>
                <span>Carregando etapas...</span>
              </div>
            </Show>

            <Show when={!props.runTimeline.loading}>
              <For each={props.runTimeline()}>
                {(record) => {
                  const status = record.state?.toLowerCase(); 
                  const result = record.result?.toLowerCase(); 
                  const isSelected = expandedTaskId() === record.id;
                  
                  let duration = "...";
                  if (record.startTime && record.finishTime) {
                    const start = new Date(record.startTime).getTime();
                    const finish = new Date(record.finishTime).getTime();
                    duration = `${Math.round((finish - start) / 1000)}s`;
                  }

                  if (record.type === 'Stage' || record.type === 'Job') {
                    return (
                      <div class="flex items-center justify-between p-3 bg-gray-100/60 dark:bg-gray-800/40 border-b dark:border-gray-700/50">
                        <div class="flex items-center gap-2">
                          <i class={`fa-solid ${
                            result === 'succeeded' ? 'fa-square-check text-emerald-400' : 
                            result === 'failed' ? 'fa-square-minus text-rose-400' : 
                            status === 'inprogress' ? 'fa-square-notch fa-spin text-amber-400' : 'fa-square text-gray-300'
                          }`}></i>
                          <span class="dark:text-white uppercase text-[11px] tracking-wide truncate max-w-[180px]">
                            {record.name}
                          </span>
                        </div>
                        <span class="font-mono text-[10px] text-gray-400">{duration}</span>
                      </div>
                    );
                  }

                  if (record.type === 'Task') {
                    return (
                      <div 
                        onClick={() => toggleExpandTask(record)}
                        class={`flex items-center justify-between p-2.5 px-4 transition-all border-l-2 select-none ${
                          record.log ? 'cursor-pointer' : 'opacity-60'
                        } ${
                          isSelected ? 'bg-gray-200/50 dark:bg-gray-800/60 border-blue-500' : 'border-transparent hover:bg-gray-100/40 dark:hover:bg-gray-800/20'
                        } ${result === 'failed' && !isSelected ? 'bg-rose-500/5' : ''} ${status === 'inprogress' ? 'bg-amber-500/5' : ''}`}
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <Switch fallback={<i class="fa-solid fa-circle text-gray-300 text-[10px]"></i>}>
                            <Match when={status === 'inprogress'}>
                              <i class="fa-solid fa-circle-notch fa-spin text-amber-500 text-[10px]"></i>
                            </Match>
                            <Match when={result === 'failed'}>
                              <i class="fa-solid fa-circle-xmark text-rose-500 text-[10px]"></i>
                            </Match>
                            <Match when={(result === 'succeeded' && (record.name?.toLowerCase().includes('initialize') || record.name?.toLowerCase().includes('finalize') || record.name?.toLowerCase().includes('report build'))) || result === 'abandoned'}>
                              <i class="fa-solid fa-circle-check text-gray-300 dark:text-gray-500 text-[10px]"></i>
                            </Match>
                            <Match when={result === 'succeeded'}>
                              <i class="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i>
                            </Match>
                          </Switch>

                          <span class={`font-medium truncate max-w-[160px] ${
                            isSelected ? 'text-blue-600 dark:text-blue-400 font-bold' :
                            result === 'failed' ? 'font-black text-rose-600 dark:text-rose-400' :
                            status === 'inprogress' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'
                          }`}>
                            {record.name}
                          </span>
                        </div>
                        <span class={`font-mono text-[10px] flex-shrink-0 ${result === 'failed' && !isSelected ? 'text-rose-400' : 'text-gray-400'}`}>
                          {duration}
                        </span>
                      </div>
                    );
                  }
                  return null;
                }}
              </For>
            </Show>
          </div>

          {/* COLUNA DIREITA: Visualizador do Terminal de Logs Dedicado */}
          <div class="flex-1 flex flex-col bg-gray-950 dark:bg-black/40 rounded-xl border border-gray-800 shadow-xl overflow-hidden relative">
            <div class="bg-gray-900/80 px-4 py-3 border-b border-gray-800 flex items-center justify-between text-xs font-mono text-gray-400">
              <span class="flex items-center gap-2">
                <i class="fa-solid fa-terminal text-[10px] text-gray-500"></i>
                {expandedTaskId() ? 'Console Output' : 'Selecione uma etapa para ver os logs'}
              </span>
              <Show when={expandedTaskId() && !taskLog.loading}>
                <button 
                  onClick={() => {
                    const text = taskLog();
                    if(text) navigator.clipboard.writeText(text);
                  }}
                  class="hover:text-white transition-colors flex items-center gap-1 bg-gray-800 px-2 py-1 rounded border border-gray-700 text-[10px]"
                >
                  <i class="fa-regular fa-copy"></i> Copiar Raw
                </button>
              </Show>
            </div>

            <div class="flex-1 p-4 font-mono text-[11px] text-gray-200 overflow-y-auto whitespace-pre-wrap leading-relaxed h-0 min-h-[450px]">
              <Switch>
                <Match when={!expandedTaskId()}>
                  <div class="h-full flex flex-col items-center justify-center text-gray-500 gap-2 select-none">
                    <i class="fa-solid fa-file-lines text-2xl opacity-30"></i>
                    <span>Clique em qualquer task ao lado para inspecionar a saída do terminal.</span>
                  </div>
                </Match>
                <Match when={taskLog.loading}>
                  <div class="h-full flex items-center justify-center text-gray-500 gap-2">
                    <i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-sm"></i>
                    <span>Baixando saída do console do Azure DevOps...</span>
                  </div>
                </Match>
                <Match when={!taskLog.loading}>
                  <div class="animate-fade-in">{taskLog()}</div>
                </Match>
              </Switch>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}