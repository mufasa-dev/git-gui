import { createResource, createSignal, For, Show, createMemo, createEffect, onCleanup } from "solid-js";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";
import { getRelativeTime } from "../../utils/date";
import { Repo } from "../../models/Repo.model";
import { useApp } from "../../context/AppContext";
import { GitProvider } from "../../utils/gitProvider";
import { PipelineDefinition, UnifiedPipelineRun } from "../../models/Pipeline.model";
import { RunDetailsPanel } from "./RunDetailPanel";
import Dialog from "../ui/Dialog";
import { getCommitDetails } from "../../services/gitService";
import { CommitDetails } from "../commits/CommitDetails";
import { useLoading } from "../ui/LoadingContext";

export function PipelineStatusIcon(props: { status: string; result: string }) {
  const config = createMemo(() => {
    const s = props.status?.toLowerCase();
    const r = props.result?.toLowerCase();

    if (s === "inprogress" || s === "in_progress") {
      return { icon: "fa-solid fa-circle-notch fa-spin text-amber-500", title: "Rodando" };
    }
    if (s === "queued" || s === "notstarted") {
      return { icon: "fa-regular fa-clock text-gray-400", title: "Na Fila" };
    }
    if (r === "succeeded" || r === "success") {
      return { icon: "fa-solid fa-circle-check text-emerald-500", title: "Sucesso" };
    }
    if (r === "failed" || r === "failure") {
      return { icon: "fa-solid fa-circle-xmark text-rose-500", title: "Falhou" };
    }
    return { icon: "fa-solid fa-ban text-gray-500", title: "Cancelado" };
  });

  return (
    <span title={config().title} class="flex items-center justify-center w-5 h-5 text-sm">
      <i class={config().icon}></i>
    </span>
  );
}

