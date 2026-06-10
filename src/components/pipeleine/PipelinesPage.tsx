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
        const uniquePipes = Array.from(new Set(runs.map((r: any) => r.name)));
        return uniquePipes.map(name => ({ id: name, name: name, folder: "📂" }));
      }
      return [{ id: "github-actions", name: "GitHub Workflows", folder: "📂" }];
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

  const handleTriggerPipeline = () => {
    const pipe = selectedPipeline();
    if (!pipe) return;
    console.log(`Disparando nova execução para a pipeline: ${pipe.name}`);
    // Adicione aqui a chamada para disparar o run via tauri/azureService se houver
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
                      <span class="text-base">📁</span>
                      <div class="flex-1 min-w-0">
                        <h4 class="text-xs font-black truncate dark:text-gray-200">{pipe.name}</h4>
                        <span class="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Azure Build Pipeline</span>
                      </div>
                      <i class="fa-solid fa-chevron-right text-[9px] text-gray-400 pr-1"></i>
                    </div>
                  )}
                </For>
              }>
                
                {/* LISTAGEM DE RUNS COM AVATAR, GATILHO E ICONES CONDENSADOS */}
                <For each={filteredList()}>
                {(item) => {
                    const run = item as any; // Cast temporário para mapear propriedades profundas do Azure

                    // 1. CORREÇÃO DO NOME DA RUN (Pega a mensagem do commit ou fallback do Azure)
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

                    return (
                    <div 
                        class={`flex flex-col border rounded-xl p-3 mb-2 transition-all cursor-pointer
                                ${selectedRunId() === run.id ? 'bg-blue-500/10 border-blue-500/30' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                        onClick={() => setSelectedRunId(run.id)}
                    >
                        {/* Linha 1: ID, Mensagem Descritiva da Run e Ícone de Status */}
                        <div class="flex items-start justify-between gap-2 mb-1.5">
                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                            <span class="bg-gray-300/50 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold text-gray-600 dark:text-gray-300 shrink-0">
                            #{run.number}
                            </span>
                            <span 
                            class="text-xs font-black truncate dark:text-gray-200" 
                            title={runDescription()}
                            >
                            {runDescription()}
                            </span>
                        </div>
                        <PipelineStatusIcon status={run.status} result={run.result} />
                        </div>

                        {/* Linha 2: Informações de Contexto do Disparo (Gatilho + Avatar corrigido) */}
                        <div class="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase mb-2">
                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                            {/* Ícone ou Avatar Dinâmico do Usuário Real */}
                            <Show when={triggerDetails().avatar} fallback={
                            <i class={`text-[9px] text-gray-400 ${triggerDetails().isManual ? 'fa-solid fa-user' : 'fa-solid fa-code-commit'}`}></i>
                            }>
                            <img src={triggerDetails().avatar!} class="w-3.5 h-3.5 rounded-full border border-gray-400/30" />
                            </Show>
                            
                            <span class="truncate text-gray-400 dark:text-gray-400 normal-case">
                            <span class="font-bold text-gray-500 dark:text-gray-500">
                                {triggerDetails().label}
                            </span>
                            <span class="font-black text-gray-600 dark:text-gray-300">
                                {triggerDetails().authorName}
                            </span>
                            </span>
                        </div>
                        
                        <span class="font-mono text-[9px] text-gray-400 shrink-0 pl-1">
                            {getRelativeTime(run.startTime, t, locale())}
                        </span>
                        </div>

                        {/* Linha 3: Branch e Commit Id */}
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

  return (
    <Show when={!runDetails.loading} fallback={<div class="flex-1 flex items-center justify-center"><i class="fa-solid fa-spinner fa-spin text-xl text-blue-500"></i></div>}>
      <div class="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700/50 overflow-y-auto custom-scrollbar flex flex-col">
        
        {/* BANNER SUPERIOR DO AZURE */}
        <header class="p-6 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between">
          <div class="space-y-1 min-w-0 flex-1 pr-4">
            <div class="flex items-center gap-2 text-base font-black dark:text-white truncate">
              <span class="text-gray-400 font-mono">#{runDetails().number}</span>
              <span>•</span>
              <CommitMessage message={runDetails().commit?.message || "Build Triggered"} />
            </div>
            <div class="text-xs text-gray-500 font-bold flex items-center gap-2">
              <i class="fa-solid fa-circle text-[5px] text-gray-400"></i>
              <span>Pipeline: <span class="text-gray-700 dark:text-gray-300 font-black">{runDetails().name}</span></span>
            </div>
          </div>
          <PipelineStatusIcon status={runDetails().status} result={runDetails().result} />
        </header>

        {/* METADADOS EM GRID CARD */}
        <div class="p-6 grid grid-cols-3 gap-6 border-b dark:border-gray-700 text-xs">
          <div class="space-y-1.5">
            <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider">Autor do disparo</span>
            <div class="flex items-center gap-2">
              <Show when={runDetails().author?.avatarUrl} fallback={<div class="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[9px] text-white font-black">{runDetails().author?.name?.[0]}</div>}>
                <img src={runDetails().author.avatarUrl} class="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600" />
              </Show>
              <span class="font-bold dark:text-gray-200">{runDetails().author?.name}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider">Repositório e versão</span>
            <div class="font-bold dark:text-gray-200 flex flex-col gap-0.5">
              <span class="text-blue-500"><i class="fa-solid fa-book-bookmark mr-1.5 text-[10px]"></i>{props.repo?.name}</span>
              <span class="text-gray-500 font-mono text-[11px] truncate">
                <i class="fa-solid fa-code-branch mr-1.5 text-[10px]"></i>{runDetails().sourceBranch} 
                <Show when={runDetails().commit?.id}>
                  <span class="mx-1 text-gray-300">•</span>
                  <i class="fa-solid fa-code-commit mr-1.5 text-[10px]"></i>{runDetails().commit?.id}
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

        {/* CAIXA DE ERROS DO AZURE (Mapeado com ícones e cores vivas) */}
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

        {/* ÁRVORE DE STAGES & JOBS (Aparência do Console DevOps) */}
        <div class="mx-6 mb-6 flex-1 flex flex-col">
          <span class="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-3">Estágios e Jobs</span>
          <div class="border dark:border-gray-700/60 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/10 text-xs font-bold">
            
            {/* Cabeçalho do Stage */}
            <div class="flex items-center justify-between p-3 border-b dark:border-gray-700/50 bg-gray-100/60 dark:bg-gray-800/40">
              <div class="flex items-center gap-2">
                <i class={`fa-solid ${runDetails().result?.toLowerCase() === 'failed' ? 'fa-square-minus text-rose-400' : 'fa-square-check text-emerald-400'}`}></i>
                <span class="dark:text-white">Stage 1 (Build e Verificação)</span>
              </div>
            </div>

            {/* Linhas de Jobs Simuladas conforme o status */}
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

        {/* BARRA DE AÇÕES INFERIOR COM ACTIONS + DROPDOWN CONTEXTUAL */}
        <footer class="p-4 bg-gray-50 dark:bg-gray-900/30 border-t dark:border-gray-700/60 flex justify-end gap-2 relative">
          
          {/* Botão Condicional: Rerun se houver falha */}
          <Show when={runDetails().result?.toLowerCase() === 'failed' || runDetails().result?.toLowerCase() === 'failure'}>
            <button class="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-black uppercase text-[9px] tracking-wider px-3.5 py-2 rounded-xl transition-all">
              <i class="fa-solid fa-arrow-rotate-left"></i> Rerun failed jobs
            </button>
          </Show>

          {/* Botão Primário: Run New */}
          <button class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[9px] tracking-wider px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-600/10">
            <i class="fa-solid fa-play text-[8px]"></i> Run new
          </button>

          {/* Botão de Três Pontos (...) do Dropdown */}
          <div class="relative">
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen())}
              class="flex items-center justify-center bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 w-8 h-8 rounded-xl transition-all"
            >
              <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
            </button>

            {/* Menu Flutuante Absoluto (Dropdown Options) */}
            <Show when={dropdownOpen()}>
              <div class="absolute bottom-10 right-0 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1.5 z-50 text-xs font-bold text-gray-700 dark:text-gray-300 animate-in fade-in slide-in-from-bottom-2 duration-150">
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
              {/* Overlay invisível para fechar o dropdown ao clicar fora */}
              <div class="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
            </Show>
          </div>

        </footer>

      </div>
    </Show>
  );
}