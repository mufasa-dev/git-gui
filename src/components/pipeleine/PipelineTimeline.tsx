import { createSignal, createResource, Show, For, Switch, Match, createMemo } from "solid-js";
import { azureService } from "../../services/azure";
import Dialog from "../ui/Dialog"; 
import LogPreviewer from "./LogPreviewer";

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
  t: (key: string) => any;
}

// 1. COMPONENTE ISOLADO DE ÍCONE (Evita repetição de código)
function TaskStatusIcon(props: { status: string; result: string; name: string; sizeClass?: string }) {
  const status = () => props.status?.toLowerCase();
  const result = () => props.result?.toLowerCase();
  const name = () => props.name?.toLowerCase() || "";

  return (
    <Switch fallback={<i class={`fa-solid fa-circle text-gray-300 dark:text-gray-600 ${props.sizeClass || 'text-[10px]'}`}></i>}>
      <Match when={status() === 'inprogress'}>
        <i class={`fa-solid fa-circle-notch fa-spin text-amber-500 ${props.sizeClass || 'text-[10px]'}`}></i>
      </Match>
      <Match when={result() === 'failed'}>
        <i class={`fa-solid fa-circle-xmark text-rose-500 ${props.sizeClass || 'text-[10px]'}`}></i>
      </Match>
      <Match when={(result() === 'succeeded' && (name().includes('initialize') || name().includes('finalize') || name().includes('report build'))) || result() === 'abandoned'}>
        <i class={`fa-solid fa-circle-check text-gray-400 dark:text-gray-500 ${props.sizeClass || 'text-[10px]'}`}></i>
      </Match>
      <Match when={result() === 'succeeded'}>
        <i class={`fa-solid fa-circle-check text-emerald-500 ${props.sizeClass || 'text-[10px]'}`}></i>
      </Match>
    </Switch>
  );
}

