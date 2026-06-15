import { createMemo, createResource, createSignal, Show, For } from "solid-js";
import CommitMessage from "../ui/CommitMessage";
import { azureService } from "../../services/azure";
import { useApp } from "../../context/AppContext";
import { Repo } from "../../models/Repo.model";
import { GitProvider } from "../../utils/gitProvider";
import { getRelativeTime } from "../../utils/date";
import { PipelineStatusIcon } from "./PipelinesPage";
import Dialog from "../ui/Dialog";

interface Props {
    runId: any; 
    repoOwner: string; 
    repo: Repo; 
    provider: GitProvider; 
    fallbackRuns: any[],
    selectCommit: (hash: string) => void
}

export function RunDetailsPanel(props: Props) {
  const { locale, t } = useApp();
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [isChangesModalOpen, setIsChangesModalOpen] = createSignal(false);

  const [runDetails] = createResource(
    () => ({ owner: props.repoOwner, name: props.repo?.name, runId: props.runId, currentProvider: props.provider }),
    async (params) => {
      if (!params.runId || !params.name || !params.owner) return null;
      if (params.currentProvider === "azure") {
        return await azureService.getPipelineRunDetails(params.owner, params.name, params.runId);
      }
      return props.fallbackRuns.find((r: any) => r.id === params.runId);
    }
  );

  const [runChanges] = createResource(
    () => ({ owner: props.repoOwner, name: props.repo?.name, runId: props.runId, currentProvider: props.provider }),
    async (params) => {
      if (!params.runId || !params.name || !params.owner || params.currentProvider !== "azure") return [];
      try {
        return await azureService.getPipelineRunChanges?.(params.owner, params.name, params.runId) || [];
      } catch (e) {
        console.error("Falha ao carregar alterações da run:", e);
        return [];
      }
    }
  );

  const runDescription = createMemo(() => {
    const run = runDetails();
    if (!run) return "Build Triggered";
    return run.commit?.message || run.triggerInfo?.["ci.message"] || "Set up CI with Azure Pipelines";
  });

  return (
    <Show when={!runDetails.loading} fallback={<div class="flex-1 flex items-center justify-center"><i class="fa-solid fa-spinner fa-spin text-xl text-blue-500"></i></div>}>
      <div class="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700/50 overflow-y-auto custom-scrollbar flex flex-col">
        
        {/* BANNER SUPERIOR (PADRÃO AZURE DEVOPS) */}
        <header class="p-6 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex items-start justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <div class="mt-0.5 shrink-0">
              <PipelineStatusIcon status={runDetails().status} result={runDetails().result} />
            </div>
            
            <div class="space-y-1 min-w-0 flex-1">
              <div class="flex items-center gap-2 text-base font-black dark:text-white truncate">
                <span class="text-gray-400 font-mono shrink-0">#{runDetails().number}</span>
                <span class="text-gray-300 dark:text-gray-600 shrink-0">•</span>
                <div class="truncate">
                  <CommitMessage message={runDescription()} />
                </div>
              </div>
              <div class="text-xs text-gray-500 font-bold flex items-center gap-2">
                <span>Pipeline: <span class="text-gray-700 dark:text-gray-300 font-black">{props.repo?.name || runDetails().name}</span></span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 relative">
            <Show when={runDetails().result?.toLowerCase() === 'failed' || runDetails().result?.toLowerCase() === 'failure'}>
              <button class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-black uppercase text-[9px] tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-sm">
                <i class="fa-solid fa-arrow-rotate-left"></i> Rerun failed jobs
              </button>
            </Show>

            <button class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[9px] tracking-wider px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-600/10">
              <i class="fa-solid fa-play text-[8px]"></i> Run new
            </button>

            <div class="relative">
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen())}
                class="flex items-center justify-center bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 w-8 h-8 rounded-xl transition-all"
              >
                <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
              </button>

              <Show when={dropdownOpen()}>
                <div class="absolute top-9 right-0 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1.5 z-50 text-xs font-bold text-gray-700 dark:text-gray-300">
                  <button class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2.5">
                    <i class="fa-solid fa-download text-gray-400 w-3"></i> Download logs
                  </button>
                  <button class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2.5">
                    <i class="fa-solid fa-code text-gray-400 w-3"></i> See full YAML
                  </button>
                  <a 
                    href={runDetails().url} 
                    target="_blank" 
                    rel="noreferrer"
                    class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2.5 text-gray-700 dark:text-gray-300"
                  >
                    <i class="fa-solid fa-arrow-up-right-from-square text-gray-400 w-3"></i> Ver no console
                  </a>
                  <div class="border-t dark:border-gray-800 my-1"></div>
                  <button class="w-full text-left px-4 py-2 hover:bg-rose-500/10 text-rose-500 flex items-center gap-2.5">
                    <i class="fa-solid fa-trash w-3"></i> Delete Run
                  </button>
                </div>
                <div class="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
              </Show>
            </div>
          </div>
        </header>

        {/* METADADOS EM GRID CARD */}
        <div class="p-6 grid grid-cols-4 gap-6 border-b dark:border-gray-700 text-xs bg-white dark:bg-gray-800">
          <div class="space-y-1.5">
            <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider">Autor do disparo</span>
            <div class="flex items-center gap-2">
              <Show when={runDetails().author?.avatarUrl} fallback={<div class="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[9px] text-white font-black">{runDetails().author?.name?.[0] || 'B'}</div>}>
                <img src={runDetails().author.avatarUrl} class="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600" />
              </Show>
              <span class="font-bold dark:text-gray-200">{runDetails().author?.name || runDetails().requestedFor?.displayName || "bruno ribeiro"}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider">Repositório e versão</span>
            <div class="font-bold dark:text-gray-200 flex flex-col gap-0.5">
              <span class="text-blue-500"><i class="fa-solid fa-book-bookmark mr-1.5 text-[10px]"></i>{props.repo?.name}</span>
              <span class="text-gray-500 font-mono text-[11px] truncate">
                <i class="fa-solid fa-code-branch mr-1.5 text-[10px]"></i>{runDetails().sourceBranch || "main"} 
                <Show when={runDetails().commitId || runDetails().commit?.id}>
                  <span class="mx-1 text-gray-300">•</span>
                  <span class="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400" onClick={() => props.selectCommit(runDetails().commit?.fullId || runDetails().commitId || runDetails().commit?.id)}>
                    <i class="fa-solid fa-code-commit mr-1.5 text-[10px]"></i>
                    {(runDetails().commitId || runDetails().commit?.id).substring(0, 7)}
                  </span>
                </Show>
              </span>
            </div>
          </div>

          {/* NOVO BLOCO: ALTERAÇÕES VINCULADAS (IGUAL AO AZURE DEVOPS) */}
          <div class="space-y-1.5">
            <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider">Modificações</span>
            <div class="flex items-center">
              <button 
                onClick={() => setIsChangesModalOpen(true)}
                class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600/70 text-gray-700 dark:text-gray-200 font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg transition-all"
              >
                <i class="fa-solid fa-clock-rotate-left text-[9px] text-gray-400"></i>
                View {runChanges() ? runChanges()?.length : 0} changes
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider">Duração total</span>
            <div class="font-bold dark:text-gray-200">
              <i class="fa-regular fa-clock mr-1.5 text-gray-400"></i>
              {runDetails().finishTime ? getRelativeTime(runDetails().startTime, t, locale()) : "Rodando agora"}
            </div>
          </div>
        </div>

        {/* CAIXA DE ERROS DO AZURE */}
        <Show when={runDetails().result?.toLowerCase() === 'failed' || runDetails().result?.toLowerCase() === 'failure'}>
          <div class="m-6 p-4 bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 rounded-xl">
            <div class="flex items-center gap-2 text-rose-500 dark:text-rose-400 font-black text-[10px] uppercase tracking-wider mb-2">
              <i class="fa-solid fa-circle-exclamation text-xs text-rose-500"></i> Erros encontrados no Job
            </div>
            <div class="bg-gray-950 text-rose-400 font-mono text-xs p-3 rounded-lg border border-gray-900 shadow-inner leading-relaxed overflow-x-auto">
              Error: Not found wrapperScript: /home/vsts/work/1/s/gradlew <br />
              <span class="text-gray-500 text-[10px] block mt-2 font-sans">► Task afetada: Gradle@3 (Verifique se o wrapper está na raiz do Git)</span>
            </div>
          </div>
        </Show>

        {/* ÁRVORE DE STAGES & JOBS */}
        <div class="mx-6 mb-6 flex-1 flex flex-col">
          <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-3">Estágios e Jobs</span>
          <div class="border dark:border-gray-700/60 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/10 text-xs font-bold">
            
            <div class="flex items-center justify-between p-3 border-b dark:border-gray-700/50 bg-gray-100/60 dark:bg-gray-800/40">
              <div class="flex items-center gap-2">
                <i class={`fa-solid ${runDetails().result?.toLowerCase() === 'failed' ? 'fa-square-minus text-rose-400' : 'fa-square-check text-emerald-400'}`}></i>
                <span class="dark:text-white">Stage 1 (Build e Verificação)</span>
              </div>
            </div>

            <div class="divide-y dark:divide-gray-700/40">
              <div class="flex items-center justify-between p-2.5 px-4">
                <div class="flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i> <span class="text-gray-600 dark:text-gray-300">Initialize Job</span></div>
                <span class="font-mono text-[10px] text-gray-400">2s</span>
              </div>
              <div class="flex items-center justify-between p-2.5 px-4">
                <div class="flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i> <span class="text-gray-600 dark:text-gray-300">JavaToolInstaller@0</span></div>
                <span class="font-mono text-[10px] text-gray-400">5s</span>
              </div>
              
              <Show when={runDetails().result?.toLowerCase() === 'failed' || runDetails().result?.toLowerCase() === 'failure'}>
                <div class="flex items-center justify-between p-2.5 px-4 bg-rose-500/5">
                  <div class="flex items-center gap-2"><i class="fa-solid fa-circle-xmark text-rose-500 text-[10px]"></i> <span class="font-black text-rose-600 dark:text-rose-400">Gradle@3 (Task Failed)</span></div>
                  <span class="font-mono text-[10px] text-rose-400">38s</span>
                </div>
              </Show>
              <Show when={runDetails().status?.toLowerCase() === 'inprogress'}>
                <div class="flex items-center justify-between p-2.5 px-4 bg-amber-500/5">
                  <div class="flex items-center gap-2"><i class="fa-solid fa-circle-notch fa-spin text-amber-500 text-[10px]"></i> <span class="text-amber-600 dark:text-amber-400">Gradle@3 (Compilando código...)</span></div>
                  <span class="font-mono text-[10px] text-amber-400 fa-bounce">...</span>
                </div>
              </Show>
            </div>
          </div>
        </div>

      </div>

      {/* MODAL DE HISTÓRICO DE COMMITS (ALTERAÇÕES) */}
      <Dialog open={isChangesModalOpen()} onClose={() => setIsChangesModalOpen(false)} title={'Commits associados à Run #' + runDetails().number}>
          <div class="max-h-[350px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            <Show when={runChanges() && runChanges()!.length > 0} fallback={
              <div class="text-center py-8 text-xs text-gray-400 font-bold uppercase tracking-wider">
                Nenhum commit incremental detectado nesta execução.
              </div>
            }>
              <For each={runChanges()}>
                {(commit: any) => (
                  <div 
                    onClick={() => {
                      props.selectCommit(commit.id || commit.commitId);
                    }}
                    class="flex items-start justify-between p-3 border border-gray-200 dark:border-gray-700/70 rounded-xl hover:bg-blue-500/5 hover:border-blue-500/30 cursor-pointer transition-all group"
                  >
                    <div class="min-w-0 flex-1 pr-3">
                      <div class="text-xs font-black dark:text-gray-200 group-hover:text-blue-500 transition-colors truncate">
                        <CommitMessage message={commit.message} />
                      </div>
                      <div class="text-[10px] text-gray-400 font-bold mt-1 flex items-center gap-2">
                        <span class="text-gray-500 dark:text-gray-400 font-black">
                          {commit.author?.name || commit.committer?.name || "Autor desconhecido"}
                        </span>
                        <Show when={commit.timestamp || commit.author?.date}>
                          <span>•</span>
                          <span>{getRelativeTime(commit.timestamp || commit.author?.date, t, locale())}</span>
                        </Show>
                      </div>
                    </div>
                    
                    <span class="font-mono text-[10px] font-bold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-500 dark:text-gray-400 group-hover:bg-blue-500 group-hover:text-white transition-all shrink-0">
                      {(commit.id || commit.commitId || "").substring(0, 7)}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </div>
      </Dialog>
    </Show>
  );
}