export default function PipelinesPage(props: { repo: Repo; provider: GitProvider; remoteUrl: string }) {
  const [searchTerm, setSearchTerm] = createSignal("");
  const [selectedPipeline, setSelectedPipeline] = createSignal<PipelineDefinition | null>(null);
  const [selectedRunId, setSelectedRunId] = createSignal<number | string | null>(null);

  const [showModalCommitDetails, setModalCommitDetails] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);

  const [showRunModal, setShowRunModal] = createSignal(false);
  const [selectedTargetBranch, setSelectedTargetBranch] = createSignal("main");
  const [enableDiagnostics, setEnableDiagnostics] = createSignal(false);

  const { showLoading, hideLoading } = useLoading();
  const { t, locale } = useApp();
  const [sidebarWidth, setSidebarWidth] = createSignal(380);
  const [isResizing, setIsResizing] = createSignal(false);
  const [activeBuilds, setActiveBuilds] = createSignal<Record<string, string>>({});

  createEffect(() => {
    const runs = pipelineRuns();
    if (!runs || runs.length === 0) return;

    const hasRunningPipelines = runs.some((run: any) => {
      const status = run.status?.toLowerCase();
      return status === "inprogress" || status === "queued" || status === "notstarted";
    });

    if (hasRunningPipelines) {
      const currentActive: Record<string, string> = {};
      runs.forEach((run: any) => {
        const status = run.status?.toLowerCase();
        if (status === "inprogress" || status === "queued" || status === "notstarted") {
          currentActive[run.id] = run.number;
        }
      });
      
      setActiveBuilds(prev => ({ ...prev, ...currentActive }));

      const interval = setInterval(async () => {
        const pipe = selectedPipeline();
        const owner = repoOwner();
        const repoName = props.repo?.name;

        if (!pipe || !owner || !repoName || props.provider !== "azure") return;

        try {
          const allRuns = await azureService.getPipelineRuns(owner, repoName);
          const freshRuns = allRuns.filter((run: any) => run.name === pipe.name);

          const currentSignature = runs.map(r => `${r.id}-${r.status}-${r.result}`).join('|');
          const freshSignature = freshRuns.map((r: any) => `${r.id}-${r.status}-${r.result}`).join('|');

          if (currentSignature !== freshSignature) {
            mutateRuns(freshRuns);

            if (!selectedPipeline()) {
              refetchPipelines();
            }
          }
        } catch (err) {
          console.error("Erro no polling silencioso:", err);
        }
      }, 4000);

      onCleanup(() => clearInterval(interval));
    } else {
      const savedActive = activeBuilds();
      if (Object.keys(savedActive).length > 0) {
        runs.forEach((run: any) => {
          if (savedActive[run.id]) {
            if ("Notification" in window && Notification.permission === "granted") {
              const isSuccess = run.result?.toLowerCase() === "succeeded" || run.result?.toLowerCase() === "success";
              new Notification(`Pipeline #${run.number || savedActive[run.id]}`, {
                body: isSuccess ? `🎉 Execução finalizada com SUCESSO!` : `❌ A execução FALHOU. Verifique os erros.`,
              });
            }
          }
        });
        setActiveBuilds({});
      }
    }
  });

  const repoOwner = createMemo(() => {
    const url = props.remoteUrl;
    if (!url) return "";
    try {
      if (url.includes("dev.azure.com/")) return url.split("dev.azure.com/")[1]?.split("/")[0] || "";
      if (url.includes(".visualstudio.com/")) return url.split(".visualstudio.com/")[0].replace("https://", "").split("@").pop() || "";
      if (url.includes("github.com/")) return url.split("github.com/")[1]?.split("/")[0] || "";
    } catch (e) { console.error(e); }
    return "";
  });

  const [pipelines, { refetch: refetchPipelines }] = createResource<PipelineDefinition[], { owner: string; name: string; currentProvider: GitProvider }>(
    () => ({ owner: repoOwner(), name: props.repo?.name, currentProvider: props.provider }),
    async (params) => {
      if (!params.name || !params.owner) return [];
      if (params.currentProvider === "azure") {
        const runs = await azureService.getPipelineRuns(params.owner, params.name);
        
        const uniquePipesMap = new Map<string, { id: number | string; lastStatus: string; lastResult: string }>();
        
        runs.forEach((r: any) => {
          const pipeId = r.id; 
          const pipeName = r.name;
          
          if (pipeName && pipeId) {
            if (!uniquePipesMap.has(pipeName)) {
              uniquePipesMap.set(pipeName, {
                id: pipeId, 
                lastStatus: r.status || "",
                lastResult: r.result || ""
              });
            }
          }
        });

        return Array.from(uniquePipesMap.entries()).map(([name, data]) => ({ 
          id: data.id, 
          name: name, 
          folder: "📂",
          lastStatus: data.lastStatus,
          lastResult: data.lastResult
        }));
      }
      
      return [{ id: "main.yml", name: "GitHub Workflows", folder: "📂", lastStatus: "completed", lastResult: "success" }];
    }
  );

  const [pipelineRuns, { refetch: refetchRuns, mutate: mutateRuns }] = createResource<UnifiedPipelineRun[], { owner: string; name: string; pipeline: PipelineDefinition | null; currentProvider: GitProvider }>(
    () => ({ owner: repoOwner(), name: props.repo?.name, pipeline: selectedPipeline(), currentProvider: props.provider }),
    async (params) => {
      if (!params.pipeline || !params.name || !params.owner) return [];
      if (params.currentProvider === "azure") {
        const allRuns = await azureService.getPipelineRuns(params.owner, params.name);
        return allRuns.filter((run: any) => run.name === params.pipeline!.name);
      }
      return await githubService.getPipelineRuns(params.owner, params.name);
    }
  );

  async function selectCommit(hash: string) {
    console.log('props.repo', props.repo);
    console.log('hash', hash)
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
    setModalCommitDetails(true);
  }

  createEffect(() => {
    if (props.repo?.path) {
      setSelectedPipeline(null);
      setSelectedRunId(null);
      setSearchTerm("");
    }
  });

  const filteredList = createMemo<any[]>(() => {
    const term = searchTerm().toLowerCase();
    if (!selectedPipeline()) {
      const list = pipelines() || [];
      return term ? list.filter((p) => p.name.toLowerCase().includes(term)) : list;
    } else {
      const list = pipelineRuns() || [];
      return term ? list.filter((r) => r.number.toString().includes(term) || r.sourceBranch.toLowerCase().includes(term)) : list;
    }
  });

  const openRunPipelineModal = () => {
    if (!selectedPipeline()) return;
    setSelectedTargetBranch("main");
    setEnableDiagnostics(false);
    setShowRunModal(true);
  };

  const handleConfirmTriggerPipeline = async () => {
    const pipe = selectedPipeline();
    if (!pipe) return;

    const owner = repoOwner();
    const repoName = props.repo?.name;
    const branch = selectedTargetBranch();

    try {
      setShowRunModal(false);
      showLoading("Executando pipeline");
      
      if (props.provider === "azure") {
        const details = await azureService.getPipelineRunDetails(owner, repoName, Number(pipe.id));

        await azureService.triggerPipelineRun(owner, repoName, details.definitionId, branch);
      } else {
        const workflowFile = "main.yml";
        await githubService.triggerPipelineRun(owner, repoName, workflowFile, branch);
      }

      setTimeout(() => { refetchRuns(); }, 1500);

    } catch (error) {
      console.error("Falha ao executar a pipeline:", error);
    } finally {
      hideLoading();
    }
  };

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 overflow-hidden"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.max(320, Math.min(650, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* SIDEBAR */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-900 height-container" style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list p-0 flex flex-col h-full">
          
          <header class="p-4 border-b dark:border-gray-700/50 space-y-3">
            <Show when={selectedPipeline()} fallback={
              <div class="flex items-center justify-between">
                <span class="text-xs font-black uppercase text-gray-500 tracking-wider">Pipelines</span>
                <button onClick={() => refetchPipelines()} class="text-gray-400 hover:text-blue-500 transition-colors p-1">
                  <i class={`fa-solid fa-arrow-rotate-right text-xs ${pipelines.loading ? 'fa-spin text-blue-500' : ''}`}></i>
                </button>
              </div>
            }>
              <div class="flex items-center gap-2">
                <button 
                  onClick={() => { setSelectedPipeline(null); setSelectedRunId(null); }}
                  class="text-gray-400 hover:text-blue-500 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-lg transition-colors border dark:border-gray-700"
                >
                  <i class="fa-solid fa-arrow-left text-xs"></i>
                </button>
                <div class="flex-1 min-w-0">
                  <span class="text-[10px] font-bold text-gray-500 block uppercase tracking-wider">Runs</span>
                  <span class="text-xs font-black dark:text-white block truncate" title={selectedPipeline()!.name}>{selectedPipeline()!.name}</span>
                </div>
                
                {/* Grupo de botões de controle das runs */}
                <div class="flex items-center gap-1">
                  <button 
                    onClick={openRunPipelineModal}
                    title="Executar Pipeline (Run new)"
                    class="text-gray-400 hover:text-emerald-500 p-1.5 transition-colors"
                  >
                    <i class="fa-solid fa-play text-xs"></i>
                  </button>
                  <button 
                    onClick={() => refetchRuns()} 
                    title="Sincronizar"
                    class="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
                  >
                    <i class={`fa-solid fa-arrow-rotate-right text-xs ${pipelineRuns.loading ? 'fa-spin text-blue-500' : ''}`}></i>
                  </button>
                </div>
              </div>
            </Show>

            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]"></i>
              <input 
                type="text"
                placeholder={!selectedPipeline() ? "Buscar pipeline..." : "Buscar run..."}
                value={searchTerm()}
                onInput={(e) => setSearchTerm(e.currentTarget.value)}
                class="w-full bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 transition-colors dark:text-gray-200"
              />
            </div>
          </header>

          <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
            <Show when={!pipelines.loading && !pipelineRuns.loading} fallback={<div class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-blue-500"></i></div>}>
              
              <Show when={selectedPipeline()} fallback={
                <For each={filteredList()}>
                  {(pipe) => (
                    <div 
                      class="flex items-center gap-3 border border-gray-300 dark:border-gray-700/70 rounded-xl p-3 mb-2 hover:bg-gray-200 dark:hover:bg-gray-700/60 cursor-pointer transition-all"
                      onClick={() => { setSelectedPipeline(pipe); setSearchTerm(""); }}
                    >
                      <div class="shrink-0">
                        <PipelineStatusIcon 
                          status={pipe.lastStatus || ""} 
                          result={pipe.lastResult || ""} 
                        />
                      </div>
                      <div class="flex-1 min-w-0">
                        <h4 class="text-xs font-black truncate dark:text-gray-200">{pipe.name}</h4>
                      </div>
                      <i class="fa-solid fa-chevron-right text-[9px] text-gray-400 pr-1"></i>
                    </div>
                  )}
                </For>
              }>
                
                {/* LISTAGEM DE RUNS */}
                <For each={filteredList()}>
                {(item) => {
                    const run = item as any;

                    const runDescription = createMemo(() => {
                    if (run.name && run.name !== selectedPipeline()?.name) {
                        return run.name;
                    }
                    return run.commit?.message || run.triggerInfo?.["ci.message"] || "Set up CI with Azure Pipelines";
                    });

                    const triggerDetails = createMemo(() => {
                    const isManual = run.triggerType === 'manual' || run.reason === 'manual';
                    const authorName = run.author?.name || run.requestedFor?.displayName || "bruno ribeiro";
                    const avatar = run.author?.avatarUrl || run.requestedFor?.imageUrl || null;

                    return {
                        isManual,
                        label: isManual ? 'Manually run by ' : 'Individual CI for ',
                        authorName,
                        avatar
                    };
                    });

                    const normalizedStatusAndResult = createMemo(() => {
                      const status = run.status?.toLowerCase() || '';
                      
                      if (status === 'inprogress' || status === 'queued' || status === 'notstarted') {
                        return { status: 'inProgress', result: null };
                      }
                      return { status: run.status, result: run.result };
                    });

                    const formattedTime = createMemo(() => {
                      if (!run.startTime) {
                        return "Fila / Aguardando";
                      }
                      
                      const timeStr = getRelativeTime(run.startTime, t, locale());
                      return timeStr.includes("NaN") || timeStr.toLowerCase().includes("invalid") 
                        ? t('date').just_now
                        : timeStr;
                    });

                    return (
                    <div 
                      class={`flex flex-col border rounded-xl p-3 mb-2 transition-all cursor-pointer
                              ${selectedRunId() === run.id ? 'bg-blue-500/10 border-blue-500/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      {/* Linha 1 */}
                      <div class="flex items-start justify-between gap-2 mb-1.5">
                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                          <span class="bg-gray-300/50 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold text-gray-600 dark:text-gray-300 shrink-0">
                            #{run.number || "Fila"}
                          </span>
                          <span class="text-xs font-black truncate dark:text-gray-200" title={runDescription()}>
                            {runDescription()}
                          </span>
                        </div>
                        <PipelineStatusIcon 
                          status={normalizedStatusAndResult().status} 
                          result={normalizedStatusAndResult().result} 
                        />
                      </div>

                      {/* Linha 2 */}
                      <div class="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase mb-2">
                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                          <Show when={triggerDetails().avatar} fallback={
                            <i class={`text-[9px] text-gray-400 ${triggerDetails().isManual ? 'fa-solid fa-user' : 'fa-solid fa-code-commit'}`}></i>
                          }>
                            <img src={triggerDetails().avatar!} class="w-3.5 h-3.5 rounded-full border border-gray-400/30" />
                          </Show>
                          <span class="truncate text-gray-400 dark:text-gray-400 normal-case">
                            <span class="font-bold text-gray-500 dark:text-gray-500">{triggerDetails().label}</span>
                            <span class="font-black text-gray-600 dark:text-gray-300"> {triggerDetails().authorName}</span>
                          </span>
                        </div>
                        <span class="font-mono text-[9px] text-gray-400 shrink-0 pl-1">
                          {formattedTime()}
                        </span>
                      </div>

                      {/* Linha 3 */}
                      <div class="flex items-center gap-2 text-[10px] text-gray-400 font-mono font-bold border-t border-gray-300/30 dark:border-gray-800 pt-1.5">
                        <span class="truncate"><i class="fa-solid fa-code-branch mr-1 text-[9px]"></i>{run.sourceBranch || "main"}</span>
                        <Show when={run.commitId || run.commit?.id}>
                          <span class="text-gray-300 dark:text-gray-700">•</span>
                          <span>
                            <i class="fa-solid fa-code-commit mr-1 text-[9px]"></i>
                            {(run.commitId || run.commit?.id).substring(0, 7)}
                          </span>
                        </Show>
                      </div>
                    </div>
                  );
                }}
                </For>

              </Show>
            </Show>
          </div>
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)}></div>

      {/* PAINEL DE DETALHES RICOS */}
      <div class="flex-1 flex flex-col overflow-hidden pt-2 pr-2 height-container">
        <Show when={selectedRunId()} fallback={
          <div class="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 gap-2">
            <i class="fa-solid fa-layer-group text-4xl"></i>
            <span class="text-xs font-black uppercase tracking-wider">Selecione uma execução para analisar o sumário</span>
          </div>
        }>
          <RunDetailsPanel 
            runId={selectedRunId()!} 
            repoOwner={repoOwner()} 
            repo={props.repo} 
            provider={props.provider} 
            fallbackRuns={pipelineRuns() || []}
            selectCommit={selectCommit}
          />
        </Show>
      </div>

      {/* MODAL ORIGINAL DE COMMITS */}
      <Show when={showModalCommitDetails()}>
        <Dialog open={true}
                title={t('commits').details}
                onClose={() => setModalCommitDetails(false)}
                bodyClass="p-0"
                width={'calc(100vw - 40px)'}
                height={'calc(100vh - 100px)'}>
          <CommitDetails commit={selectedCommit()}
            repoPath={props.repo.path} branch={""}
            openParent={false} openProfile={false}
            selectCommit={selectCommit} 
          />
        </Dialog>
      </Show>

      {/* MODAL CONFIGURAÇÃO RUN PIPELINE (ESTILO AZURE DEVOPS) */}
      <Show when={showRunModal()}>
        <Dialog open={true}
                title="Run pipeline"
                onClose={() => setShowRunModal(false)}
                width={'480px'}
                height={'auto'}>
          <div class="p-0 flex flex-col gap-5 dark:text-gray-200">
            <span class="text-xs text-gray-500 font-bold -mt-2 block">
              Select parameters below and manually run the pipeline
            </span>

            {/* SELEÇÃO DE PIPELINE VERSION (BRANCH) */}
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-black text-gray-700 dark:text-gray-300">Pipeline version</label>
              <div class="relative">
                <i class="fa-solid fa-code-branch absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <select 
                  value={selectedTargetBranch()}
                  onChange={(e) => setSelectedTargetBranch(e.currentTarget.value)}
                  class="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 appearance-none font-mono"
                >
                  <For each={props.repo.remoteBranches}>
                    {(item) => {
                      const cleanBranch = item.startsWith("origin/") ? item.replace("origin/", "") : item;
                      return <option value={cleanBranch}>{cleanBranch}</option>
                    }}
                  </For>
                </select>
                <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
              </div>
              <span class="text-[10px] text-gray-400 font-bold">Select the pipeline to run by branch, commit, or tag</span>
            </div>

            {/* ARTIFACTS / ADVANCED OPTIONS PLACEHOLDERS */}
            <div class="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-4">
              <div>
                <h4 class="text-xs font-black text-gray-700 dark:text-gray-300 mb-1">Pipeline artifacts</h4>
                <p class="text-[11px] text-gray-400 font-bold">No pipeline artifacts found.</p>
              </div>

              <div>
                <h4 class="text-xs font-black text-gray-700 dark:text-gray-300 mb-2">Advanced options</h4>
                <div class="border border-gray-300 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 text-xs font-bold overflow-hidden">
                  <div class="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                    <div>
                      <p class="text-gray-700 dark:text-gray-300 text-[11px]">Variables</p>
                      <p class="text-[10px] text-gray-400 normal-case font-normal">This pipeline has no defined variables</p>
                    </div>
                    <i class="fa-solid fa-chevron-right text-[10px] text-gray-400"></i>
                  </div>
                  <div class="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                    <div>
                      <p class="text-gray-700 dark:text-gray-300 text-[11px]">Stages to run</p>
                      <p class="text-[10px] text-gray-400 normal-case font-normal">Run as configured</p>
                    </div>
                    <i class="fa-solid fa-chevron-right text-[10px] text-gray-400"></i>
                  </div>
                </div>
              </div>
            </div>

            {/* SYSTEM DIAGNOSTICS CHECKBOX */}
            <label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600 dark:text-gray-400 select-none mt-1">
              <input 
                type="checkbox" 
                checked={enableDiagnostics()} 
                onChange={(e) => setEnableDiagnostics(e.currentTarget.checked)}
                class="accent-blue-500 w-3.5 h-3.5 rounded border-gray-300"
              />
              Enable system diagnostics
            </label>

            {/* FOOTER ACTIONS */}
            <div class="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-800 pt-4 mt-2">
              <button 
                onClick={() => setShowRunModal(false)}
                class="px-4 py-2 text-xs font-black rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmTriggerPipeline}
                class="px-4 py-2 text-xs font-black rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
              >
                Run
              </button>
            </div>
          </div>
        </Dialog>
      </Show>
    </div>
  );
}