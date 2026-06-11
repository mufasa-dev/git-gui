import { createResource, createSignal, For, Show, createMemo, createEffect } from "solid-js";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";
import { getRelativeTime } from "../../utils/date";
import { Repo } from "../../models/Repo.model";
import { useApp } from "../../context/AppContext";
import { GitProvider } from "../../utils/gitProvider";
import CommitMessage from "../ui/CommitMessage";
import { PipelineDefinition, UnifiedPipelineRun } from "../../models/Pipeline.model";

function PipelineStatusIcon(props: { status: string; result: string }) {
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

  const { t, locale } = useApp();
  const [sidebarWidth, setSidebarWidth] = createSignal(380);
  const [isResizing, setIsResizing] = createSignal(false);

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
          const pipeId = r.definition?.id || r.pipelineId || r.id;
          const pipeName = r.definition?.name || r.name;
          
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

  const [pipelineRuns, { refetch: refetchRuns }] = createResource<UnifiedPipelineRun[], { owner: string; name: string; pipeline: PipelineDefinition | null; currentProvider: GitProvider }>(
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

  const handleTriggerPipeline = async () => {
    const pipe = selectedPipeline();
    if (!pipe) return;
    console.log('pipe', pipe)

    const owner = repoOwner();
    const repoName = props.repo?.name;
    
    // Pegamos a branch atual selecionada no app ou um fallback padrão
    const currentBranch = "main"; 

    try {
      if (props.provider === "azure") {
        // No Azure, se o 'pipe.id' for o nome textual, você pode passar ele ou o ID mapeado
        await azureService.triggerPipelineRun(
          owner, 
          repoName, 
          pipe.id,
          currentBranch
        )
      } else {
        // No GitHub, passamos o arquivo padrão do workflow cadastrado ou o ID retornado
        const workflowFile = "main.yml"; // Ou pipe.id se você já listar os IDs reais de arquivos
        await githubService.triggerPipelineRun(owner, repoName, workflowFile, currentBranch);
      }

      // Feedback visual de sucesso (ex: Toast) se você tiver no projeto
      console.log("Pipeline disparada com sucesso!");

      // Dá um pequeno timeout maroto pro provedor registrar o run e atualiza a lista
      setTimeout(() => {
        refetchRuns();
      }, 1500);

    } catch (error) {
      console.error("Falha ao executar a pipeline:", error);
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
                    onClick={handleTriggerPipeline}
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
                
                {/* LISTAGEM DE RUNS COM AVATAR, GATILHO E ICONES CONDENSADOS */}
                <For each={filteredList()}>
                {(item) => {
                    const run = item as any;

                    const runDescription = createMemo(() => {
                    if (run.name && run.name !== selectedPipeline()?.name) {
                        return run.name;
                    }
                    return run.commit?.message || run.triggerInfo?.["ci.message"] || "Set up CI with Azure Pipelines";
                    });

                    // 2. CORREÇÃO DO AUTOR E TIPO DE GATILHO
                    const triggerDetails = createMemo(() => {
                    // Verifica se o Azure retornou informações de gatilho manual ou CI
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
                      const result = run.result?.toLowerCase() || '';
                      
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
                        {/* USANDO O STATUS TRATADO */}
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
                        {/* USANDO A DATA TRATADA */}
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
          />
        </Show>
      </div>
    </div>
  );
}

function RunDetailsPanel(props: { runId: any; repoOwner: string; repo: Repo; provider: GitProvider; fallbackRuns: any[] }) {
  const { locale, t } = useApp();
  const [dropdownOpen, setDropdownOpen] = createSignal(false);

  // Busca dados profundos da run selecionada
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

  // Trata o nome explicativo/descrição real da run vinda do Azure
  const runDescription = createMemo(() => {
    const run = runDetails();
    if (!run) return "Build Triggered";
    return run.commit?.message || run.triggerInfo?.["ci.message"] || "Set up CI with Azure Pipelines";
  });

  return (
    <Show when={!runDetails.loading} fallback={<div class="flex-1 flex items-center justify-center"><i class="fa-solid fa-spinner fa-spin text-xl text-blue-500"></i></div>}>
      <div class="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700/50 overflow-y-auto custom-scrollbar flex flex-col">
        
        {/* BANNER SUPERIOR ATUALIZADO (PADRÃO AZURE DEVOPS) */}
        <header class="p-6 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex items-start justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            {/* Ícone de status posicionado na esquerda do título */}
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

          {/* Grupo de botões reposicionado no canto superior direito */}
          <div class="flex items-center gap-2 shrink-0 relative">
            {/* Botão Condicional: Rerun se houver falha */}
            <Show when={runDetails().result?.toLowerCase() === 'failed' || runDetails().result?.toLowerCase() === 'failure'}>
              <button class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-black uppercase text-[9px] tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-sm">
                <i class="fa-solid fa-arrow-rotate-left"></i> Rerun failed jobs
              </button>
            </Show>

            {/* Botão Primário: Run New */}
            <button class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[9px] tracking-wider px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-600/10">
              <i class="fa-solid fa-play text-[8px]"></i> Run new
            </button>

            {/* Menu de contexto (...) */}
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
        <div class="p-6 grid grid-cols-3 gap-6 border-b dark:border-gray-700 text-xs bg-white dark:bg-gray-800">
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
                  <i class="fa-solid fa-code-commit mr-1.5 text-[10px]"></i>{(runDetails().commitId || runDetails().commit?.id).substring(0, 7)}
                </Show>
              </span>
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
    </Show>
  );
}