export function PipelineTimeline(props: PipelineTimelineProps) {
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);

  const activeTask = createMemo(() => {
    const activeId = expandedTaskId();
    if (!activeId) return null;
    return (props.runTimeline() || []).find((r: any) => r.id === activeId);
  });

  const [taskLog] = createResource(
    () => activeTask()?.log?.url || null,
    async (logUrl) => {
      if (!logUrl) return props.t('pipeline').no_logs_on_step;
      return await azureService.getTaskLogText(logUrl);
    }
  );

  const handleTaskClick = (record: any) => {
    if (record.type !== 'Task' || !record.log) return;
    setExpandedTaskId(record.id);
  };

  return (
    <>
      {/* CAIXA DE ERROS DO AZURE DINÂMICA (MANTIDA FORA DO MODAL) */}
      <Show when={!props.runTimeline.loading && props.timelineErrors().length > 0}>
        <For each={props.timelineErrors()}>
          {(task) => (
            <div class="container-branch-list rounded-xl mb-2 p-4">
              <div class="flex items-center gap-2 text-rose-500 dark:text-rose-400 font-black text-[10px] uppercase tracking-wider mb-2">
                <i class="fa-solid fa-circle-exclamation text-xs text-rose-500"></i> 
                {props.t('pipeline').errors_on_job}: {task.name}
              </div>
              <div class="bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/20 font-mono text-xs p-3 rounded-lg border shadow-inner leading-relaxed overflow-x-auto text-rose-700 dark:text-rose-300">
                <For each={task.issues}>
                  {(issue) => <div class="mb-1 last:mb-0">{issue.message}</div>}
                </For>
                <span class="text-gray-500 text-[10px] block mt-2 font-sans">
                  ► {props.t('pipeline').affected_task}: {task.name} (Ref: {task.type})
                </span>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* LISTA PRINCIPAL FRONTAL */}
      <div class="flex-1 flex flex-col container-branch-list p-4">
        <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-3">
          {props.t('pipeline').stages_jobs}
        </span>
        
        <div class="border dark:border-gray-700/60 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/10 text-xs font-bold divide-y dark:divide-gray-700/40">
          <Show when={props.runTimeline.loading}>
            <div class="p-6 text-center text-gray-400 flex items-center justify-center gap-2">
              <i class="fa-solid fa-circle-notch fa-spin text-amber-500 text-sm"></i>
              <span>{props.t('pipeline').loading_steps}</span>
            </div>
          </Show>

          <Show when={!props.runTimeline.loading}>
            <For each={props.runTimeline()}>
              {(record) => {
                let duration = "...";
                if (record.startTime && record.finishTime) {
                  const start = new Date(record.startTime).getTime();
                  const finish = new Date(record.finishTime).getTime();
                  duration = `${Math.round((finish - start) / 1000)}s`;
                }

                if (record.type === 'Stage' || record.type === 'Job') {
                  return (
                    <div class="flex items-center justify-between p-3 bg-gray-100/60 dark:bg-gray-800/40">
                      <div class="flex items-center gap-2">
                        <i class={`fa-solid ${
                          record.result?.toLowerCase() === 'succeeded' ? 'fa-square-check text-emerald-400' : 
                          record.result?.toLowerCase() === 'failed' ? 'fa-square-minus text-rose-400' : 
                          record.state?.toLowerCase() === 'inprogress' ? 'fa-square-notch fa-spin text-amber-400' : 'fa-square text-gray-300'
                        }`}></i>
                        <span class="dark:text-white uppercase text-[11px] tracking-wide">{record.name}</span>
                      </div>
                      <span class="font-mono text-[10px] text-gray-400">{duration}</span>
                    </div>
                  );
                }

                if (record.type === 'Task') {
                  return (
                    <div 
                      onClick={() => handleTaskClick(record)}
                      class={`flex items-center justify-between p-2.5 px-4 transition-all select-none ${
                        record.log ? 'cursor-pointer hover:bg-gray-200/40 dark:hover:bg-gray-800/20' : 'opacity-60'
                      } ${record.result?.toLowerCase() === 'failed' ? 'bg-rose-500/5' : ''} ${record.state?.toLowerCase() === 'inprogress' ? 'bg-amber-500/5' : ''}`}
                    >
                      <div class="flex items-center gap-2">
                        <TaskStatusIcon status={record.state} result={record.result} name={record.name} />

                        <span class={`font-medium ${
                          record.result?.toLowerCase() === 'failed' ? 'font-black text-rose-600 dark:text-rose-400' :
                          record.state?.toLowerCase() === 'inprogress' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'
                        }`}>
                          {record.name}
                        </span>
                      </div>
                      <span class={`font-mono text-[10px] ${record.result?.toLowerCase() === 'failed' ? 'text-rose-400' : 'text-gray-400'}`}>
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
      </div>

      {/* DIALOG EM TELA CHEIA */}
      <Dialog 
        open={expandedTaskId() !== null} 
        onClose={() => setExpandedTaskId(null)}
        title={props.t('pipeline').pipe_execution_log}
        bodyClass="p-4" width="calc(100% - 30px)"
      >
        <div class="flex gap-4 h-[75vh]">
          
          {/* MENU SPLIT ESQUERDO (DENTRO DO MODAL) */}
          <div class="w-72 flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden 
                bg-gray-50 dark:bg-gray-900/40 text-xs font-bold divide-y divide-gray-200 dark:divide-gray-800 overflow-y-auto custom-scrollbar">
            <For each={props.runTimeline()}>
              {(record) => {
                const isSelected = createMemo(() => expandedTaskId() === record.id);

                if (record.type === 'Stage' || record.type === 'Job') {
                  return (
                    <div class="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 
                            font-black text-[10px] tracking-wider truncate sticky top-0 z-10 
                            border-b border-gray-200 dark:border-gray-700">
                      {record.name}
                    </div>
                  );
                }

                if (record.type === 'Task') {
                  return (
                    <div 
                      onClick={() => record.log && setExpandedTaskId(record.id)}
                      class={`flex items-center justify-between p-2.5 px-3 transition-all select-none ${
                        record.log 
                          ? 'cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300' 
                          : 'opacity-40 pointer-events-none text-gray-400'
                      } ${
                        isSelected() 
                          ? 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500 font-black' 
                          : 'border-transparent'
                      }`}
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <TaskStatusIcon status={record.state} result={record.result} name={record.name} sizeClass="text-[12px] shrink-0" />
                        <span class="truncate pr-2">{record.name}</span>
                      </div>
                      
                      <Show when={record.result?.toLowerCase() === 'failed'}>
                        <span class="text-[9px] uppercase font-black tracking-wider text-rose-500 shrink-0 bg-rose-500/10 px-1.5 py-0.5 rounded">
                          {props.t('error').error}
                        </span>
                      </Show>
                    </div>
                  );
                }
                return null;
              }}
            </For>
          </div>

          {/* PAINEL DO TERMINAL DIREITO COM CABEÇALHO DINÂMICO */}
          <div class="flex-1 flex flex-col bg-gray-100 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
            <div class="bg-gray-100 dark:bg-gray-900 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs font-mono text-gray-800 dark:text-gray-400">
              
              {/* Nome da Task e Ícone Dinâmicos no Topo do Console */}
              <span class="flex items-center gap-2 dark:text-gray-200 font-sans font-bold">
                <Show fallback={
                  <>
                    <i class="fa-solid fa-terminal text-[10px] text-gray-500"></i>
                    <span>Console Output</span>
                  </>
                } when={activeTask()}>
                  <TaskStatusIcon status={activeTask()!.state} result={activeTask()!.result} name={activeTask()!.name} sizeClass="text-[15px]" />
                  <span class="dark:text-gray-100 font-mono text-[12px]">{activeTask()!.name}</span>
                </Show>
              </span>

              <Show when={!taskLog.loading}>
                <button 
                  onClick={() => {
                    const text = taskLog();
                    if(text) navigator.clipboard.writeText(text);
                  }}
                  class="hover:text-white transition-colors flex items-center gap-1 dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-700 text-[10px] font-sans"
                >
                  <i class="fa-regular fa-copy"></i> {props.t('pipeline').copy_raw}
                </button>
              </Show>
            </div>

            <div class="flex-1 bg-gray-950 overflow-hidden relative">
              <Switch>
                <Match when={taskLog.loading}>
                  <div class="h-full flex items-center justify-center text-gray-800 dark:text-gray-500 gap-2 font-mono text-xs">
                    <i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-sm"></i>
                    <span>{props.t('pipeline').download_console_output}</span>
                  </div>
                </Match>
                
                <Match when={!taskLog.loading}>
                  <LogPreviewer content={taskLog() || "Nenhum log registrado para esta task."} />
                </Match>
              </Switch>
            </div>
          </div>

        </div>
      </Dialog>
    </>
  );
}